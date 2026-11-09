import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminFrame } from '@/features/admin/admin-frame';
import { AdminSubscriptions } from '@/features/admin/subscriptions';
import { AdminCustomers } from '@/features/admin/customers';
import { AdminShipping } from '@/features/admin/production';
import { AdminFinance } from '@/features/admin/finance';
import { AdminProducts, AdminEditions, AdminSettings, AdminTeam } from '@/features/admin/catalog';
import {
  AdminSupport,
  AdminCommunity,
  AdminMarketing,
  AdminReports,
  AdminActivity,
} from '@/features/admin/service';
const meta = {
  title: 'Gestão/Módulos',
  parameters: {
    layout: 'fullscreen',
    commerceSession: 'admin',
    docs: {
      description: {
        component:
          'Módulos completos do administrador com formulários, filtros, tabelas, estados e dados demonstrativos. Sem comunicações nem movimentações financeiras reais.',
      },
    },
  },
  decorators: [
    (Story) => (
      <AdminFrame>
        <Story />
      </AdminFrame>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Assinaturas: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/assinaturas' } } },
  render: () => <AdminSubscriptions />,
};
export const Clientes: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/clientes' } } },
  render: () => <AdminCustomers />,
};
export const Expedicao: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/expedicao' } } },
  render: () => <AdminShipping />,
};
export const Financeiro: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/financeiro' } } },
  render: () => <AdminFinance />,
};
export const ProdutosEEstoque: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/produtos' } } },
  render: () => <AdminProducts />,
};
export const EdicaoMensal: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/edicoes' } } },
  render: () => <AdminEditions />,
};
export const Atendimentos: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/suporte' } } },
  render: () => <AdminSupport />,
};
export const ModeracaoDoMural: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/comunidade' } } },
  render: () => <AdminCommunity />,
};
export const OracaoDiaria: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/marketing' } } },
  render: () => <AdminMarketing />,
};
export const Relatorios: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/relatorios' } } },
  render: () => <AdminReports />,
};
export const EquipeEPerfis: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/equipe' } } },
  render: () => <AdminTeam />,
};
export const Configuracoes: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/configuracoes' } } },
  render: () => <AdminSettings />,
};
export const Auditoria: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/atividade' } } },
  render: () => <AdminActivity />,
};
