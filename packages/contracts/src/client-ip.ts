// Header the web BFF uses to tell the API which address made the request.
// The API only trusts it on requests that also carry the BFF shared secret.
export const CLIENT_IP_HEADER = 'x-meo-client-ip';

/**
 * Returns the client address appended by the nearest trusted reverse proxy
 * (Railway edge, Vercel), i.e. the right-most X-Forwarded-For entry. Entries to
 * its left come from the client and can be forged, so they are ignored.
 */
export function trustedForwardedIp(forwardedFor: string | null | undefined): string | undefined {
  const last = forwardedFor?.split(',').pop()?.trim().toLowerCase();
  if (!last || last.length > 45) return undefined;
  // IPv4, or IPv6 possibly with an IPv4 tail; brackets/ports are not expected here.
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(last) || /^[0-9a-f:.]*:[0-9a-f:.]*$/.test(last)
    ? last
    : undefined;
}
