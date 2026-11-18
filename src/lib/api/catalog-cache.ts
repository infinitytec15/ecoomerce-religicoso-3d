import { revalidateTag } from 'next/cache';
/**
 * Expires the storefront's cached catalog reads after an admin change.
 * The change already happened upstream: a cache failure must not turn it into an error.
 */
export function expireCatalog() {
  try {
    revalidateTag('catalog', { expire: 0 });
  } catch (error) {
    console.warn('Cache da vitrine não foi renovado:', (error as Error | null)?.message);
  }
}
