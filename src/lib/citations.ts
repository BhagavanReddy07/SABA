// Memory citations in replies: [M1] facts, [P2] past moments, [D3] documents — also grouped
// forms some models prefer ([M1, M2], [M1; P3]) and the CJK lenticular brackets some use (【M1】).

const CITATION = /\s?[[【]((?:[MPD]\d+)(?:\s*[,;]\s*[MPD]\d+)*)[\]】]/g;

/** Refs cited in `text`, in order of first appearance. */
export function citedRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(CITATION)) for (const ref of match[1].split(/\s*[,;]\s*/)) refs.add(ref);
  return [...refs];
}

/** For plain-text surfaces (Telegram, share pages, read-aloud). */
export function stripCitations(text: string): string {
  return text.replace(CITATION, '');
}

/** Rewrites each citation as markdown links `[M1](#cite:M1)` so the renderer can turn them into chips. */
export function linkCitations(text: string, known: Set<string>): string {
  return text.replace(CITATION, (whole, group: string) => {
    const refs = group.split(/\s*[,;]\s*/).filter((r) => known.has(r));
    return refs.length ? ` ${refs.map((r) => `[${r}](#cite:${r})`).join('')}` : '';
  });
}
