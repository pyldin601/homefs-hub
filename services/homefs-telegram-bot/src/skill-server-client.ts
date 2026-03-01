import { z } from 'zod';

const SkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.unknown(),
});

const SkillsResponseSchema = z.object({
  skills: z.array(SkillSchema),
});

export type Skill = z.infer<typeof SkillSchema>;

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
}
