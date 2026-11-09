import { CatalogView } from '@/features/catalog/catalog-view';
import { getServerCatalog } from '@/lib/api/server';
export const metadata = { title: 'Meus favoritos', robots: { index: false, follow: false } };
export default async function Page() {
  return <CatalogView initialProducts={await getServerCatalog()} favoritesOnly />;
}
