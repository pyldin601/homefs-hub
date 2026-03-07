import type { OllamaTool } from 'homefs-shared';

export const tools = [
  {
    type: 'function',
    function: {
      name: 'system.time',
      description: 'Get the current system time as an ISO string.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
] satisfies ReadonlyArray<OllamaTool>;
