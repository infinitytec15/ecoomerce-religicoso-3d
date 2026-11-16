import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createSeed } from '@/lib/demo/seed';
import { ReportCenter } from './report-center';

const h = vi.hoisted(() => ({ owner: false }));
vi.mock('./admin-frame', () => ({ useAdminData: () => createSeed() }));
vi.mock('./analytics', () => ({ AdminAnalytics: () => null }));
vi.mock('@/lib/api/query', () => ({ useSession: () => ({ data: { owner: h.owner } }) }));

describe('ReportCenter', () => {
  it('não oferece à equipe os relatórios que só o dono pode baixar', () => {
    h.owner = false;
    render(<ReportCenter />);
    expect(screen.getByRole('heading', { name: 'Edições do clube' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Histórico de alterações' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Equipe e acesso' })).toBeNull();
  });

  it('mostra equipe e histórico para o dono da loja', () => {
    h.owner = true;
    render(<ReportCenter />);
    expect(screen.getByRole('heading', { name: 'Histórico de alterações' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Equipe e acesso' })).toBeInTheDocument();
  });
});
