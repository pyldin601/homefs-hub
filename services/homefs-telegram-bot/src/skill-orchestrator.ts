import { createInitialInstruction } from './instruction';
import { ModelClient } from './model-client';
import { SkillServerClient } from './skill-server-client';

type SkillOrchestratorOptions = {
  maxSteps?: number;
};

export class SkillOrchestrator {
  private readonly maxSteps: number;
  private readonly modelClient: ModelClient;
  private readonly skillServerClient: SkillServerClient;

  constructor(
    dependencies: {
      modelClient: ModelClient;
      skillServerClient: SkillServerClient;
    },
    options: SkillOrchestratorOptions = {},
  ) {
    this.modelClient = dependencies.modelClient;
    this.skillServerClient = dependencies.skillServerClient;
    this.maxSteps = options.maxSteps ?? 8;
  }

  async run(userMessage: string): Promise<string> {
    const skills = await this.skillServerClient.getSkills();
    let instruction = createInitialInstruction(skills);

    for (let step = 0; step < this.maxSteps; step += 1) {
      const modelResponse = await this.modelClient.respond(instruction, userMessage);

      if ('final' in modelResponse) {
        return modelResponse.final;
      }

      const skillCall = modelResponse.skill_call;
      const skillResult = await this.skillServerClient.callSkill({
        command: skillCall.name,
        arguments: skillCall.arguments,
      });

      instruction = `${instruction}

SKILL CALLED:
${JSON.stringify({ skill_call: skillCall, result: skillResult.result })}`;
    }

    throw new Error(`Model did not return a final response in ${this.maxSteps} steps`);
  }
}
