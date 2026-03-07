import type { OllamaTool } from 'homefs-shared';

export const tools = [
  {
    type: 'function',
    function: {
      name: 'get_date',
      description:
        'Get detailed current date and time data, including ISO, local and UTC values, timezone, unix timestamps, and date/time parts.',
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
