import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyBooks',
    short_name: 'MyBooks',
    description: 'Private multi-company bookkeeping',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1512',
    theme_color: '#1f8a4c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
