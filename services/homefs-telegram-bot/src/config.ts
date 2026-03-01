import { z } from 'zod';

export const ConfigSchema = z.object({
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;
