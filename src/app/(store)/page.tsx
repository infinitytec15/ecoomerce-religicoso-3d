import { Home } from '@/features/catalog/home';
import { getServerCatalog, getServerSettings } from '@/lib/api/server';
export default async function Page() {
  const [products, settings] = await Promise.all([getServerCatalog(), getServerSettings()]);
  return <Home products={products} settings={settings} />;
}
