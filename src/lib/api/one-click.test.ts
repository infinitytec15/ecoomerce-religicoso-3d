// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardOneClick } from './one-click';
import { POST as devotional } from '@/app/api/email/unsubscribe/route';
import { POST as marketing } from '@/app/api/email/marketing-unsubscribe/route';

const post = (url: string, body: string = 'List-Unsubscribe=One-Click') =>
  new Request(url, { method: 'POST', body });
const token = 't'.repeat(30);

describe('one-click unsubscribe', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_BASE_URL', 'http://api.test/');
    vi.stubEnv('BFF_SHARED_SECRET', 'segredo');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('repassa token ao caminho da API com o segredo e o corpo one-click', async () => {
    const response = await forwardOneClick(
      post('http://x/api/email/unsubscribe?token=' + token),
      'newsletter/one-click',
    );
    expect(response.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/newsletter/one-click?token=' + token);
    expect(init.body).toBe('List-Unsubscribe=One-Click');
    expect(init.headers['x-bff-secret']).toBe('segredo');
  });

  it('recusa corpo sem List-Unsubscribe=One-Click, token ausente e corpo grande', async () => {
    const base = 'http://x/api/email/unsubscribe?token=' + token;
    expect((await forwardOneClick(post(base, 'outra=coisa'), 'a/b')).status).toBe(422);
    expect((await forwardOneClick(post('http://x/api'), 'a/b')).status).toBe(422);
    expect((await forwardOneClick(post(base, 'x'.repeat(5000)), 'a/b')).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 quando a API falha ou sem API_BASE_URL', async () => {
    const req = () => post('http://x/?token=' + token);
    fetchMock.mockRejectedValueOnce(new Error('rede'));
    expect((await forwardOneClick(req(), 'a/b')).status).toBe(503);
    vi.stubEnv('API_BASE_URL', '');
    expect((await forwardOneClick(req(), 'a/b')).status).toBe(503);
  });

  it('a rota devocional segue para newsletter/one-click sem o parametro c', async () => {
    await devotional(post('http://x/api/email/unsubscribe?token=' + token + '&c=abc'));
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/newsletter/one-click?token=' + token);
  });

  it('a rota de novidades repassa token e c para marketing/one-click', async () => {
    const campaign = '11111111-1111-4111-8111-111111111111';
    const response = await marketing(
      post('http://x/api/email/marketing-unsubscribe?token=' + token + '&c=' + campaign),
    );
    expect(response.status).toBe(204);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://api.test/marketing/one-click?token=' + token + '&c=' + campaign,
    );
  });

  it('a rota de novidades responde 422 sem o corpo one-click', async () => {
    const response = await marketing(
      post('http://x/api/email/marketing-unsubscribe?token=' + token, 'x=1'),
    );
    expect(response.status).toBe(422);
  });
});
