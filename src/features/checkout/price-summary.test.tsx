import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceSummary } from './price-summary';

const quote = {
  id: 'q1',
  label: 'PAC',
  cents: 2435,
  estimate: 'Chega em até 12 dias úteis · 5 de produção + 7 de transporte',
  productionDays: 5,
  transitDays: 7,
  totalDays: 12,
};

describe('PriceSummary delivery time', () => {
  it('shows production plus transport for the chosen carrier', () => {
    render(<PriceSummary items={[]} shippingCents={2435} deliveryQuote={quote} />);
    expect(screen.getByText('até 12 dias úteis')).toBeInTheDocument();
    expect(screen.getByText('5 dias de produção + 7 de transporte')).toBeInTheDocument();
  });

  it('falls back to the quote text from an older API', () => {
    const old = { id: quote.id, label: quote.label, cents: quote.cents, estimate: quote.estimate };
    render(<PriceSummary items={[]} shippingCents={2435} deliveryQuote={old} />);
    expect(screen.getByText(old.estimate)).toBeInTheDocument();
  });

  it('hides the deadline until the shipping is quoted', () => {
    render(<PriceSummary items={[]} shippingCents={0} shippingPending deliveryQuote={quote} />);
    expect(screen.queryByText(/dias úteis/)).toBeNull();
  });
});
