import { z } from 'zod';

/** Zod contracts of product kits. Kept free of other contract imports so schemas.ts can use them. */
export const kitComponentSchema = z.object({
  productId: z.string().min(1),
  sizeIndex: z.number().int().min(0).max(10),
  color: z.string().min(1).nullable(),
  quantity: z.number().int().min(1).max(10),
});
export const kitSchema = z
  .object({ components: z.array(kitComponentSchema).min(1).max(6) })
  .refine((kit) => kit.components.reduce((sum, c) => sum + c.quantity, 0) >= 2, {
    message: 'Um kit precisa de pelo menos 2 peças.',
  });
export const kitSummarySchema = z.object({
  pieces: z.number().int().nonnegative(),
  componentsTotalCents: z.number().int().nonnegative(),
  savingsCents: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      image: z.string(),
      size: z.string(),
      color: z.string().nullable(),
      quantity: z.number().int().positive(),
    }),
  ),
});
