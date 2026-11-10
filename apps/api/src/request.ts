import type { Request } from 'express';
import type { Actor } from '@maos-em-oracao/backend-core/shared';
export interface ApiRequest extends Request {
  actor: Actor | null;
  visitorKey: string;
  /** Rate-limit key for the calling client: hashed IP, or visitorKey when no IP is known. */
  clientKey: string;
  requestId: string;
  rawBody?: Buffer;
}
