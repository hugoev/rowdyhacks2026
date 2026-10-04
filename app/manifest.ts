import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Tripwire — the safety teller', short_name: 'Tripwire', description: 'AI made this scam possible. Now AI calls your grandson.', start_url: '/', display: 'standalone', background_color: '#F5F1EA', theme_color: '#1E1E1E', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
