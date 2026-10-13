import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * SABA logo: brand-gradient tile with lucide's "sparkles" glyph (the icon used across the app).
 * `radius` and `glyph` are fractions of `px`. Lives here because route files may only export handlers.
 */
export function logo({ px, radius, glyph, bare = false }: { px: number; radius: number; glyph: number; bare?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: px * radius,
        // `bare`: glyph only on transparent — Android tints notification badges by alpha alone.
        ...(!bare && { backgroundImage: 'linear-gradient(135deg, #7c3aed, #c026d3, #06b6d4)' }),
      }}
    >
      {/* Star filled for weight at small sizes; the open "+" accents only take the stroke. */}
      <svg
        width={px * glyph}
        height={px * glyph}
        viewBox="0 0 24 24"
        fill="#fff"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4M22 5h-4M4 17v2M5 18H3" />
      </svg>
    </div>
  );
}

// Full-bleed square: iOS applies its own rounded mask.
export default function AppleIcon() {
  return new ImageResponse(logo({ px: 180, radius: 0, glyph: 0.6 }), size);
}
