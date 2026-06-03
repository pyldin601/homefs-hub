import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import {
  ListToolsResponseSchema,
  ToolCallRequestSchema,
  ToolCallResponseSchema,
  type OllamaToolCall,
} from 'homefs-shared';
import { ConfigSchema } from './config';
import {
  ImdbClient,
  ImdbClientError,
  MovieDetailsLookupSchema,
  SeriesEpisodesLookupSchema,
  SeriesLookupSchema,
} from './imdb';
import { logger, serializeError } from './logger';
import { PlexClient, PlexClientError, PlexWatchHistoryLookupSchema } from './plex';
import { TolokaClient } from './toloka';
import { TransmissionClient } from './transmission';
import { tools } from './tools';

const SearchTorrentsArgsSchema = z.object({ query: z.string().min(1) }).strict();
const SearchBookmarksByTitleArgsSchema = z.object({ title: z.string().min(1) }).strict();
const TopicIdArgsSchema = z.object({ topicId: z.string().min(1) }).strict();
const TorrentHashArgsSchema = z.object({ hash: z.string().min(1) }).strict();
const GetDateArgsSchema = z.object({ timezone: z.string().min(1).optional() }).strict();
const EmptyArgsSchema = z.object({}).strict();

const normalizeShortOffset = (value: string): string | null => {
  const match = value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = match[3] ?? '00';
  return `${sign}${hours}:${minutes}`;
};

const getShortOffset = (now: Date, timezone: string): string | null =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName')?.value ?? null;

const formatInTimezone = (
  now: Date,
  timezone: string,
): {
  date: string;
  time: string;
  datetime: string;
  weekday: string;
  timezone: string;
  utcOffset: string | null;
} => {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(now);
  const shortOffset = getShortOffset(now, timezone);

  return {
    date,
    time,
    datetime: `${date} ${time}`,
    weekday,
    timezone,
    utcOffset: shortOffset ? normalizeShortOffset(shortOffset) : null,
  };
};

const isValidTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const buildDateTimePayload = (timezone?: string): Record<string, unknown> => {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const iso = now.toISOString();

  return {
    iso,
    unixSeconds: Math.floor(now.getTime() / 1000),
    local: formatInTimezone(now, tz),
    utc: formatInTimezone(now, 'UTC'),
    requestedTimezone: timezone ? formatInTimezone(now, timezone) : null,
  };
};

const parseToolArguments = (argumentsValue: OllamaToolCall['function']['arguments']): unknown => {
  if (typeof argumentsValue === 'string') {
    try {
      return JSON.parse(argumentsValue);
    } catch {
      return {};
    }
  }

  return argumentsValue ?? {};
};

