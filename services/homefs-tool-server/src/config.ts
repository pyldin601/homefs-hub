import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.string().url().optional(),
);

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
  TOLOKA_USERNAME: z.string().min(1),
  TOLOKA_PASSWORD: z.string().min(1),
  TRANS_URL: z.string().url(),
  TRANS_USERNAME: z.string().optional(),
  TRANS_PASSWORD: z.string().optional(),
  OMDB_API_KEY: z.string().min(1).optional(),
  IMDB_API_KEY: z.string().min(1).optional(),
  OMDB_BASE_URL: z.string().url().optional(),
  PLEX_URL: optionalUrl,
  PLEX_TOKEN: optionalNonEmptyString,
});

export type Config = z.infer<typeof ConfigSchema>;
