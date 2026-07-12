import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  title: 'SABA — an AI assistant that remembers',
  description:
    'Personal AI assistant with a 3-tier memory architecture: Redis working memory, Postgres episodic memory, and Pinecone semantic recall.',
};

// Runs before hydration so light/system users never see a flash of the dark theme.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('saba-theme')||'system';var dark=t==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:t==='dark';if(!dark)document.documentElement.classList.add('light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
        {children}
      </body>
    </html>
  );
}
