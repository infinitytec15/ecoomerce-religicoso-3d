import { describe, it, expect } from 'vitest';
import { DemoGateway } from './gateway';
import { MemoryDemoStorage } from './storage';
import { createSeed, DEMO_EMAIL, DEMO_PASSWORD } from './seed';
const staff = { email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' as const };
const customer = { email: 'ana@exemplo.com', password: 'senha-1234', kind: 'customer' as const };
const save = (patch: Record<string, unknown> = {}) =>
  ({
    type: 'crm.contact.save',
    email: 'novo@exemplo.com',
    name: 'Novo',
    tags: ['X'],
    ...patch,
  }) as never;
const campaign = (patch: Record<string, unknown> = {}) =>
  ({
    type: 'crm.campaign.save',
    campaign: {
      name: 'Novidades de novembro',
      subject: 'Chegaram as novidades',
      previewText: '',
      segment: { rules: [] },
      blocks: [{ type: 'text', style: 'paragraph', text: 'Olá!' }],
      ...patch,
    },
  }) as never;
const setup = async () => {
  const g = new DemoGateway(new MemoryDemoStorage());
  await g.login(staff);
  return g;
};
describe('demo CRM', () => {
  it('seeds one eligible contact per demo customer, one imported tag and a sent campaign', async () => {
    const seed = createSeed(),
      g = await setup(),
      { crm } = await g.admin(),
      page = await g.crmContacts();
    expect(page.items.length).toBe(seed.clients.length + 1);
    expect(page.items.every((c) => c.eligible)).toBe(true);
    expect(crm.totals).toEqual({
      contacts: seed.clients.length + 1,
      eligible: seed.clients.length + 1,
      unsubscribed: 0,
    });
    expect(crm.tags).toEqual([{ tag: 'Paróquia São José', count: 1 }]);
    expect(crm.campaigns).toHaveLength(1);
    expect(crm.campaigns[0]).toMatchObject({
      state: 'Enviada',
      metrics: {
        audience: 3,
        sent: 3,
        delivered: 3,
        opened: 2,
        clicked: 1,
        bounced: 0,
        unsubscribed: 0,
        cancelled: 0,
      },
    });
  });
  it('counts a saved contact in the tag preview and ignores other rules', async () => {
    const g = await setup();
    expect((await g.crmPreview({ rules: [{ type: 'tag', tag: 'X' }] })).total).toBe(0);
    await g.adminCommand(save());
    expect(await g.crmPreview({ rules: [{ type: 'tag', tag: 'X' }] })).toEqual({
      total: 1,
      consent: 1,
      legitimateInterest: 0,
    });
    const all = await g.crmPreview({ rules: [{ type: 'club' }] });
    expect(all.total).toBe((await g.admin()).crm.totals.eligible);
  });
  it('filters contacts by text and tag and refreshes tags and totals', async () => {
    const g = await setup();
    await g.adminCommand(save());
    expect((await g.crmContacts({ q: 'NOVO' })).items.map((c) => c.email)).toEqual([
      'novo@exemplo.com',
    ]);
    expect((await g.crmContacts({ tag: 'X' })).items).toHaveLength(1);
    expect((await g.admin()).crm.tags.find((t) => t.tag === 'X')?.count).toBe(1);
    await g.adminCommand({ type: 'crm.contact.unsubscribe', email: 'NOVO@exemplo.com' });
    expect((await g.crmPreview({ rules: [{ type: 'tag', tag: 'X' }] })).total).toBe(0);
    expect((await g.admin()).crm.totals.unsubscribed).toBe(1);
  });
  it('imports a chunk, keeps unsubscribed contacts out and reports the counts', async () => {
    const g = await setup();
    await g.adminCommand(save({ email: 'saiu@exemplo.com', tags: [] }));
    await g.adminCommand({ type: 'crm.contact.unsubscribe', email: 'saiu@exemplo.com' });
    const result = await g.crmImport({
      tag: 'Grupo',
      consent: true,
      rows: [
        { email: 'a@exemplo.com', name: 'A' },
        { email: 'novo@exemplo.com', name: '' },
        { email: 'saiu@exemplo.com', name: '' },
      ],
    });
    expect(result).toEqual({ created: 2, updated: 0, keptUnsubscribed: 1 });
    expect((await g.crmPreview({ rules: [{ type: 'tag', tag: 'Grupo' }] })).total).toBe(2);
    const again = await g.crmImport({
      tag: 'Grupo',
      consent: true,
      rows: [{ email: 'a@exemplo.com', name: 'A' }],
    });
    expect(again).toEqual({ created: 0, updated: 1, keptUnsubscribed: 0 });
  });
  it('walks the campaign states locally', async () => {
    const g = await setup();
    await g.adminCommand(campaign());
    let list = (await g.admin()).crm.campaigns;
    const id = list[0].id;
    expect(list[0].state).toBe('Rascunho');
    await g.adminCommand({ type: 'crm.campaign.test', id, extra: ['teste@exemplo.com'] });
    expect((await g.admin()).crm.campaigns[0].state).toBe('Rascunho');
    await g.adminCommand({ type: 'crm.campaign.schedule', id, at: null });
    list = (await g.admin()).crm.campaigns;
    expect(list[0].state).toBe('Agendada');
    await g.adminCommand({ type: 'crm.campaign.cancel', id });
    expect((await g.admin()).crm.campaigns[0].state).toBe('Cancelada');
    await g.adminCommand({ type: 'crm.campaign.delete', id });
    expect((await g.admin()).crm.campaigns.find((c) => c.id === id)).toBeUndefined();
  });
  it('accepts non-UUID demo ids in blocks but still validates the rest', async () => {
    const g = await setup();
    await g.adminCommand(
      campaign({
        blocks: [
          { type: 'image', assetId: '/assets/stories/bastidores.webp', alt: '' },
          { type: 'products', productIds: [createSeed().products[0].id] },
        ],
      }),
    );
    await expect(g.adminCommand(campaign({ subject: '' }))).rejects.toBeDefined();
    await expect(
      g.adminCommand(campaign({ blocks: [{ type: 'products', productIds: ['a', 'a'] }] })),
    ).rejects.toBeDefined();
  });
  it('requires the marketing permission for the CRM reads and commands', async () => {
    const g = new DemoGateway(new MemoryDemoStorage());
    await expect(g.crmContacts()).rejects.toBeDefined();
    await g.login(customer);
    await expect(g.crmPreview({ rules: [] })).rejects.toMatchObject({ status: 403 });
  });
  it('lets a customer read and change their own subscription', async () => {
    const g = new DemoGateway(new MemoryDemoStorage());
    await expect(g.marketingStatus()).rejects.toBeDefined();
    await g.login(customer);
    expect((await g.marketingStatus()).subscribed).toBe(true);
    await g.setMarketing(false);
    expect((await g.marketingStatus()).subscribed).toBe(false);
    await g.setMarketing(true);
    expect((await g.marketingStatus()).subscribed).toBe(true);
  });
  it('records consent on registration only with marketingOptIn', async () => {
    const g = new DemoGateway(new MemoryDemoStorage());
    await g.login({
      ...customer,
      email: 'fulana.nova@exemplo.net',
      register: true,
      name: 'Nova Pessoa',
    });
    expect((await g.marketingStatus()).subscribed).toBe(false);
    await g.logout();
    await g.login({
      ...customer,
      email: 'fulana.outra@exemplo.net',
      register: true,
      name: 'Outra Pessoa',
      marketingOptIn: true,
    });
    expect((await g.marketingStatus()).subscribed).toBe(true);
  });
  it('unsubscribes by the contact token in the demo', async () => {
    const g = await setup(),
      contact = (await g.crmContacts({ q: 'ana@exemplo.com' })).items[0];
    await g.marketingUnsubscribe({ token: contact.id });
    expect((await g.crmContacts({ q: 'ana@exemplo.com' })).items[0].unsubscribedAt).not.toBeNull();
  });
});
