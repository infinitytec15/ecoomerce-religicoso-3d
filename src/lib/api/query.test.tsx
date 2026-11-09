import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommerceProvider, useCatalog, useSettings } from './query';
import { DemoGateway } from '@/lib/demo/gateway';
import { MemoryDemoStorage } from '@/lib/demo/storage';
import { createSeed, seedCatalog, seedSettings } from '@/lib/demo/seed';
it('refreshes server fixtures from the persisted operation on first mount', async () => {
  const state = createSeed();
  state.products[0].priceCents = 17990;
  state.settings.priceCents = 18990;
  const gateway = new DemoGateway(new MemoryDemoStorage(state));
  function Store() {
    const catalog = useCatalog(seedCatalog),
      settings = useSettings(seedSettings);
    return (
      <p>
        {catalog.data?.[0].priceCents} / {settings.data?.priceCents}
      </p>
    );
  }
  render(
    <CommerceProvider gateway={gateway}>
      <Store />
    </CommerceProvider>,
  );
  expect(await screen.findByText('17990 / 18990')).toBeVisible();
});
