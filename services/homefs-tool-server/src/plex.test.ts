import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PlexClient, PlexClientError } from './plex';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('plex client', () => {
  it('lists watch history with pagination and filters', async () => {
    const requestedUrls: URL[] = [];
    const requestedHeaders: Headers[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrls.push(new URL(input instanceof Request ? input.url : input.toString()));
      requestedHeaders.push(new Headers(init?.headers));

      return new Response(
        JSON.stringify({
          MediaContainer: {
            offset: 10,
            size: 1,
            totalSize: 123,
            Metadata: [
              {
                accountID: 1,
                deviceID: 2,
                historyKey: '/status/sessions/history/metadata/99',
                key: '/library/metadata/99',
                librarySectionID: 3,
                ratingKey: '99',
                title: 'Winter Is Coming',
                parentTitle: 'Season 1',
                grandparentTitle: 'Game of Thrones',
                originalTitle: 'Winter Is Coming',
                type: 'episode',
                year: '2011',
                originallyAvailableAt: '2011-04-17',
                viewedAt: 1_714_000_000,
                thumb: '/library/metadata/99/thumb',
              },
            ],
          },
        }),
      );
    }) as typeof fetch;

    const client = new PlexClient({
      baseUrl: 'http://plex.example.test:32400',
      token: 'test-token',
    });

    const history = await client.listWatchHistory({
      limit: 50,
      offset: 10,
      accountId: 1,
      librarySectionId: 3,
      metadataItemId: 99,
      viewedAtGte: 1_700_000_000,
      sort: 'viewedAt:asc',
    });

    const requestedUrl = requestedUrls[0];
    const requestedHeader = requestedHeaders[0];
    assert.ok(requestedUrl);
    assert.ok(requestedHeader);
    assert.equal(requestedUrl.origin, 'http://plex.example.test:32400');
    assert.equal(requestedUrl.pathname, '/status/sessions/history/all');
    assert.equal(requestedUrl.searchParams.get('X-Plex-Container-Start'), '10');
    assert.equal(requestedUrl.searchParams.get('X-Plex-Container-Size'), '50');
    assert.equal(requestedUrl.searchParams.get('accountID'), '1');
    assert.equal(requestedUrl.searchParams.get('librarySectionID'), '3');
    assert.equal(requestedUrl.searchParams.get('metadataItemID'), '99');
    assert.equal(requestedUrl.searchParams.get('viewedAt'), 'viewedAt>=1700000000');
    assert.equal(requestedUrl.searchParams.get('sort'), 'viewedAt:asc');
    assert.equal(requestedHeader.get('x-plex-token'), 'test-token');
    assert.equal(history.offset, 10);
    assert.equal(history.limit, 50);
    assert.equal(history.size, 1);
    assert.equal(history.totalSize, 123);
    assert.deepEqual(history.items, [
      {
        accountId: 1,
        deviceId: 2,
        historyKey: '/status/sessions/history/metadata/99',
        key: '/library/metadata/99',
        librarySectionId: 3,
        ratingKey: 99,
        title: 'Winter Is Coming',
        parentTitle: 'Season 1',
        grandparentTitle: 'Game of Thrones',
        originalTitle: 'Winter Is Coming',
        type: 'episode',
        year: 2011,
        originallyAvailableAt: '2011-04-17',
        viewedAt: 1_714_000_000,
        viewedAtIso: '2024-04-24T23:06:40.000Z',
        thumb: '/library/metadata/99/thumb',
      },
    ]);
  });

  it('reports missing Plex config before making a request', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fetch should not be called');
    }) as typeof fetch;

    const client = new PlexClient({});

    await assert.rejects(
      () => client.listWatchHistory(),
      (error) =>
        error instanceof PlexClientError &&
        error.message === 'Plex is not configured. Set PLEX_URL and PLEX_TOKEN.',
    );
  });
});
