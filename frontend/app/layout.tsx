import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TRPCProvider } from '@/components/providers/TRPCProvider';
import { RegisterSW } from '@/lib/pwa/register-sw';

export const metadata: Metadata = {
  title: 'مساعد قانون المرور المصري',
  description: 'RAG Chatbot لقانون المرور المصري والغرامات والعقوبات',
  manifest: '/manifest.webmanifest'
};

export const viewport: Viewport = {
  themeColor: '#166534',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
