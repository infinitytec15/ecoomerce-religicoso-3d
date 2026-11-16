import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryEvent } from '@maos-em-oracao/contracts';
import { createStoryTracker } from './events';

vi.mock('@/lib/api/query', () => ({ useGateway: () => ({ storyEvents: vi.fn() }) }));

function setup() {
  const send = vi.fn<(events: StoryEvent[]) => Promise<void>>(async () => {});
  const tracker = createStoryTracker({ intervalMs: 5000, target: window });
  tracker.connect(send);
  return { send, tracker };
}

describe('story event tracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('batches events and sends them after 5 s', () => {
    const { send, tracker } = setup();
    tracker.track('v1', 'impression');
    tracker.track('v1', 'play');
    vi.advanceTimersByTime(4999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([
      { videoId: 'v1', type: 'impression' },
      { videoId: 'v1', type: 'play' },
    ]);
  });

  it('counts impression, play and complete once per video, clicks and adds every time', async () => {
    const { send, tracker } = setup();
    for (let i = 0; i < 2; i++) {
      tracker.track('v1', 'impression');
      tracker.track('v1', 'play');
      tracker.track('v1', 'complete');
      tracker.track('v1', 'product_click');
      tracker.track('v1', 'add_to_cart');
    }
    tracker.track('v2', 'play');
    await tracker.flush();
    expect(send.mock.calls[0][0].map((e) => `${e.videoId}:${e.type}`)).toEqual([
      'v1:impression',
      'v1:play',
      'v1:complete',
      'v1:product_click',
      'v1:add_to_cart',
      'v1:product_click',
      'v1:add_to_cart',
      'v2:play',
    ]);
  });

  it('sends right away when 50 events are queued', () => {
    const { send, tracker } = setup();
    for (let i = 0; i < 50; i++) tracker.track('v' + i, 'impression');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(50);
  });

  it('flushes when the page is hidden or left', () => {
    const { send, tracker } = setup();
    tracker.track('v1', 'play');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(send).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
    tracker.track('v1', 'product_click');
    window.dispatchEvent(new Event('pagehide'));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual([{ videoId: 'v1', type: 'product_click' }]);
  });

  it('keeps events until a sender connects, and a failing sender never throws', async () => {
    const tracker = createStoryTracker({ intervalMs: 5000, target: window });
    tracker.track('v1', 'play');
    vi.advanceTimersByTime(5000);
    const send = vi.fn(async () => {
      throw new Error('offline');
    });
    tracker.connect(send);
    vi.advanceTimersByTime(5000);
    expect(send).toHaveBeenCalledWith([{ videoId: 'v1', type: 'play' }]);
    await expect(tracker.flush()).resolves.toBeUndefined();
  });

  it('keeps sending through the carousel after the player that connected later closes', () => {
    const tracker = createStoryTracker({ intervalMs: 5000, target: window });
    const carousel = vi.fn(async () => {}),
      player = vi.fn(async () => {});
    tracker.connect(carousel);
    const closePlayer = tracker.connect(player);
    closePlayer();
    tracker.track('v1', 'impression');
    vi.advanceTimersByTime(5000);
    expect(carousel.mock.calls.length + player.mock.calls.length).toBe(1);
  });

  it('sends what is queued when the last connection closes', () => {
    const tracker = createStoryTracker({ intervalMs: 5000, target: window });
    const send = vi.fn(async () => {});
    const close = tracker.connect(send);
    tracker.track('v1', 'add_to_cart');
    close();
    expect(send).toHaveBeenCalledWith([{ videoId: 'v1', type: 'add_to_cart' }]);
  });

  it('disconnecting stops sending', async () => {
    const send = vi.fn(async () => {});
    const tracker = createStoryTracker({ target: window });
    const disconnect = tracker.connect(send);
    disconnect();
    tracker.track('v1', 'play');
    await tracker.flush();
    expect(send).not.toHaveBeenCalled();
  });
});
