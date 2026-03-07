import { z } from 'zod';

export const ConfigSchema = z.object({
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_CHAT_IDS: z.string().optional(),
  TOOL_SERVER_URL: z.string().url().optional(),
  SKILL_SERVER_URL: z.string().url().optional(),
});

export type RawConfig = z.infer<typeof ConfigSchema>;

export type Config = Omit<RawConfig, 'TOOL_SERVER_URL' | 'SKILL_SERVER_URL'> & {
  TOOL_SERVER_URL: string;
};

export const parseConfig = (env: NodeJS.ProcessEnv): Config => {
  const parsed = ConfigSchema.parse(env);
  const toolServerUrl = parsed.TOOL_SERVER_URL ?? parsed.SKILL_SERVER_URL;

  if (!toolServerUrl) {
    throw new Error('Missing TOOL_SERVER_URL (or legacy SKILL_SERVER_URL).');
  }

  return {
    OLLAMA_BASE_URL: parsed.OLLAMA_BASE_URL,
    OLLAMA_MODEL: parsed.OLLAMA_MODEL,
    TELEGRAM_BOT_TOKEN: parsed.TELEGRAM_BOT_TOKEN,
    ALLOWED_CHAT_IDS: parsed.ALLOWED_CHAT_IDS,
    TOOL_SERVER_URL: toolServerUrl,
  };
};
