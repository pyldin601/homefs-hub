import { z } from 'zod';

export const ConfigSchema = z.object({
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_CHAT_IDS: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
