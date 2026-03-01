import { z } from 'zod';

const SkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.unknown(),
});

const SkillsResponseSchema = z.object({
  skills: z.array(SkillSchema),
});

const SkillCallRequestSchema = z.object({
  command: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
});

const SkillCallResponseSchema = z.object({
  result: z.unknown(),
});

export type Skill = z.infer<typeof SkillSchema>;
export type SkillCallRequest = z.infer<typeof SkillCallRequestSchema>;
export type SkillCallResponse = z.infer<typeof SkillCallResponseSchema>;

export class SkillServerClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getSkills(): Promise<Skill[]> {
    const url = new URL('/skills', this.baseUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Skill server request failed with status ${response.status}`);
    }

    const { skills } = SkillsResponseSchema.parse(await response.json());

    return skills;
  }

  async callSkill(payload: SkillCallRequest): Promise<SkillCallResponse> {
    const url = new URL('/skills/call', this.baseUrl);
    const body = SkillCallRequestSchema.parse(payload);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Skill server request failed with status ${response.status}`);
    }

    const data = SkillCallResponseSchema.parse(await response.json());
    return data;
  }
}
