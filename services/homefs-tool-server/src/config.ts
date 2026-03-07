import { z } from 'zod';

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
