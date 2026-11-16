import { Home } from '@/features/catalog/home';
import {
  getServerCatalog,
  getServerGroupBuys,
  getServerSettings,
  getServerStories,
} from '@/lib/api/server';
export default async function Page() {
  const [products, settings, feed, groupBuys] = await Promise.all([
    getServerCatalog(),
    getServerSettings(),
    getServerStories(),
    // The campaigns are a home section, not the page: an API failure only hides them.
    getServerGroupBuys().catch(() => []),
  ]);
  return <Home products={products} settings={settings} feed={feed} groupBuys={groupBuys} />;
}
