import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProductCard } from '@/features/catalog/product-card';
import { ProductDetail } from '@/features/catalog/product-detail';
import { CatalogView } from '@/features/catalog/catalog-view';
import { PriceSummary } from '@/features/checkout/price-summary';
import { Steps } from '@/components/ui/steps';
import { seedCatalog } from '@/lib/demo/seed';
import { cartLine } from '@/lib/domain/commerce';
const meta = {
  title: 'Loja/Produto',
  component: ProductCard,
  args: { product: seedCatalog[0] },
  parameters: {
    docs: {
      description: {
        component:
          'Componentes reais da loja. Todas as interações usam uma operação isolada em memória; nenhum pagamento é realizado.',
      },
    },
  },
} satisfies Meta<typeof ProductCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CruzEssencial: Story = {
  render: (args) => (
    <div style={{ width: 290 }}>
      <ProductCard {...args} />
    </div>
  ),
};
export const Personalizado: Story = {
  args: { product: seedCatalog.find((p) => p.id === 'palavra-fe')! },
  render: (args) => (
    <div style={{ width: 290 }}>
      <ProductCard {...args} />
    </div>
  ),
};
export const PaginaDoProduto: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <ProductDetail initialProduct={seedCatalog[0]} initialCatalog={seedCatalog} />,
};
export const Catalogo: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <CatalogView initialProducts={seedCatalog} />,
};
export const BuscaSemResultados: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <CatalogView initialProducts={seedCatalog} query={{ search: 'Peça inexistente' }} />
  ),
};
export const ResumoComCupom: Story = {
  render: () => (
    <div style={{ maxWidth: 440 }}>
      <PriceSummary
        items={[cartLine(seedCatalog[0]), cartLine(seedCatalog[3], 2)]}
        shippingCents={1890}
        coupon="PRIMEIRAFE"
      />
    </div>
  ),
};
export const EtapasDoCheckout: Story = {
  render: () => (
    <div className="stack" style={{ maxWidth: 750 }}>
      {[0, 1, 2].map((current) => (
        <Steps key={current} items={['Seus dados', 'Entrega', 'Pagamento']} current={current} />
      ))}
    </div>
  ),
};
