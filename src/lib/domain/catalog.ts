import type { CatalogQuery, Product } from './types';
export const occasions: Record<string, { title: string; description: string; ids: string[] }> = {
  oracao: {
    title: 'Um lugar para conversar com Deus.',
    description: 'Pequenos símbolos para o seu encontro diário com a fé.',
    ids: ['cruz-essencial', 'biblia-viva', 'espirito-santo'],
  },
  batismo: {
    title: 'A fé floresce em um novo começo.',
    description: 'Lembranças de acolhimento, esperança e novos caminhos.',
    ids: ['espirito-santo', 'cruz-essencial', 'nossa-senhora'],
  },
  casamento: {
    title: 'O amor faz casa. A fé faz morada.',
    description: 'Peças que celebram o cuidado e a vida compartilhada.',
    ids: ['sagrada-familia', 'palavra-fe', 'cruz-essencial'],
  },
  presentear: {
    title: 'Um abraço em forma de presente.',
    description: 'Para quem compartilha a caminhada da fé com você.',
    ids: [],
  },
};
export function filterProducts(products: Product[], query: CatalogQuery) {
  const occasion = occasions[query.occasion as keyof typeof occasions];
  let list = products.filter(
    (p) =>
      p.active &&
      (!query.category ||
        query.category === 'Todos' ||
        p.tags.includes(query.category as Product['category'])) &&
      (!query.search ||
        (p.name + ' ' + p.description + ' ' + p.category)
          .toLocaleLowerCase('pt-BR')
          .includes(query.search.toLocaleLowerCase('pt-BR'))) &&
      (!query.color || query.color === 'Todos' || p.colors.includes(query.color)) &&
      (!query.maxCents || p.priceCents <= query.maxCents) &&
      (!occasion || !occasion.ids.length || occasion.ids.includes(p.id)),
  );
  if (query.sort === 'low') list = list.toSorted((a, b) => a.priceCents - b.priceCents);
  if (query.sort === 'high') list = list.toSorted((a, b) => b.priceCents - a.priceCents);
  if (query.sort === 'name') list = list.toSorted((a, b) => a.name.localeCompare(b.name));
  return list;
}
