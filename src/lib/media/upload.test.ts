import { describe, expect, it, vi } from 'vitest';

type TusOptions = {
  headers?: Record<string, string>;
  onBeforeRequest?: (request: { setHeader(name: string, value: string): void }) => Promise<void>;
  onSuccess: () => void;
};
const tus = vi.hoisted(() => ({ options: [] as TusOptions[] }));
vi.mock('tus-js-client', () => ({
  Upload: class {
    constructor(
      _file: unknown,
      private options: TusOptions,
    ) {
      tus.options.push(options);
    }
    start() {
      this.options.onSuccess();
    }
  },
}));
vi.mock('./assets', () => ({ validateAsset: () => {} }));

import { uploadMedia } from './upload';

const session = {
  id: 'asset-1',
  transport: 'tus',
  url: 'https://video.bunnycdn.com/tusupload',
  headers: {
    AuthorizationSignature: 'sig',
    AuthorizationExpire: String(Math.floor(Date.now() / 1000) + 300),
    LibraryId: '805676',
    VideoId: '11111111-1111-4111-8111-111111111111',
  },
};
const asset = {
  id: 'asset-1',
  name: 'a.mp4',
  kind: 'video',
  mime: 'video/mp4',
  size: 5,
  storage: 'bunny-stream',
  status: 'processing',
  created: '2026-11-16T00:00:00.000Z',
};

/** Like XMLHttpRequest: setting a header twice joins the values ("805676, 805676"). */
function browserRequest() {
  const sent: Record<string, string> = {};
  return {
    sent,
    setHeader(name: string, value: string) {
      sent[name] = name in sent ? sent[name] + ', ' + value : value;
    },
  };
}

describe('uploadMedia (vídeo pelo Bunny Stream)', () => {
  it('envia cada cabeçalho de autorização uma vez só, como o Bunny exige', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json({ data: String(url).endsWith('/complete') ? asset : session }),
      ),
    );
    await uploadMedia(new File(['hello'], 'a.mp4', { type: 'video/mp4' }), 'video');
    const options = tus.options.at(-1)!,
      request = browserRequest();
    for (const [name, value] of Object.entries(options.headers ?? {}))
      request.setHeader(name, value);
    await options.onBeforeRequest?.(request);
    expect(request.sent).toEqual(session.headers);
    vi.unstubAllGlobals();
  });
});
