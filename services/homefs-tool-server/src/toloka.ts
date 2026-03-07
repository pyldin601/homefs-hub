const TOLOKA_HOST = 'https://toloka.to';
const DEFAULT_TIMEOUT_MS = 15_000;

export type TolokaCategory = 'movies' | 'series' | { other: string };

export type TopicMeta = {
  topicId: string;
  title: string;
  category: TolokaCategory;
  seeds?: number;
  peers?: number;
};

export type DownloadMeta = {
  registeredAt: string;
  downloadId: string;
};

export type Topic = {
  topicMeta: TopicMeta;
  downloadMeta: DownloadMeta;
};

export class TolokaClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TolokaClientError';
    this.status = status;
  }
}

type TolokaClientOptions = {
  username: string;
  password: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class TolokaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cookieJar = new Map<string, string>();

  private constructor(baseUrl: string, timeoutMs: number) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  static async create(options: TolokaClientOptions): Promise<TolokaClient> {
    const client = new TolokaClient(
      options.baseUrl ?? TOLOKA_HOST,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    await client.login(options.username, options.password);
    return client;
  }

  async download(downloadId: string): Promise<Uint8Array> {
    const response = await this.request(`/download.php?id=${encodeURIComponent(downloadId)}`);
    if (response.status !== 200) {
      throw new TolokaClientError(
        `Unexpected status in download: ${response.status}`,
        response.status,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async getWatchedTopics(): Promise<Topic[]> {
    const topicsMeta = await this.getWatchedTopicsMeta();
    const topics: Topic[] = [];

    for (const topicMeta of topicsMeta) {
      const downloadMeta = await this.getDownloadMeta(topicMeta.topicId);
      if (downloadMeta) {
        topics.push({ topicMeta, downloadMeta });
      }
      await sleep(5_000);
    }

    return topics;
  }

  async listBookmarkedTopics(): Promise<TopicMeta[]> {
    return this.getWatchedTopicsMeta();
  }

  async getSearchResultsMeta(query: string): Promise<TopicMeta[]> {
    const response = await this.request(`/tracker.php?nm=${encodeURIComponent(query)}`);
    if (response.status !== 200) {
      throw new TolokaClientError(
        `Unexpected status in search: ${response.status}`,
        response.status,
      );
    }

    const document = await response.text();
    console.log('Search results:', document);
    return parseSearchResultsMeta(document);
  }

  async addTopicToBookmarks(topicId: string): Promise<void> {
    const id = normalizeTopicId(topicId);
    const response = await this.request(`/viewtopic.php?t=${encodeURIComponent(id)}&watch=topic`);
    if (!isSuccessfulMutationStatus(response.status)) {
      throw new TolokaClientError(
        `Unexpected status in add bookmark: ${response.status}`,
        response.status,
      );
    }
  }

  async removeTopicFromBookmarks(topicId: string): Promise<void> {
    const id = normalizeTopicId(topicId);
    const response = await this.request(`/viewtopic.php?t=${encodeURIComponent(id)}&unwatch=topic`);
    if (!isSuccessfulMutationStatus(response.status)) {
      throw new TolokaClientError(
        `Unexpected status in remove bookmark: ${response.status}`,
        response.status,
      );
    }
  }

  private async login(username: string, password: string): Promise<void> {
    const body = new URLSearchParams({
      username,
      password,
      autologin: 'on',
      ssl: 'on',
      redirect: 'index.php?',
      login: 'Вхід',
    });

    const response = await this.request('/login.php', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    if (response.status !== 302) {
      throw new TolokaClientError('Invalid login or password', response.status);
    }
  }

  private async getWatchedTopicsMeta(): Promise<TopicMeta[]> {
    const response = await this.request('/watched_topics.php');
    if (response.status !== 200) {
      throw new TolokaClientError(
        `Unexpected status in watched topics: ${response.status}`,
        response.status,
      );
    }

    const document = await response.text();
    return parseWatchedTopicsMeta(document);
  }

  private async getDownloadMeta(topicId: string): Promise<DownloadMeta | null> {
    const response = await this.request(`/${topicId}`);
    if (response.status !== 200) {
      throw new TolokaClientError(
        `Unexpected status in topic page: ${response.status}`,
        response.status,
      );
    }

    const document = await response.text();
    return parseDownloadMeta(document);
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path, this.baseUrl);
    const headers = new Headers(init.headers ?? {});
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader.length > 0) {
      headers.set('cookie', cookieHeader);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      this.storeCookies(response.headers);
      return response;
    } catch (error) {
      throw new TolokaClientError(`Request failed: ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildCookieHeader(): string {
    return [...this.cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private storeCookies(headers: Headers): void {
    const setCookies = getSetCookieHeaders(headers);
    for (const cookie of setCookies) {
      const pair = cookie.split(';', 1)[0];
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name.length === 0) {
        continue;
      }

      this.cookieJar.set(name, value);
    }
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }

  const raw = headers.get('set-cookie');
  return raw ? splitSetCookieHeader(raw) : [];
}

function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=[^;]+=[^;]+)/g).map((item) => item.trim());
}

export function parseWatchedTopicsMeta(document: string): TopicMeta[] {
  const rows = extractRows(document);
  const topics: TopicMeta[] = [];

  for (const row of rows) {
    const columns = extractColumns(row);
    if (columns.length < 2) {
      continue;
    }

    const topicLink = extractTopicLink(columns[0] ?? row) ?? extractTopicLink(row);
    if (!topicLink) {
      continue;
    }

    const categoryRaw = extractFirstAnchorText(columns[1] ?? '') ?? cleanText(columns[1] ?? '');

    topics.push({
      topicId: topicLink.topicId,
      title: topicLink.title,
      category: parseCategory(categoryRaw),
    });
  }

  return topics;
}

export function parseSearchResultsMeta(document: string): TopicMeta[] {
  const rows = extractRows(document);
  const topics: TopicMeta[] = [];

  for (const row of rows) {
    const cells = extractColumnCells(row);
    const columns = cells.map((cell) => cell.html);
    if (columns.length < 3) {
      continue;
    }

    const topicLink = extractTopicLink(columns[2] ?? row) ?? extractTopicLink(row);
    if (!topicLink) {
      continue;
    }

    const categoryRaw = extractFirstAnchorText(columns[1] ?? '') ?? '';
    const title = extractBoldText(topicLink.raw) ?? topicLink.title;
    const swarmStats = extractSwarmStats(cells);

    topics.push({
      topicId: topicLink.topicId,
      title,
      category: parseCategory(categoryRaw),
      ...(swarmStats.seeds !== null ? { seeds: swarmStats.seeds } : {}),
      ...(swarmStats.peers !== null ? { peers: swarmStats.peers } : {}),
    });
  }

  return topics;
}

export function parseDownloadMeta(document: string): DownloadMeta | null {
  const downloadMatch = document.match(/class=["']piwik_download["'][^>]*href=["']([^"']+)["']/i);
  if (!downloadMatch) {
    return null;
  }

  const href = downloadMatch[1];
  const idMatch = href.match(/download\.php\?id=([^&"']+)/i);
  if (!idMatch) {
    return null;
  }

  const registeredAt = extractRegisteredAt(document);
  return {
    downloadId: decodeHtmlEntities(idMatch[1]),
    registeredAt,
  };
}

function extractRegisteredAt(document: string): string {
  const btTableMatch = document.match(
    /<table\b[^>]*\bclass=(?:"[^"]*\bbtTbl\b[^"]*"|'[^']*\bbtTbl\b[^']*'|[^\s>]*\bbtTbl\b[^\s>]*)[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!btTableMatch) {
    return '';
  }

  const rows = [
    ...btTableMatch[1].matchAll(/<tr\b[^>]*\bclass=["']row4_to["'][^>]*>([\s\S]*?)<\/tr>/gi),
  ];
  if (rows.length < 2) {
    return '';
  }

  const columns = extractColumns(rows[1]?.[1] ?? '');
  if (columns.length < 2) {
    return '';
  }

  const dateMatch = cleanText(columns[1] ?? '').match(/\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\b/);
  return dateMatch?.[0] ?? '';
}

function parseCategory(raw: string): TolokaCategory {
  const normalized = raw.toLowerCase();
  if (normalized.includes('фільм')) {
    return 'movies';
  }
  if (normalized.includes('серіал')) {
    return 'series';
  }
  return { other: raw };
}

function isSuccessfulMutationStatus(status: number): boolean {
  return status === 200 || status === 301 || status === 302 || status === 303;
}

function normalizeTopicId(topicId: string): string {
  return topicId.startsWith('t') ? topicId.slice(1) : topicId;
}

function topicIdFromHref(href: string): string | null {
  const normalizedHref = decodeHtmlEntities(href);
  const tMatch = normalizedHref.match(/(?:^|[?&])t=(\d+)/);
  if (tMatch) {
    return `t${tMatch[1]}`;
  }

  const shortMatch = normalizedHref.match(/\/?(t\d+)(?:$|[/?#])/i);
  if (shortMatch) {
    return shortMatch[1].toLowerCase();
  }

  return null;
}

function extractRows(document: string): string[] {
  const forumlineTablePattern =
    /<table\b[^>]*\bclass=(?:"[^"]*\bforumline\b[^"]*"|'[^']*\bforumline\b[^']*'|[^\s>]*\bforumline\b[^\s>]*)[^>]*>([\s\S]*?)<\/table>/gi;

  const rows: string[] = [];
  for (const match of document.matchAll(forumlineTablePattern)) {
    rows.push(...[...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]));
  }

  return rows;
}

function extractColumns(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
}

function extractColumnCells(rowHtml: string): Array<{ attributes: string; html: string }> {
  return [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({
    attributes: m[1] ?? '',
    html: m[2] ?? '',
  }));
}

function extractFirstHref(html: string): { href: string; text: string; raw: string } | null {
  const match = html.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!match) {
    return null;
  }

  return {
    href: match[1],
    text: cleanText(match[2]),
    raw: match[2],
  };
}

function extractTopicLink(
  html: string,
): { topicId: string; title: string; href: string; raw: string } | null {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const anchor of anchors) {
    const href = anchor[1];
    const topicId = topicIdFromHref(href);
    if (!topicId) {
      continue;
    }

    return {
      topicId,
      title: cleanText(anchor[2]),
      href,
      raw: anchor[2],
    };
  }

  return null;
}

function extractBoldText(html: string): string | null {
  const match = html.match(/<b\b[^>]*>([\s\S]*?)<\/b>/i);
  if (!match) {
    return null;
  }

  return cleanText(match[1]);
}

function extractFirstAnchorText(html: string): string | null {
  const link = extractFirstHref(html);
  return link ? link.text : null;
}

function extractInteger(text: string): number | null {
  const normalized = text.replace(/[^\d]/g, '');
  if (normalized.length === 0) {
    return null;
  }

  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}

function extractSwarmStats(cells: Array<{ attributes: string; html: string }>): {
  seeds: number | null;
  peers: number | null;
} {
  let seeds: number | null = null;
  let peers: number | null = null;

  for (const cell of cells) {
    const attrs = cell.attributes.toLowerCase();
    const value = extractInteger(cleanText(cell.html));
    if (value === null) {
      continue;
    }

    if (seeds === null && (attrs.includes('seed') || attrs.includes('seeder'))) {
      seeds = value;
      continue;
    }

    if (peers === null && (attrs.includes('leech') || attrs.includes('peer'))) {
      peers = value;
    }
  }

  // Fallback: if class names are missing, pick trailing numeric columns.
  if (seeds === null || peers === null) {
    const trailingNumbers = cells
      .map((cell) => extractInteger(cleanText(cell.html)))
      .filter((value): value is number => value !== null)
      .slice(-2);

    if (trailingNumbers.length === 2) {
      seeds = seeds ?? trailingNumbers[0];
      peers = peers ?? trailingNumbers[1];
    }
  }

  return { seeds, peers };
}

function cleanText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
