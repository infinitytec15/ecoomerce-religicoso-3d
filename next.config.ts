import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@maos-em-oracao/contracts'],
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: (process.env.IMAGE_HOSTS || '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean)
      .map((hostname) => ({ protocol: 'https' as const, hostname })),
  },
  experimental: { optimizePackageImports: ['@radix-ui/react-dialog', '@tanstack/react-query'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};
export default config;
