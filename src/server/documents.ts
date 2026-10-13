// Document memory: a PDF / text / Markdown file becomes page-aware chunks in Postgres (full-text
// searchable) and Tier 3 vectors (`doc-<id>-<n>`), so recall and search_memory can cite it.

import { extractText } from 'unpdf';
import type { Doc } from '@/lib/types';
import { createDocument, deleteDocument } from './db';
import { embedMany } from './llm';
import { removeVectors, upsertVectors, vectorStore } from './memory/vectors';

export const MAX_DOC_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB
const CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 150;
const MAX_CHUNKS = 300;
const TEXT_TYPES = /\.(txt|md|markdown|csv|json)$/i;

export function isSupportedDocument(name: string, mime: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(name) || mime.startsWith('text/') || TEXT_TYPES.test(name);
}

/** Splits page texts into ~1,200-char chunks on paragraph/sentence boundaries, with overlap. */
export function chunkPages(pages: string[]): { page: number | null; content: string }[] {
  const chunks: { page: number | null; content: string }[] = [];
  pages.forEach((raw, p) => {
    const text = raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    let start = 0;
    while (start < text.length && chunks.length < MAX_CHUNKS) {
      let end = Math.min(start + CHUNK_CHARS, text.length);
      if (end < text.length) {
        const window = text.slice(start + CHUNK_CHARS / 2, end);
        const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'));
        if (cut > 0) end = start + CHUNK_CHARS / 2 + cut + 1;
      }
      const content = text.slice(start, end).trim();
      if (content.length > 20) chunks.push({ page: pages.length > 1 ? p + 1 : null, content });
      if (end >= text.length) break;
      start = Math.max(end - OVERLAP_CHARS, start + 1);
    }
  });
  return chunks;
}

export async function ingestDocument(
  userId: string,
  file: { name: string; mime: string; bytes: Uint8Array }
): Promise<{ doc: Doc; indexed: boolean }> {
  const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(file.name);
  let pages: string[];
  if (isPdf) {
    const { text } = await extractText(new Uint8Array(file.bytes), { mergePages: false });
    pages = text;
  } else {
    pages = [new TextDecoder('utf-8', { fatal: false }).decode(file.bytes)];
  }
  const chunks = chunkPages(pages);
  if (!chunks.length) {
    throw new Error(isPdf ? 'No text found — scanned PDFs (images of text) are not supported.' : 'The file is empty.');
  }

  const doc = await createDocument(
    userId,
    { name: file.name.slice(0, 200), mime: isPdf ? 'application/pdf' : file.mime || 'text/plain', size: file.bytes.length, pages: isPdf ? pages.length : null },
    chunks
  );

  let indexed = false;
  if (await vectorStore()) {
    try {
      const values = await embedMany(chunks.map((c) => c.content));
      await upsertVectors(
        chunks.map((_, i) => ({ id: `doc-${doc.id}-${i}`, userId, kind: 'doc', documentId: doc.id, values: values[i] }))
      );
      indexed = true;
    } catch (err) {
      console.warn('[documents] embedding failed (full-text search still works):', (err as Error).message);
    }
  }
  return { doc, indexed };
}

export async function removeDocument(userId: string, id: string): Promise<boolean> {
  const chunks = await deleteDocument(id, userId);
  if (chunks === null) return false;
  await removeVectors(Array.from({ length: chunks }, (_, i) => `doc-${id}-${i}`));
  return true;
}
