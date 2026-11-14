/** Absolute public URL of a group-buy campaign page, for sharing. */
export const groupBuyUrl = (id: string) =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '') +
  '/compra-coletiva/' +
  encodeURIComponent(id);
