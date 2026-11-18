import { z } from 'zod';
import type { Permission } from '@maos-em-oracao/contracts';
import type { Context } from '@maos-em-oracao/backend-core/context';
import type { Actor } from '@maos-em-oracao/backend-core/shared';
import { AdminService } from '@maos-em-oracao/backend-core/admin';
import { ReportsService } from '@maos-em-oracao/backend-core/reports';
import { MediaService } from '@maos-em-oracao/backend-core/media';

/** What every tool call receives: the store services, bound to the actor the API key resolved. */
export interface ToolEnv {
  ctx: Context;
  actor: Actor;
  admin: AdminService;
  reports: ReportsService;
  media: MediaService;
}

export function toolEnv(ctx: Context, actor: Actor): ToolEnv {
  return {
    ctx,
    actor,
    admin: new AdminService(ctx),
    reports: new ReportsService(ctx),
    media: new MediaService(ctx),
  };
}

export interface McpTool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** Hidden from keys without it (the call would be refused anyway). */
  permission?: Permission;
  readOnly?: boolean;
  destructive?: boolean;
  run: (args: z.output<S>, env: ToolEnv) => Promise<unknown>;
}

/** Keeps each tool's handler typed against its own input schema. */
export const defineTool = <S extends z.ZodType>(tool: McpTool<S>): McpTool => tool as McpTool;
