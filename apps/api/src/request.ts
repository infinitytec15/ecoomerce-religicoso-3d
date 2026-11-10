import type { Request } from 'express';
import type { Actor } from '@maos-em-oracao/backend-core/shared';
export interface ApiRequest extends Request {
  actor: Actor | null;
  visitorKey: string;
  requestId: string;
  rawBody?: Buffer;
}
