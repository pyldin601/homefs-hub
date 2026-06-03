import type { OllamaTool } from 'homefs-shared';

export const tools = [
  {
    type: 'function',
    function: {
      name: 'get_date',
      description:
        'Get essential date/time information: ISO timestamp, unix seconds, local and UTC datetime, weekday, timezone, and UTC offset. Optionally include a specific IANA timezone.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Optional IANA timezone, for example Europe/Lisbon or UTC',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_torrents',
      description:
        'List torrents from Transmission with name, hash, status, and percent downloaded.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_movie_details',
      description:
        'Fetch movie details from IMDb by IMDb title ID (for example tt0133093) or exact title. Use imdbId when available.',
      parameters: {
        type: 'object',
        properties: {
          imdbId: {
            type: 'string',
            description: 'IMDb title ID, for example tt0133093',
          },
          title: {
            type: 'string',
            description: 'Movie title to look up when IMDb ID is not known',
          },
          year: {
            type: 'string',
            description: 'Optional release year, for example 1999',
          },
          plot: {
            type: 'string',
            enum: ['short', 'full'],
            description: 'Plot length to return. Defaults to full.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_series_seasons',
      description:
        'Fetch the available season numbers for a TV series from IMDb by IMDb title ID or exact title. Use imdbId when available.',
      parameters: {
        type: 'object',
        properties: {
          imdbId: {
            type: 'string',
            description: 'IMDb series title ID, for example tt0944947',
          },
          title: {
            type: 'string',
            description: 'Series title to look up when IMDb ID is not known',
          },
          year: {
            type: 'string',
            description: 'Optional series release year, for example 2011',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_series_episodes',
      description:
        'Fetch the episode list for a specific TV series season from IMDb by IMDb title ID or exact title. Use imdbId when available.',
      parameters: {
        type: 'object',
        properties: {
          imdbId: {
            type: 'string',
            description: 'IMDb series title ID, for example tt0944947',
          },
          title: {
            type: 'string',
            description: 'Series title to look up when IMDb ID is not known',
          },
          year: {
            type: 'string',
            description: 'Optional series release year, for example 2011',
          },
          season: {
            type: 'integer',
            description: 'Season number to fetch, for example 1',
          },
        },
        required: ['season'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_plex_watch_history',
      description:
        'List recent Plex Media Server playback history. Admin tokens can see all users; regular tokens can see only their own history.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximum items to return, from 1 to 100. Defaults to 25.',
          },
          offset: {
            type: 'integer',
            description: 'Pagination offset. Defaults to 0.',
          },
          accountId: {
            type: 'integer',
            description: 'Optional Plex account ID filter.',
          },
          librarySectionId: {
            type: 'integer',
            description: 'Optional Plex library section ID filter.',
          },
          metadataItemId: {
            type: 'integer',
            description:
              'Optional Plex metadata item ID filter. For a show, this can return history for its episodes.',
          },
          viewedAtGte: {
            type: 'integer',
            description: 'Optional unix timestamp lower bound for viewedAt.',
          },
          sort: {
            type: 'string',
            enum: ['viewedAt:desc', 'viewedAt:asc'],
            description: 'Sort order. Defaults to viewedAt:desc.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_torrent_from_transmission',
      description: 'Remove a torrent from Transmission by its hash.',
      parameters: {
        type: 'object',
        properties: {
          hash: {
            type: 'string',
            description: 'Torrent hash string (hashString from list_torrents)',
          },
        },
        required: ['hash'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_torrents',
      description:
        'Search torrents on Toloka by query. Returned topicId is the default Toloka numeric ID (for example 679577).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_torrent_bookmarks',
      description:
        'List bookmarked torrent topics from Toloka. topicId should be treated as the default Toloka numeric ID.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_torrent_bookmarks_by_title',
      description:
        'Search bookmarked torrent topics by title and return matching topic IDs. topicId is the default Toloka numeric ID.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Part of bookmark title to search for',
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bookmark_torrent',
      description:
        'Add a torrent topic to Toloka bookmarks by topicId. Use default Toloka numeric ID (for example 679577); t679577 is also accepted.',
      parameters: {
        type: 'object',
        properties: {
          topicId: {
            type: 'string',
            description: 'Default Toloka numeric ID, for example 679577',
          },
        },
        required: ['topicId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_torrent_bookmark',
      description:
        'Remove a torrent topic from Toloka bookmarks by topicId. Use default Toloka numeric ID (for example 679577); t679577 is also accepted.',
      parameters: {
        type: 'object',
        properties: {
          topicId: {
            type: 'string',
            description: 'Default Toloka numeric ID, for example 679577',
          },
        },
        required: ['topicId'],
        additionalProperties: false,
      },
    },
  },
] satisfies ReadonlyArray<OllamaTool>;
