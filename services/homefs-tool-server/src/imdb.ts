import { z } from 'zod';

const DEFAULT_OMDB_BASE_URL = 'https://www.omdbapi.com/';
const DEFAULT_TIMEOUT_MS = 15_000;

const NullableStringSchema = z
  .string()
  .transform((value) => (value === 'N/A' || value.trim().length === 0 ? null : value));

const OmdbRatingSchema = z.object({
  Source: z.string(),
  Value: z.string(),
});

const OmdbSuccessResponseSchema = z.object({
  Title: NullableStringSchema,
  Year: NullableStringSchema,
  Rated: NullableStringSchema,
  Released: NullableStringSchema,
  Runtime: NullableStringSchema,
  Genre: NullableStringSchema,
  Director: NullableStringSchema,
  Writer: NullableStringSchema,
  Actors: NullableStringSchema,
  Plot: NullableStringSchema,
  Language: NullableStringSchema,
  Country: NullableStringSchema,
  Awards: NullableStringSchema,
  Poster: NullableStringSchema,
  Ratings: z.array(OmdbRatingSchema).default([]),
  Metascore: NullableStringSchema,
  imdbRating: NullableStringSchema,
  imdbVotes: NullableStringSchema,
  imdbID: z.string().min(1),
  Type: NullableStringSchema,
  totalSeasons: z.string().min(1).optional(),
  DVD: NullableStringSchema.optional(),
  BoxOffice: NullableStringSchema.optional(),
  Production: NullableStringSchema.optional(),
  Website: NullableStringSchema.optional(),
  Response: z.literal('True'),
});

const OmdbErrorResponseSchema = z.object({
  Response: z.literal('False'),
  Error: z.string().min(1),
});

const OmdbResponseSchema = z.union([OmdbSuccessResponseSchema, OmdbErrorResponseSchema]);

const OmdbEpisodeSchema = z.object({
  Title: NullableStringSchema,
  Released: NullableStringSchema,
  Episode: z.string().min(1),
  imdbRating: NullableStringSchema,
  imdbID: z.string().min(1),
});

const OmdbSeasonSuccessResponseSchema = z.object({
  Title: NullableStringSchema,
  Season: z.string().min(1),
  totalSeasons: z.string().min(1),
  Episodes: z.array(OmdbEpisodeSchema).default([]),
  Response: z.literal('True'),
});

const OmdbSeasonResponseSchema = z.union([
  OmdbSeasonSuccessResponseSchema,
  OmdbErrorResponseSchema,
]);

export const MovieDetailsLookupSchema = z
  .object({
    imdbId: z
      .string()
      .trim()
      .regex(/^tt\d+$/)
      .optional(),
    title: z.string().trim().min(1).optional(),
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional(),
    plot: z.enum(['short', 'full']).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.imdbId) !== Boolean(value.title), {
    message: 'Provide exactly one of imdbId or title.',
    path: ['imdbId'],
  });

export type MovieDetailsLookup = z.infer<typeof MovieDetailsLookupSchema>;

export const SeriesLookupSchema = z
  .object({
    imdbId: z
      .string()
      .trim()
      .regex(/^tt\d+$/)
      .optional(),
    title: z.string().trim().min(1).optional(),
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.imdbId) !== Boolean(value.title), {
    message: 'Provide exactly one of imdbId or title.',
    path: ['imdbId'],
  });

export type SeriesLookup = z.infer<typeof SeriesLookupSchema>;

export const SeriesEpisodesLookupSchema = z
  .object({
    imdbId: z
      .string()
      .trim()
      .regex(/^tt\d+$/)
      .optional(),
    title: z.string().trim().min(1).optional(),
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional(),
    season: z.coerce.number().int().positive(),
  })
  .strict()
  .refine((value) => Boolean(value.imdbId) !== Boolean(value.title), {
    message: 'Provide exactly one of imdbId or title.',
    path: ['imdbId'],
  });

export type SeriesEpisodesLookup = z.infer<typeof SeriesEpisodesLookupSchema>;

export type MovieDetails = {
  title: string | null;
  year: string | null;
  rated: string | null;
  released: string | null;
  runtime: string | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  plot: string | null;
  language: string | null;
  country: string | null;
  awards: string | null;
  poster: string | null;
  ratings: Array<{ source: string; value: string }>;
  metascore: string | null;
  imdbRating: string | null;
  imdbVotes: string | null;
  imdbId: string;
  type: string | null;
  dvd: string | null;
  boxOffice: string | null;
  production: string | null;
  website: string | null;
};

export type SeriesEpisodes = {
  title: string | null;
  season: number;
  totalSeasons: number | null;
  episodes: Array<{
    title: string | null;
    released: string | null;
    episode: number;
    imdbRating: string | null;
    imdbId: string;
  }>;
};

export type SeriesSeasons = {
  title: string | null;
  year: string | null;
  imdbId: string;
  totalSeasons: number;
  seasons: number[];
};

export class ImdbClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ImdbClientError';
    this.status = status;
  }
}

type ImdbClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class ImdbClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ImdbClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_OMDB_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getMovieDetails(lookup: MovieDetailsLookup): Promise<MovieDetails> {
    if (!this.apiKey) {
      throw new ImdbClientError('IMDb lookup is not configured. Set OMDB_API_KEY or IMDB_API_KEY.');
    }

    const url = new URL('/', this.baseUrl);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('plot', lookup.plot ?? 'full');

    if (lookup.imdbId) {
      url.searchParams.set('i', lookup.imdbId);
    } else if (lookup.title) {
      url.searchParams.set('t', lookup.title);
    }

    if (lookup.year) {
      url.searchParams.set('y', lookup.year);
    }

    const response = await this.fetchJson(url);
    const parsed = OmdbResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ImdbClientError(`IMDb lookup returned invalid response: ${parsed.error.message}`);
    }

    if (parsed.data.Response === 'False') {
      throw new ImdbClientError(`IMDb lookup failed: ${parsed.data.Error}`);
    }

    return mapMovieDetails(parsed.data);
  }

  async getSeriesSeasons(lookup: SeriesLookup): Promise<SeriesSeasons> {
    if (!this.apiKey) {
      throw new ImdbClientError('IMDb lookup is not configured. Set OMDB_API_KEY or IMDB_API_KEY.');
    }

    const url = new URL('/', this.baseUrl);
    url.searchParams.set('apikey', this.apiKey);

    if (lookup.imdbId) {
      url.searchParams.set('i', lookup.imdbId);
    } else if (lookup.title) {
      url.searchParams.set('t', lookup.title);
    }

    if (lookup.year) {
      url.searchParams.set('y', lookup.year);
    }

    const response = await this.fetchJson(url);
    const parsed = OmdbResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ImdbClientError(
        `IMDb series lookup returned invalid response: ${parsed.error.message}`,
      );
    }

    if (parsed.data.Response === 'False') {
      throw new ImdbClientError(`IMDb series lookup failed: ${parsed.data.Error}`);
    }

    if (parsed.data.Type !== 'series') {
      throw new ImdbClientError('IMDb title is not a series.');
    }

    if (!parsed.data.totalSeasons) {
      throw new ImdbClientError('IMDb series lookup did not include totalSeasons.');
    }

    return mapSeriesSeasons(parsed.data);
  }

  async getSeriesEpisodes(lookup: SeriesEpisodesLookup): Promise<SeriesEpisodes> {
    if (!this.apiKey) {
      throw new ImdbClientError('IMDb lookup is not configured. Set OMDB_API_KEY or IMDB_API_KEY.');
    }

    const url = new URL('/', this.baseUrl);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('Season', String(lookup.season));

    if (lookup.imdbId) {
      url.searchParams.set('i', lookup.imdbId);
    } else if (lookup.title) {
      url.searchParams.set('t', lookup.title);
    }

    if (lookup.year) {
      url.searchParams.set('y', lookup.year);
    }

    const response = await this.fetchJson(url);
    const parsed = OmdbSeasonResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ImdbClientError(
        `IMDb season lookup returned invalid response: ${parsed.error.message}`,
      );
    }

    if (parsed.data.Response === 'False') {
      throw new ImdbClientError(`IMDb season lookup failed: ${parsed.data.Error}`);
    }

    return mapSeriesEpisodes(parsed.data);
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ImdbClientError(`IMDb lookup failed with status ${response.status}: ${body}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ImdbClientError) {
        throw error;
      }

      throw new ImdbClientError(`IMDb lookup request failed: ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

const mapMovieDetails = (response: z.output<typeof OmdbSuccessResponseSchema>): MovieDetails => ({
  title: response.Title,
  year: response.Year,
  rated: response.Rated,
  released: response.Released,
  runtime: response.Runtime,
  genre: response.Genre,
  director: response.Director,
  writer: response.Writer,
  actors: response.Actors,
  plot: response.Plot,
  language: response.Language,
  country: response.Country,
  awards: response.Awards,
  poster: response.Poster,
  ratings: response.Ratings.map((rating) => ({
    source: rating.Source,
    value: rating.Value,
  })),
  metascore: response.Metascore,
  imdbRating: response.imdbRating,
  imdbVotes: response.imdbVotes,
  imdbId: response.imdbID,
  type: response.Type,
  dvd: response.DVD ?? null,
  boxOffice: response.BoxOffice ?? null,
  production: response.Production ?? null,
  website: response.Website ?? null,
});

const mapSeriesSeasons = (response: z.output<typeof OmdbSuccessResponseSchema>): SeriesSeasons => {
  const totalSeasons = response.totalSeasons ? Number.parseInt(response.totalSeasons, 10) : NaN;
  if (!Number.isFinite(totalSeasons) || totalSeasons < 1) {
    throw new ImdbClientError('IMDb series lookup returned invalid totalSeasons.');
  }

  return {
    title: response.Title,
    year: response.Year,
    imdbId: response.imdbID,
    totalSeasons,
    seasons: Array.from({ length: totalSeasons }, (_value, index) => index + 1),
  };
};

const mapSeriesEpisodes = (
  response: z.output<typeof OmdbSeasonSuccessResponseSchema>,
): SeriesEpisodes => ({
  title: response.Title,
  season: Number.parseInt(response.Season, 10),
  totalSeasons: Number.isFinite(Number.parseInt(response.totalSeasons, 10))
    ? Number.parseInt(response.totalSeasons, 10)
    : null,
  episodes: response.Episodes.map((episode) => ({
    title: episode.Title,
    released: episode.Released,
    episode: Number.parseInt(episode.Episode, 10),
    imdbRating: episode.imdbRating,
    imdbId: episode.imdbID,
  })),
});