const executeToolCall = async (
  toolCall: OllamaToolCall,
  tolokaClient: TolokaClient,
  transmissionClient: TransmissionClient,
  imdbClient: ImdbClient,
  plexClient: PlexClient,
): Promise<unknown> => {
  if (toolCall.function.name === 'get_date') {
    const parsed = GetDateArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return {
        error: 'Invalid arguments for get_date. Expected { timezone?: string }',
      };
    }

    if (parsed.data.timezone && !isValidTimezone(parsed.data.timezone)) {
      return {
        error:
          'Invalid timezone for get_date. Expected a valid IANA timezone, for example "Europe/Lisbon".',
      };
    }

    const date = buildDateTimePayload(parsed.data.timezone);

    logger.debug('get_date: returning date', { date });

    return date;
  }

  if (toolCall.function.name === 'search_torrents') {
    const parsed = SearchTorrentsArgsSchema.safeParse(
      parseToolArguments(toolCall.function.arguments),
    );
    if (!parsed.success) {
      return { error: 'Invalid arguments for search_torrents. Expected { query: string }' };
    }

    return await tolokaClient.getSearchResultsMeta(parsed.data.query);
  }

  if (toolCall.function.name === 'list_torrents') {
    const parsed = EmptyArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return { error: 'Invalid arguments for list_torrents. Expected {}' };
    }

    return await transmissionClient.listTorrents();
  }

  if (toolCall.function.name === 'get_movie_details') {
    const parsed = MovieDetailsLookupSchema.safeParse(
      parseToolArguments(toolCall.function.arguments),
    );
    if (!parsed.success) {
      return {
        error:
          'Invalid arguments for get_movie_details. Expected exactly one of { imdbId: string } or { title: string }, with optional { year: string, plot: "short" | "full" }.',
        details: parsed.error.flatten(),
      };
    }

    try {
      return await imdbClient.getMovieDetails(parsed.data);
    } catch (error) {
      if (error instanceof ImdbClientError) {
        return { error: error.message, status: error.status };
      }

      throw error;
    }
  }

  if (toolCall.function.name === 'get_series_episodes') {
    const parsed = SeriesEpisodesLookupSchema.safeParse(
      parseToolArguments(toolCall.function.arguments),
    );
    if (!parsed.success) {
      return {
        error:
          'Invalid arguments for get_series_episodes. Expected season plus exactly one of { imdbId: string } or { title: string }, with optional { year: string }.',
        details: parsed.error.flatten(),
      };
    }

    try {
      return await imdbClient.getSeriesEpisodes(parsed.data);
    } catch (error) {
      if (error instanceof ImdbClientError) {
        return { error: error.message, status: error.status };
      }

      throw error;
    }
  }

  if (toolCall.function.name === 'get_series_seasons') {
    const parsed = SeriesLookupSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return {
        error:
          'Invalid arguments for get_series_seasons. Expected exactly one of { imdbId: string } or { title: string }, with optional { year: string }.',
        details: parsed.error.flatten(),
      };
    }

    try {
      return await imdbClient.getSeriesSeasons(parsed.data);
    } catch (error) {
      if (error instanceof ImdbClientError) {
        return { error: error.message, status: error.status };
      }

      throw error;
    }
  }

  if (toolCall.function.name === 'list_plex_watch_history') {
    const parsed = PlexWatchHistoryLookupSchema.safeParse(
      parseToolArguments(toolCall.function.arguments),
    );
    if (!parsed.success) {
      return {
        error:
          'Invalid arguments for list_plex_watch_history. Expected optional { limit, offset, accountId, librarySectionId, metadataItemId, viewedAtGte, sort }.',
        details: parsed.error.flatten(),
      };
    }

    try {
      return await plexClient.listWatchHistory(parsed.data);
    } catch (error) {
      if (error instanceof PlexClientError) {
        return { error: error.message, status: error.status };
      }

      throw error;
    }
  }

  if (toolCall.function.name === 'remove_torrent_from_transmission') {
    const parsed = TorrentHashArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return {
        error: 'Invalid arguments for remove_torrent_from_transmission. Expected { hash: string }',
      };
    }

    await transmissionClient.removeTorrentByHash(parsed.data.hash);
    return { ok: true, action: 'removed_from_transmission', hash: parsed.data.hash };
  }

  if (toolCall.function.name === 'list_torrent_bookmarks') {
    const parsed = EmptyArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return { error: 'Invalid arguments for list_torrent_bookmarks. Expected {}' };
    }

    return await tolokaClient.listBookmarkedTopics();
  }

  if (toolCall.function.name === 'search_torrent_bookmarks_by_title') {
    const parsed = SearchBookmarksByTitleArgsSchema.safeParse(
      parseToolArguments(toolCall.function.arguments),
    );
    if (!parsed.success) {
      return {
        error:
          'Invalid arguments for search_torrent_bookmarks_by_title. Expected { title: string }',
      };
    }

    const titleQuery = parsed.data.title.trim().toLowerCase();
    const bookmarks = await tolokaClient.listBookmarkedTopics();
    const matches = bookmarks.filter((item) => item.title.toLowerCase().includes(titleQuery));

    return {
      query: parsed.data.title,
      total: matches.length,
      results: matches.slice(0, 25).map((item) => ({
        topicId: item.topicId,
        title: item.title,
        category: typeof item.category === 'string' ? item.category : item.category.other,
      })),
    };
  }

  if (toolCall.function.name === 'bookmark_torrent') {
    const parsed = TopicIdArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return { error: 'Invalid arguments for bookmark_torrent. Expected { topicId: string }' };
    }

    await tolokaClient.addTopicToBookmarks(parsed.data.topicId);
    return { ok: true, action: 'bookmarked', topicId: parsed.data.topicId };
  }

  if (toolCall.function.name === 'remove_torrent_bookmark') {
    const parsed = TopicIdArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return {
        error: 'Invalid arguments for remove_torrent_bookmark. Expected { topicId: string }',
      };
    }

    await tolokaClient.removeTopicFromBookmarks(parsed.data.topicId);
    return { ok: true, action: 'removed', topicId: parsed.data.topicId };
  }

  return { error: `Unsupported tool: ${toolCall.function.name}` };
};

