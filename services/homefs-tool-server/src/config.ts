import { z } from 'zod';

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
  TOLOKA_USERNAME: z.string().min(1),
  TOLOKA_PASSWORD: z.string().min(1),
  TRANS_URL: z.string().url(),
  TRANS_USERNAME: z.string().optional(),
  TRANS_PASSWORD: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
