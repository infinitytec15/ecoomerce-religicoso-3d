export class ProviderError extends Error {
  constructor(
    public provider: string,
    public code: string,
    public status = 503,
    public unknown = false,
  ) {
    super(`O serviço ${provider} não concluiu a operação (${code}).`);
  }
}
export type Fetcher = typeof fetch;
export async function providerJson<T>(
  provider: string,
  url: string,
  init: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ProviderError(provider, 'NETWORK_UNKNOWN', 503, true);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(
      provider,
      `HTTP_${response.status}`,
      response.status === 429 ? 429 : 503,
      response.status >= 500,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError(provider, 'EMPTY_RESPONSE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1048576) {
      await reader.cancel();
      throw new ProviderError(provider, 'RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    throw new ProviderError(provider, 'INVALID_RESPONSE');
  }
}
export function configured(provider: string, ...values: unknown[]): void {
  if (values.some((v) => !v)) throw new ProviderError(provider, 'NOT_CONFIGURED');
}
export const toCents = (value: number | string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000)
    throw new ProviderError('provider', 'INVALID_AMOUNT');
  return Math.round(amount * 100);
};