const main = async (): Promise<void> => {
  const config = ConfigSchema.parse(process.env);
  const tolokaClient = await TolokaClient.create({
    username: config.TOLOKA_USERNAME,
    password: config.TOLOKA_PASSWORD,
  });
  const transmissionClient = new TransmissionClient({
    url: config.TRANS_URL,
    username: config.TRANS_USERNAME,
    password: config.TRANS_PASSWORD,
  });
  const imdbClient = new ImdbClient({
    apiKey: config.OMDB_API_KEY ?? config.IMDB_API_KEY,
    baseUrl: config.OMDB_BASE_URL,
  });
  const plexClient = new PlexClient({
    baseUrl: config.PLEX_URL,
    token: config.PLEX_TOKEN,
  });

  const app = express();
  app.use(express.json());

  app.get('/tools', (_req, res) => {
    const response = ListToolsResponseSchema.parse({ tools });
    res.json(response);
  });

  app.get('/movies/details', async (req, res) => {
    const parseResult = MovieDetailsLookupSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error:
          'Invalid query. Provide exactly one of imdbId or title. Optional query params: year, plot.',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const result = await imdbClient.getMovieDetails(parseResult.data);
      res.json(result);
    } catch (error) {
      if (error instanceof ImdbClientError) {
        res.status(error.status ?? 502).json({ error: error.message });
        return;
      }

      throw error;
    }
  });

  app.get('/series/episodes', async (req, res) => {
    const parseResult = SeriesEpisodesLookupSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error:
          'Invalid query. Provide season plus exactly one of imdbId or title. Optional query params: year.',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const result = await imdbClient.getSeriesEpisodes(parseResult.data);
      res.json(result);
    } catch (error) {
      if (error instanceof ImdbClientError) {
        res.status(error.status ?? 502).json({ error: error.message });
        return;
      }

      throw error;
    }
  });

  app.get('/series/seasons', async (req, res) => {
    const parseResult = SeriesLookupSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error:
          'Invalid query. Provide exactly one of imdbId or title. Optional query params: year.',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const result = await imdbClient.getSeriesSeasons(parseResult.data);
      res.json(result);
    } catch (error) {
      if (error instanceof ImdbClientError) {
        res.status(error.status ?? 502).json({ error: error.message });
        return;
      }

      throw error;
    }
  });

  app.get('/plex/watch-history', async (req, res) => {
    const parseResult = PlexWatchHistoryLookupSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error:
          'Invalid query. Optional query params: limit, offset, accountId, librarySectionId, metadataItemId, viewedAtGte, sort.',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const result = await plexClient.listWatchHistory(parseResult.data);
      res.json(result);
    } catch (error) {
      if (error instanceof PlexClientError) {
        res.status(error.status ?? 502).json({ error: error.message });
        return;
      }

      throw error;
    }
  });

  app.post('/tools/call', async (req, res) => {
    const parseResult = ToolCallRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const toolCall = parseResult.data.tool_call;
    const toolResult = await executeToolCall(
      toolCall,
      tolokaClient,
      transmissionClient,
      imdbClient,
      plexClient,
    );

    const response = ToolCallResponseSchema.parse({
      tool_name: toolCall.function.name,
      tool_call_id: toolCall.id,
      result: toolResult,
    });

    res.json(response);
  });

  const port = config.PORT ?? 3000;
  app.listen(port, () => {
    logger.info('homefs-tool-server listening', { port });
  });
};

main().catch((error) => {
  logger.error('Fatal error in main()', { error: serializeError(error) });
  process.exitCode = 1;
});
