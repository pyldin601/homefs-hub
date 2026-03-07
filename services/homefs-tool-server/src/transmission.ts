import { logger, serializeError } from './logger';

const DEFAULT_TIMEOUT_MS = 15_000;

type TransmissionClientOptions = {
  url: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
};

type TorrentRecord = {
  name?: string;
  hashString?: string;
  status?: number;
  percentDone?: number;
};

type TorrentGetResponse = {
  result: string;
  arguments?: {
    torrents?: TorrentRecord[];
  };
};

export type TorrentSummary = {
  name: string;
  hash: string;
  status: string;
  percentDownloaded: number;
};

export class TransmissionClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransmissionClientError';
  }
}

export class TransmissionClient {
  private readonly url: URL;
  private readonly username?: string;
  private readonly password?: string;
  private readonly timeoutMs: number;
  private sessionId: string | null = null;

  constructor(options: TransmissionClientOptions) {
    this.url = new URL(options.url);
    this.username = options.username;
    this.password = options.password;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async listTorrents(): Promise<TorrentSummary[]> {
    const response = await this.callRpc('torrent-get', {
      fields: ['name', 'hashString', 'status', 'percentDone'],
    });

    const torrents = response.arguments?.torrents ?? [];
    return torrents
      .filter(
        (item): item is Required<Pick<TorrentRecord, 'name' | 'hashString'>> & TorrentRecord =>
          typeof item.name === 'string' && typeof item.hashString === 'string',
      )
      .map((item) => ({
        name: item.name,
        hash: item.hashString,
        status: statusToString(item.status),
        percentDownloaded: toPercent(item.percentDone),
      }));
  }

  private async callRpc(
    method: string,
    args: Record<string, unknown>,
  ): Promise<TorrentGetResponse> {
    const payload = {
      method,
      arguments: args,
    };

    const firstTry = await this.request(payload);
    if (firstTry.status === 409) {
      this.sessionId = firstTry.headers.get('x-transmission-session-id');
      if (!this.sessionId) {
        throw new TransmissionClientError(
          'Transmission returned 409 without x-transmission-session-id header',
        );
      }

      const secondTry = await this.request(payload);
      return await this.parseResponse(secondTry);
    }

    return await this.parseResponse(firstTry);
  }

  private async request(payload: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers({
        'content-type': 'application/json',
      });
      if (this.sessionId) {
        headers.set('x-transmission-session-id', this.sessionId);
      }

      if (this.username && this.password) {
        headers.set(
          'authorization',
          `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
        );
      }

      return await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      logger.error('transmission: request failed', { error: serializeError(error) });
      throw new TransmissionClientError(`Transmission request failed: ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse(response: Response): Promise<TorrentGetResponse> {
    if (!response.ok) {
      const body = await response.text();
      throw new TransmissionClientError(
        `Transmission RPC failed with status ${response.status}: ${body}`,
      );
    }

    const json = (await response.json()) as TorrentGetResponse;
    if (json.result !== 'success') {
      throw new TransmissionClientError(`Transmission RPC returned error: ${json.result}`);
    }

    return json;
  }
}

const statusToString = (value: number | undefined): string => {
  switch (value) {
    case 0:
      return 'stopped';
    case 1:
      return 'check_wait';
    case 2:
      return 'checking';
    case 3:
      return 'download_wait';
    case 4:
      return 'downloading';
    case 5:
      return 'seed_wait';
    case 6:
      return 'seeding';
    default:
      return 'unknown';
  }
};

const toPercent = (value: number | undefined): number => {
  const normalized = typeof value === 'number' ? value : 0;
  const percent = normalized * 100;
  return Math.round(percent * 100) / 100;
};
