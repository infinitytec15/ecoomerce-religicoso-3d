import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR === '.next-http' ? '.next-http' : '.next',
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
  async redirects() {
    // Once the store has its own domain, send visitors of the generated Railway host to it:
    // the BFF only accepts mutations from the canonical origin. Railway health checks use
    // another host, so they keep reaching the service directly.
    const site = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : null;
    if (!site || site.protocol !== 'https:' || site.hostname.endsWith('.up.railway.app')) return [];
    return [
      {
        source: '/:path*',
        has: [{ type: 'host' as const, value: '.*\\.up\\.railway\\.app' }],
        destination: site.origin + '/:path*',
        permanent: true,
      },
    ];
  },
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
