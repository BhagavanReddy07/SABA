import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SABA — an AI assistant that remembers',
    short_name: 'SABA',
    description: 'Personal AI assistant with long-term memory',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    background_color: '#05060f',
    theme_color: '#7c3aed',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
