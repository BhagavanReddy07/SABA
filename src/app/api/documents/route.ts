import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listDocuments } from '@/server/db';
import { MAX_DOC_BYTES, ingestDocument, isSupportedDocument } from '@/server/documents';
import { badRequest, handle, limit } from '@/server/http';

export const maxDuration = 60;

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ documents: await listDocuments(user.id) });
});

/** Upload (multipart, field "file"): PDF, TXT or Markdown → searchable, citable document memory. */
export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  await limit(`upload:${user.id}`, 30, 86_400);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return badRequest('Attach a file in the "file" field');
  if (file.size > MAX_DOC_BYTES) return badRequest('Files must be under 4 MB');
  if (!isSupportedDocument(file.name, file.type)) return badRequest('Supported: PDF, TXT, Markdown, CSV, JSON');

  try {
    const result = await ingestDocument(user.id, {
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(result);
  } catch (err) {
    return badRequest((err as Error).message || 'Could not read that file');
  }
});
