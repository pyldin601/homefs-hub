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
