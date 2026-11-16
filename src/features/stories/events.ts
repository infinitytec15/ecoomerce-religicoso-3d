'use client';
import { useEffect } from 'react';
import { STORY_LIMITS, type StoryEvent, type StoryEventType } from '@maos-em-oracao/contracts';
import { useGateway } from '@/lib/api/query';

export type StoryEventSender = (events: StoryEvent[]) => Promise<void>;

/** Counted once per video and page load; clicks and adds count every time. */
const ONCE_PER_PAGE: ReadonlySet<StoryEventType> = new Set(['impression', 'play', 'complete']);
const FLUSH_INTERVAL_MS = 5000;
/** Events kept while no sender is connected yet; the oldest go first. */
const MAX_PENDING = STORY_LIMITS.eventsPerBatch * 4;

export interface StoryTracker {
  track(videoId: string, type: StoryEventType): void;
  /** Sends what is queued now; resolves when the sender settles (never rejects). */
  flush(): Promise<void>;
  /**
   * Adds a sender; returns a function that removes it. Several components connect at once (a
   * carousel and the player it opens): events go through the newest one still connected, and the
   * last one to leave sends what is queued first.
   */
  connect(send: StoryEventSender): () => void;
}

/**
 * Story usage events: deduped, batched up to the API batch size and sent every few seconds, and
 * right away when the page is hidden or left (the gateway uses fetch keepalive for that).
 */
export function createStoryTracker({
  intervalMs = FLUSH_INTERVAL_MS,
  target = typeof window === 'undefined' ? undefined : window,
}: { intervalMs?: number; target?: Window } = {}): StoryTracker {
  let senders: StoryEventSender[] = [],
    queue: StoryEvent[] = [],
    timer: ReturnType<typeof setTimeout> | undefined,
    listening = false;
  const seen = new Set<string>();

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const sender = senders.at(-1);
    if (!sender || !queue.length) return Promise.resolve();
    const events = queue;
    queue = [];
    return sender(events).catch(() => undefined);
  }
  function onHidden() {
    if (target?.document.visibilityState === 'hidden') void flush();
  }
  function listen() {
    if (listening || !target) return;
    listening = true;
    target.addEventListener('pagehide', () => void flush());
    target.document.addEventListener('visibilitychange', onHidden);
  }
  function track(videoId: string, type: StoryEventType) {
    if (ONCE_PER_PAGE.has(type)) {
      const key = type + ':' + videoId;
      if (seen.has(key)) return;
      seen.add(key);
    }
    listen();
    queue = [...queue, { videoId, type }].slice(-MAX_PENDING);
    if (senders.length && queue.length >= STORY_LIMITS.eventsPerBatch) void flush();
    else if (timer === undefined) timer = setTimeout(() => void flush(), intervalMs);
  }
  function connect(send: StoryEventSender) {
    senders = [...senders, send];
    if (queue.length && timer === undefined) timer = setTimeout(() => void flush(), intervalMs);
    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      if (senders.length === 1 && senders[0] === send) void flush();
      const index = senders.lastIndexOf(send);
      senders = senders.filter((_, i) => i !== index);
    };
  }
  return { track, flush, connect };
}

const pageTracker = createStoryTracker();
export const trackStory = (videoId: string, type: StoryEventType) =>
  pageTracker.track(videoId, type);
export const flushStoryEvents = () => pageTracker.flush();

/** Connects the page tracker to the store gateway and returns `trackStory`. */
export function useStoryTracker() {
  const gateway = useGateway();
  useEffect(() => pageTracker.connect((events) => gateway.storyEvents(events)), [gateway]);
  return trackStory;
}
