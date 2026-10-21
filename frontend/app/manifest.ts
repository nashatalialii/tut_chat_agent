import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'مساعد قانون المرور المصري',
    short_name: 'Traffic RAG',
    description: 'مساعد ذكي لقانون المرور المصري والغرامات والعقوبات',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#166534',
    dir: 'rtl',
    lang: 'ar',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  };
}
