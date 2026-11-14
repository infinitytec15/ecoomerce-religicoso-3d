import { describe, it, expect } from 'vitest';
import { storiesFor } from '@maos-em-oracao/contracts';
import { DemoGateway } from './gateway';
import { BrowserDemoStorage, MemoryDemoStorage } from './storage';
import { createSeed, DEMO_EMAIL, DEMO_PASSWORD } from './seed';

const staff = { email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' as const };
const highlight = (patch: Record<string, unknown> = {}) =>
  ({
    type: 'story.save',
    title: 'Novo destaque',
    coverAssetId: 'capa-1',
    active: true,
    placements: ['home'],
    categories: [],
    ...patch,
  }) as never;
const video = (highlightId: string, patch: Record<string, unknown> = {}) =>
  ({
    type: 'story.video.save',
    highlightId,
    assetId: 'arquivo-1',
    caption: 'Legenda',
    productIds: [],
    active: true,
    ...patch,
  }) as never;
const withAdmin = async (g: DemoGateway) => {
  await g.login(staff);
  return async () => (await g.admin()).stories;
};

describe('demo stories', () => {
  it('lists the demo highlight with its two videos and filters by product', async () => {
    const g = new DemoGateway(),
      list = await g.stories();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'destaque-demo',
      title: 'Bastidores',
      coverUrl: '/assets/stories/bastidores.webp',
      placements: ['home', 'product', 'category'],
      categories: ['Presentes'],
    });
    expect(list[0].videos.map((v) => v.id)).toEqual(['video-demo-1', 'video-demo-2']);
    expect(list[0].videos[1].source).toEqual({
      type: 'file',
      src: '/assets/stories/oficina-2.mp4',
    });
    const [, second] = createSeed().products;
    const forProduct = storiesFor(list, { place: 'product', productId: second.id });
    expect(forProduct[0].videos.map((v) => v.id)).toEqual(['video-demo-2']);
    expect(JSON.stringify(list)).not.toMatch(/views|clicks|assetId/);
  });

  it('drops an archived product from the video but keeps the video', async () => {
    const g = new DemoGateway();
    await g.login(staff);
    const [first, second] = createSeed().products;
    await g.adminCommand({ type: 'product.archive', id: second.id });
    const videos = (await g.stories())[0].videos;
    expect(videos[1].products.map((p) => p.id)).toEqual([first.id]);
  });

  it('counts views and clicks, ignoring unknown videos', async () => {
    const g = new DemoGateway(),
      stories = await withAdmin(g);
    await g.storyEvent({ videoId: 'video-demo-1', type: 'view' });
    await g.storyEvent({ videoId: 'video-demo-1', type: 'click' });
    await g.storyEvent({ videoId: 'nao-existe', type: 'view' });
    const [v1, v2] = (await stories())[0].videos;
    expect(v1).toMatchObject({ views: 1, clicks: 1, status: 'ready' });
    expect(v2).toMatchObject({ views: 0, clicks: 0 });
  });

  it('requires a category when the highlight appears in category pages', async () => {
    const g = new DemoGateway();
    await g.login(staff);
    await expect(
      g.adminCommand(highlight({ placements: ['category'], categories: [] })),
    ).rejects.toMatchObject({ code: 'CATEGORY_REQUIRED' });
  });

  it('creates, edits, reorders and deletes highlights and videos', async () => {
    const g = new DemoGateway(),
      stories = await withAdmin(g);
    await g.adminCommand(highlight());
    const created = (await stories()).find((h) => h.id !== 'destaque-demo')!;
    expect(created).toMatchObject({ position: 1, coverUrl: 'asset:capa-1', videos: [] });
    await g.adminCommand(highlight({ id: created.id, title: 'Renomeado', active: false }));
    expect((await stories())[1]).toMatchObject({ title: 'Renomeado', active: false });

    await g.adminCommand({ type: 'story.reorder', ids: [created.id, 'destaque-demo'] });
    expect((await stories()).map((h) => [h.id, h.position])).toEqual([
      ['destaque-demo', 1],
      [created.id, 0],
    ]);
    await expect(
      g.adminCommand({ type: 'story.reorder', ids: ['destaque-demo'] }),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER' });

    await g.adminCommand(video('destaque-demo', { assetId: 'arquivo-9' }));
    const added = (await stories()).find((h) => h.id === 'destaque-demo')!.videos[2];
    expect(added).toMatchObject({ assetId: 'arquivo-9', status: 'ready', position: 2 });
    expect((await g.stories())[0].videos[2].source).toEqual({
      type: 'file',
      src: 'asset:arquivo-9',
    });
    await expect(
      g.adminCommand({
        type: 'story.video.reorder',
        highlightId: 'destaque-demo',
        ids: ['video-demo-1', 'video-demo-1', added.id],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER' });
    await g.adminCommand({
      type: 'story.video.reorder',
      highlightId: 'destaque-demo',
      ids: [added.id, 'video-demo-1', 'video-demo-2'],
    });
    expect((await g.stories())[0].videos[0].id).toBe(added.id);
    await g.adminCommand({ type: 'story.video.delete', id: added.id });
    await expect(
      g.adminCommand({ type: 'story.video.delete', id: added.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await g.adminCommand({ type: 'story.delete', id: created.id });
    expect(await stories()).toHaveLength(1);
  });

  it('validates video products, limits and moves', async () => {
    const g = new DemoGateway(),
      stories = await withAdmin(g);
    await expect(
      g.adminCommand(video('destaque-demo', { productIds: ['nao-existe'] })),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
    await expect(g.adminCommand(video('nao-existe'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await g.adminCommand(highlight());
    const other = (await stories()).find((h) => h.id !== 'destaque-demo')!;
    await expect(g.adminCommand(video(other.id, { id: 'video-demo-1' }))).rejects.toMatchObject({
      code: 'STORY_MOVE_NOT_ALLOWED',
    });
    for (let i = 0; i < 20; i += 1) await g.adminCommand(video(other.id));
    await expect(g.adminCommand(video(other.id))).rejects.toMatchObject({
      code: 'TOO_MANY_VIDEOS',
    });
    for (let i = 0; i < 28; i += 1) await g.adminCommand(highlight());
    await expect(g.adminCommand(highlight())).rejects.toMatchObject({
      code: 'TOO_MANY_HIGHLIGHTS',
    });
  });

  it('ignores malformed events', async () => {
    const g = new DemoGateway();
    await expect(g.storyEvent({ videoId: '', type: 'like' } as never)).resolves.toBeUndefined();
  });

  it('refuses story commands without a staff session', async () => {
    const g = new DemoGateway();
    await expect(
      g.adminCommand({ type: 'story.delete', id: 'destaque-demo' }),
    ).rejects.toBeTruthy();
  });
});

describe('demo stories storage', () => {
  it('seeds states saved before stories existed but respects a saved empty list', () => {
    localStorage.clear();
    const state = new BrowserDemoStorage().load();
    const legacy = { ...state } as Partial<typeof state>;
    delete legacy.stories;
    localStorage.setItem('meo-commerce-v2', JSON.stringify(legacy));
    expect(new BrowserDemoStorage().load().stories[0]?.id).toBe('destaque-demo');
    localStorage.setItem('meo-commerce-v2', JSON.stringify({ ...state, stories: [] }));
    expect(new BrowserDemoStorage().load().stories).toEqual([]);
  });

  it('persists events in the memory storage', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.storyEvent({ videoId: 'video-demo-2', type: 'view' });
    expect(storage.load().stories[0].videos[1].views).toBe(1);
  });
});
