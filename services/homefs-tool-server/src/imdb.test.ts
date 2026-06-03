import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ImdbClient, ImdbClientError } from './imdb';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('imdb client', () => {
  it('fetches movie details by IMDb ID and normalizes OMDb response fields', async () => {
    const requestedUrls: URL[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(new URL(input instanceof Request ? input.url : input.toString()));

      return new Response(
        JSON.stringify({
          Title: 'The Matrix',
          Year: '1999',
          Rated: 'R',
          Released: '31 Mar 1999',
          Runtime: '136 min',
          Genre: 'Action, Sci-Fi',
          Director: 'Lana Wachowski, Lilly Wachowski',
          Writer: 'Lilly Wachowski, Lana Wachowski',
          Actors: 'Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss',
          Plot: 'A computer hacker learns about the true nature of reality.',
          Language: 'English',
          Country: 'United States',
          Awards: 'Won 4 Oscars',
          Poster: 'https://example.test/poster.jpg',
          Ratings: [{ Source: 'Internet Movie Database', Value: '8.7/10' }],
          Metascore: '73',
          imdbRating: '8.7',
          imdbVotes: '2,000,000',
          imdbID: 'tt0133093',
          Type: 'movie',
          DVD: 'N/A',
          BoxOffice: '$172,076,928',
          Production: 'N/A',
          Website: 'N/A',
          Response: 'True',
        }),
      );
    }) as typeof fetch;

    const client = new ImdbClient({
      apiKey: 'test-key',
      baseUrl: 'https://omdb.example.test/',
    });

    const details = await client.getMovieDetails({ imdbId: 'tt0133093', plot: 'short' });

    const requestedUrl = requestedUrls[0];
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.origin, 'https://omdb.example.test');
    assert.equal(requestedUrl.searchParams.get('apikey'), 'test-key');
    assert.equal(requestedUrl.searchParams.get('i'), 'tt0133093');
    assert.equal(requestedUrl.searchParams.get('plot'), 'short');
    assert.equal(details.title, 'The Matrix');
    assert.equal(details.imdbId, 'tt0133093');
    assert.equal(details.dvd, null);
    assert.equal(details.production, null);
    assert.equal(details.website, null);
    assert.deepEqual(details.ratings, [{ source: 'Internet Movie Database', value: '8.7/10' }]);
  });

  it('reports missing API key before making a request', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fetch should not be called');
    }) as typeof fetch;

    const client = new ImdbClient({});

    await assert.rejects(
      () => client.getMovieDetails({ title: 'The Matrix' }),
      (error) =>
        error instanceof ImdbClientError &&
        error.message === 'IMDb lookup is not configured. Set OMDB_API_KEY or IMDB_API_KEY.',
    );
  });

  it('fetches a series season episode list by IMDb ID', async () => {
    const requestedUrls: URL[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(new URL(input instanceof Request ? input.url : input.toString()));

      return new Response(
        JSON.stringify({
          Title: 'Game of Thrones',
          Season: '1',
          totalSeasons: '8',
          Episodes: [
            {
              Title: 'Winter Is Coming',
              Released: '2011-04-17',
              Episode: '1',
              imdbRating: '8.9',
              imdbID: 'tt1480055',
            },
            {
              Title: 'The Kingsroad',
              Released: '2011-04-24',
              Episode: '2',
              imdbRating: '8.6',
              imdbID: 'tt1668746',
            },
          ],
          Response: 'True',
        }),
      );
    }) as typeof fetch;

    const client = new ImdbClient({
      apiKey: 'test-key',
      baseUrl: 'https://omdb.example.test/',
    });

    const details = await client.getSeriesEpisodes({ imdbId: 'tt0944947', season: 1 });

    const requestedUrl = requestedUrls[0];
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.searchParams.get('apikey'), 'test-key');
    assert.equal(requestedUrl.searchParams.get('i'), 'tt0944947');
    assert.equal(requestedUrl.searchParams.get('Season'), '1');
    assert.equal(details.title, 'Game of Thrones');
    assert.equal(details.season, 1);
    assert.equal(details.totalSeasons, 8);
    assert.deepEqual(details.episodes, [
      {
        title: 'Winter Is Coming',
        released: '2011-04-17',
        episode: 1,
        imdbRating: '8.9',
        imdbId: 'tt1480055',
      },
      {
        title: 'The Kingsroad',
        released: '2011-04-24',
        episode: 2,
        imdbRating: '8.6',
        imdbId: 'tt1668746',
      },
    ]);
  });

  it('lists available seasons for a series by IMDb ID', async () => {
    const requestedUrls: URL[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(new URL(input instanceof Request ? input.url : input.toString()));

      return new Response(
        JSON.stringify({
          Title: 'Game of Thrones',
          Year: '2011-2019',
          Rated: 'TV-MA',
          Released: '17 Apr 2011',
          Runtime: '57 min',
          Genre: 'Action, Adventure, Drama',
          Director: 'N/A',
          Writer: 'David Benioff, D.B. Weiss',
          Actors: 'Emilia Clarke, Peter Dinklage, Kit Harington',
          Plot: 'Nine noble families fight for control over the lands of Westeros.',
          Language: 'English',
          Country: 'United States, United Kingdom',
          Awards: 'Won 59 Primetime Emmys',
          Poster: 'https://example.test/poster.jpg',
          Ratings: [{ Source: 'Internet Movie Database', Value: '9.2/10' }],
          Metascore: 'N/A',
          imdbRating: '9.2',
          imdbVotes: '2,400,000',
          imdbID: 'tt0944947',
          Type: 'series',
          totalSeasons: '8',
          Response: 'True',
        }),
      );
    }) as typeof fetch;

    const client = new ImdbClient({
      apiKey: 'test-key',
      baseUrl: 'https://omdb.example.test/',
    });

    const details = await client.getSeriesSeasons({ imdbId: 'tt0944947' });

    const requestedUrl = requestedUrls[0];
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.searchParams.get('apikey'), 'test-key');
    assert.equal(requestedUrl.searchParams.get('i'), 'tt0944947');
    assert.equal(details.title, 'Game of Thrones');
    assert.equal(details.year, '2011-2019');
    assert.equal(details.imdbId, 'tt0944947');
    assert.equal(details.totalSeasons, 8);
    assert.deepEqual(details.seasons, [1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
