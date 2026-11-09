import { CatalogView } from '@/features/catalog/catalog-view';
import { getServerCatalog } from '@/lib/api/server';
export const metadata = { title: 'Peças de fé' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams,
    value = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : undefined),
    max = Number(value('preco'));
  return (
    <CatalogView
      initialProducts={await getServerCatalog()}
      query={{
        search: value('busca'),
        category: value('categoria'),
        color: value('cor'),
        sort: value('ordem'),
        occasion: value('ocasiao'),
        maxCents: max > 0 && Number.isFinite(max) ? max : undefined,
      }}
    />
  );
}
