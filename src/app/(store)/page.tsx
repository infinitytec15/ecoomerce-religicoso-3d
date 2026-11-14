import { Home } from '@/features/catalog/home';
import { getServerCatalog, getServerSettings, getServerStories } from '@/lib/api/server';
export default async function Page() {
  const [products, settings, stories] = await Promise.all([
    getServerCatalog(),
    getServerSettings(),
    getServerStories(),
  ]);
  return <Home products={products} settings={settings} stories={stories} />;
}
