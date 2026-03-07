import { z } from 'zod';

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
  TOLOKA_USERNAME: z.string().min(1),
  TOLOKA_PASSWORD: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;
