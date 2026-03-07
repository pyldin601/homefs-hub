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
import { TolokaClient } from './toloka';
import { tools } from './tools';

const SearchTorrentsArgsSchema = z.object({ query: z.string().min(1) }).strict();
const SearchBookmarksByTitleArgsSchema = z.object({ title: z.string().min(1) }).strict();
const TopicIdArgsSchema = z.object({ topicId: z.string().min(1) }).strict();
const EmptyArgsSchema = z.object({}).strict();

const buildDateTimePayload = (): Record<string, unknown> => {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHoursPart = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
  const offsetMinutesPart = String(absOffsetMinutes % 60).padStart(2, '0');
  const utcOffset = `${sign}${offsetHoursPart}:${offsetMinutesPart}`;
  const unixMilliseconds = now.getTime();
  const unixSeconds = Math.floor(unixMilliseconds / 1000);
  const isoString = now.toISOString();

  return {
    iso: isoString,
    local: {
      date: now.toLocaleDateString('en-CA'),
      time: now.toLocaleTimeString('en-GB', { hour12: false }),
      datetime: now.toLocaleString('sv-SE', { hour12: false }),
      timezone: tz,
      utcOffset,
    },
    utc: {
      date: isoString.slice(0, 10),
      time: isoString.slice(11, 19),
      datetime: isoString.slice(0, 19),
    },
    unix: {
      seconds: unixSeconds,
      milliseconds: unixMilliseconds,
    },
    parts: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      weekday: now.getDay(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      millisecond: now.getMilliseconds(),
    },
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
): Promise<unknown> => {
  if (toolCall.function.name === 'get_date') {
    const parsed = EmptyArgsSchema.safeParse(parseToolArguments(toolCall.function.arguments));
    if (!parsed.success) {
      return { error: 'Invalid arguments for get_date. Expected {}' };
    }

    return buildDateTimePayload();
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

  const app = express();
  app.use(express.json());

  app.get('/tools', (_req, res) => {
    const response = ListToolsResponseSchema.parse({ tools });
    res.json(response);
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
    const toolResult = await executeToolCall(toolCall, tolokaClient);

    const response = ToolCallResponseSchema.parse({
      tool_name: toolCall.function.name,
      tool_call_id: toolCall.id,
      result: toolResult,
    });

    res.json(response);
  });

  const port = config.PORT ?? 3000;
  app.listen(port, () => {
    console.log(`homefs-tool-server listening on ${port}`);
  });
};

main().catch((error) => {
  console.error('Fatal error in main()', error);
  process.exitCode = 1;
});
