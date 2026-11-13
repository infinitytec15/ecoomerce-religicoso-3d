import { z } from 'zod';
export const httpsUrlSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Use uma URL HTTPS sem credenciais.');
/** Public tracking page; Melhor Rastreio covers every carrier sold through Melhor Envio. */
export const trackingUrl = (code: string) =>
  'https://www.melhorrastreio.com.br/rastreio/' + encodeURIComponent(code.trim());
