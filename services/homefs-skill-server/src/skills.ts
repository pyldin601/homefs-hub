export interface Skill {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
}

export type Skills = ReadonlyArray<Skill>;

export const skills = [
  {
    name: 'system.time',
    description: 'Get the current system time as an ISO string.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
] satisfies Skills;
