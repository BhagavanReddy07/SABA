import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  title: 'SABA — an AI assistant that remembers',
  description:
    'Personal AI assistant with long-term memory: Redis working memory, Postgres episodic facts, and semantic recall (Pinecone or pgvector) — with cited answers, reminders and a memory you can see.',
  applicationName: 'SABA',
  appleWebApp: { capable: true, title: 'SABA', statusBarStyle: 'black' },
};

export const viewport: Viewport = { themeColor: '#7c3aed' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
