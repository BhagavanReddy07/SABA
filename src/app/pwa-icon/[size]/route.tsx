import { ImageResponse } from 'next/og';
import { logo } from '@/app/apple-icon';

// Manifest icons. The maskable one is full-bleed with the glyph (reach ≈ 0.55 of its box from
// center) well inside the 80% safe-zone circle. A Map, so '/pwa-icon/constructor' is a 404 too.
const VARIANTS = new Map([
  ['192', { px: 192, radius: 0.22, glyph: 0.6 }],
  ['512', { px: 512, radius: 0.22, glyph: 0.6 }],
  ['512-maskable', { px: 512, radius: 0, glyph: 0.5 }],
  ['badge', { px: 96, radius: 0, glyph: 0.8, bare: true }],
]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }): Promise<Response> {
  const variant = VARIANTS.get((await params).size);
  if (!variant) return new Response('Not found', { status: 404 });
  return new ImageResponse(logo(variant), {
    width: variant.px,
    height: variant.px,
    headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
  });
}
