import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Tripwire — Your family’s counter-heist crew', short_name: 'Tripwire', description: 'Before the money moves.', start_url: '/', display: 'standalone', background_color: '#eeece4', theme_color: '#262923', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
