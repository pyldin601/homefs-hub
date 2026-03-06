import { z } from 'zod';

export const ConfigSchema = z.object({
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_CHAT_IDS: z.string().optional(),
  TOLOKA_USERNAME: z.string().min(1),
  TOLOKA_PASSWORD: z.string().min(1),
  SKILL_SERVER_URL: z.string().url(),
});

export type Config = z.infer<typeof ConfigSchema>;
