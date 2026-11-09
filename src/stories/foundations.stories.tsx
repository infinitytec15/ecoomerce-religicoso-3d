import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { StatusBadge } from '@/components/ui/status-badge';
import { Icon } from '@/components/ui/icon';
const meta = {
  title: 'Essência/Fundamentos',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'Sistema aprovado da Mãos em Oração. Creme, oliva, terracota; Cormorant para a voz da marca e DM Sans para leitura e operação.',
      },
    },
  },
  args: { children: 'Encontre sua peça de fé' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Principal: Story = {};
export const Secundario: Story = {
  args: { variant: 'secondary', children: 'Continuar explorando' },
};
export const Aguardando: Story = { args: { loading: true, children: 'Salvando sua escolha' } };
export const Desabilitado: Story = { args: { disabled: true, children: 'Escolha uma opção' } };
export const AcaoDestrutiva: Story = {
  args: { variant: 'danger', children: 'Cancelar assinatura' },
};
export const Marca: Story = {
  render: () => (
    <div style={{ padding: 32 }}>
      <Logo />
    </div>
  ),
};
export const CoresETipografia: Story = {
  render: () => (
    <div className="stack" style={{ maxWidth: 800 }}>
      <h1>
        A fé faz <em>morada.</em>
      </h1>
      <p>Peças cristãs em 3D para acolher seu lar e tocar o coração de quem você ama.</p>
      <div className="row wrap">
        {[
          ['Creme', '#faf9f5'],
          ['Oliva', '#3e4934'],
          ['Terracota', '#aa5438'],
          ['Texto', '#282c25'],
        ].map(([name, color]) => (
          <div key={name}>
            <div
              style={{
                width: 110,
                height: 80,
                background: color,
                border: '1px solid #deded4',
                borderRadius: 10,
              }}
            />
            <p>
              {name}
              <br />
              <code>{color}</code>
            </p>
          </div>
        ))}
      </div>
      <div className="row wrap">
        <Icon name="heart" />
        <Icon name="cross" />
        <Icon name="book" />
        <Icon name="pix" />
        <Icon name="truck" />
      </div>
    </div>
  ),
};
export const Situacoes: Story = {
  render: () => (
    <div className="row wrap">
      {[
        'Ativa',
        'Pausada',
        'Pagamento pendente',
        'Cancelada',
        'Confirmado',
        'Em produção',
        'Pronto para envio',
        'Enviado',
        'Entregue',
        'Pago',
        'Pendente',
        'Recusado',
        'Estornado',
        'Aberto',
        'Em atendimento',
        'Resolvido',
      ].map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
