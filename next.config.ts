import type { NextConfig } from 'next';
/**
 * Hosts the storefront needs: Mercado Pago card fields (SDK script, iframes, API calls), Bunny
 * (images and HLS from *.b-cdn.net, tus uploads, player embed) and YouTube embeds. Next's
 * hydration scripts are inline, hence 'unsafe-inline' for scripts (pages are cached, so no nonce).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://*.mlstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://*.b-cdn.net",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com https://*.mlstatic.com https://*.b-cdn.net https://video.bunnycdn.com",
  'frame-src https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com https://iframe.mediadelivery.net https://www.youtube-nocookie.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');
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
      {
        source: '/:path*',
        has: [{ type: 'host' as const, value: 'www.' + site.hostname }],
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
          // One year of HTTPS-only. No includeSubDomains/preload until every subdomain is HTTPS.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // Report-only first: browsers log what the policy would block without blocking it.
          // Enforce (rename to Content-Security-Policy) once the console shows no violations.
          { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
};
export default config;
