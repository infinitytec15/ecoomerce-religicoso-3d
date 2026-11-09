import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/layout/providers';
import '@/styles/globals.css';
const dmSans = localFont({
  src: [
    { path: '../../public/assets/fonts/dm-400.woff2', weight: '400' },
    { path: '../../public/assets/fonts/dm-500.woff2', weight: '500' },
    { path: '../../public/assets/fonts/dm-600.woff2', weight: '600' },
    { path: '../../public/assets/fonts/dm-700.woff2', weight: '700' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
});
const manrope = localFont({
  src: [
    { path: '../../public/assets/fonts/manrope-400.woff2', weight: '400' },
    { path: '../../public/assets/fonts/manrope-600.woff2', weight: '600' },
    { path: '../../public/assets/fonts/manrope-700.woff2', weight: '700' },
  ],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
});
const cormorant = localFont({
  src: [
    { path: '../../public/assets/fonts/cormorant-500.woff2', weight: '500' },
    { path: '../../public/assets/fonts/cormorant-600.woff2', weight: '600' },
    {
      path: '../../public/assets/fonts/cormorant-500-italic.woff2',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../../public/assets/fonts/cormorant-600-italic.woff2',
      weight: '600',
      style: 'italic',
    },
  ],
  variable: '--font-cormorant',
  display: 'swap',
  preload: false,
});
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'Mãos em Oração — A fé faz morada.', template: '%s · Mãos em Oração' },
  description:
    'Peças cristãs em impressão 3D para acolher o lar, presentear com significado e cultivar a fé. Conheça o Clube Cesta com Jesus.',
  applicationName: 'Mãos em Oração',
  icons: { icon: '/assets/brand-icon.png' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Mãos em Oração',
    images: [
      {
        url: '/assets/faith-home.webp',
        width: 1536,
        height: 1024,
        alt: 'Peças cristãs e Bíblia em um lar acolhedor',
      },
    ],
  },
};
export const viewport: Viewport = { themeColor: '#3e4934' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${manrope.variable} ${cormorant.variable}`}
    >
      <body>
        <a className="skip" href="#main">
          Pular para o conteúdo
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
