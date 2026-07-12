import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#05060f',
        surface: '#0b0e1d',
        edge: 'rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
