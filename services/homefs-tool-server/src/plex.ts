import { z } from 'zod';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const PlexHistoryMetadataSchema = z
  .object({
    accountID: z.union([z.number(), z.string()]).optional(),
    deviceID: z.union([z.number(), z.string()]).optional(),
    historyKey: z.string().optional(),
    key: z.string().optional(),
    librarySectionID: z.union([z.number(), z.string()]).optional(),
    originalTitle: z.string().optional(),
    originallyAvailableAt: z.string().optional(),
    parentTitle: z.string().optional(),
    grandparentTitle: z.string().optional(),
    ratingKey: z.union([z.number(), z.string()]).optional(),
    thumb: z.string().optional(),
    title: z.string().optional(),
    type: z.string().optional(),
    viewedAt: z.union([z.number(), z.string()]).optional(),
    year: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const PlexHistoryResponseSchema = z.object({
  MediaContainer: z.object({
    offset: z.union([z.number(), z.string()]).optional(),
    size: z.union([z.number(), z.string()]).optional(),
    totalSize: z.union([z.number(), z.string()]).optional(),
    Metadata: z.array(PlexHistoryMetadataSchema).optional(),
  }),
});

export const PlexWatchHistoryLookupSchema = z
  .object({
    limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
    accountId: z.coerce.number().int().positive().optional(),
    librarySectionId: z.coerce.number().int().positive().optional(),
    metadataItemId: z.coerce.number().int().positive().optional(),
    viewedAtGte: z.coerce.number().int().positive().optional(),
    sort: z.enum(['viewedAt:desc', 'viewedAt:asc']).optional(),
  })
  .strict();

export type PlexWatchHistoryLookup = z.infer<typeof PlexWatchHistoryLookupSchema>;

export type PlexWatchHistoryItem = {
  accountId: number | null;
  deviceId: number | null;
  historyKey: string | null;
  key: string | null;
  librarySectionId: number | null;
  ratingKey: number | null;
  title: string | null;
  parentTitle: string | null;
  grandparentTitle: string | null;
  originalTitle: string | null;
  type: string | null;
  year: number | null;
  originallyAvailableAt: string | null;
  viewedAt: number | null;
  viewedAtIso: string | null;
  thumb: string | null;
};

export type PlexWatchHistory = {
  offset: number;
  limit: number;
  size: number;
  totalSize: number | null;
  items: PlexWatchHistoryItem[];
};

export class PlexClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PlexClientError';
    this.status = status;
  }
}

type PlexClientOptions = {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
};

export class PlexClient {
  private readonly baseUrl?: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(options: PlexClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async listWatchHistory(lookup: PlexWatchHistoryLookup = {}): Promise<PlexWatchHistory> {
    if (!this.baseUrl || !this.token) {
      throw new PlexClientError('Plex is not configured. Set PLEX_URL and PLEX_TOKEN.');
    }

    const limit = lookup.limit ?? DEFAULT_LIMIT;
    const offset = lookup.offset ?? 0;
    const url = new URL('/status/sessions/history/all', this.baseUrl);
    url.searchParams.set('X-Plex-Container-Start', String(offset));
    url.searchParams.set('X-Plex-Container-Size', String(limit));
    url.searchParams.set('sort', lookup.sort ?? 'viewedAt:desc');

    if (lookup.accountId) {
      url.searchParams.set('accountID', String(lookup.accountId));
    }

    if (lookup.librarySectionId) {
      url.searchParams.set('librarySectionID', String(lookup.librarySectionId));
    }

    if (lookup.metadataItemId) {
      url.searchParams.set('metadataItemID', String(lookup.metadataItemId));
    }

    if (lookup.viewedAtGte) {
      url.searchParams.set('viewedAt', `viewedAt>=${lookup.viewedAtGte}`);
    }

    const response = await this.fetchJson(url);
    const parsed = PlexHistoryResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new PlexClientError(`Plex history returned invalid response: ${parsed.error.message}`);
    }

    return mapWatchHistory(parsed.data, { limit, offset });
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-plex-token': this.token ?? '',
          'x-plex-client-identifier': 'homefs-tool-server',
          'x-plex-product': 'homefs-tool-server',
          'x-plex-version': '0.1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new PlexClientError(
          `Plex history failed with status ${response.status}: ${body}`,
          response.status,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof PlexClientError) {
        throw error;
      }

      throw new PlexClientError(`Plex history request failed: ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

const mapWatchHistory = (
  response: z.output<typeof PlexHistoryResponseSchema>,
  request: { limit: number; offset: number },
): PlexWatchHistory => {
  const container = response.MediaContainer;
  const items = container.Metadata ?? [];

  return {
    offset: numberOrDefault(container.offset, request.offset),
    limit: request.limit,
    size: numberOrDefault(container.size, items.length),
    totalSize: numberOrNull(container.totalSize),
    items: items.map(mapWatchHistoryItem),
  };
};

const mapWatchHistoryItem = (
  item: z.output<typeof PlexHistoryMetadataSchema>,
): PlexWatchHistoryItem => {
  const viewedAt = numberOrNull(item.viewedAt);

  return {
    accountId: numberOrNull(item.accountID),
    deviceId: numberOrNull(item.deviceID),
    historyKey: item.historyKey ?? null,
    key: item.key ?? null,
    librarySectionId: numberOrNull(item.librarySectionID),
    ratingKey: numberOrNull(item.ratingKey),
    title: item.title ?? null,
    parentTitle: item.parentTitle ?? null,
    grandparentTitle: item.grandparentTitle ?? null,
    originalTitle: item.originalTitle ?? null,
    type: item.type ?? null,
    year: numberOrNull(item.year),
    originallyAvailableAt: item.originallyAvailableAt ?? null,
    viewedAt,
    viewedAtIso: viewedAt ? new Date(viewedAt * 1000).toISOString() : null,
    thumb: item.thumb ?? null,
  };
};

const numberOrNull = (value: number | string | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const numberOrDefault = (value: number | string | undefined, fallback: number): number =>
  numberOrNull(value) ?? fallback;
