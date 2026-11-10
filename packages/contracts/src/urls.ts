import { z } from 'zod';
export const httpsUrlSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Use uma URL HTTPS sem credenciais.');
