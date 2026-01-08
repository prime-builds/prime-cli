import type { ChatMessageInput, MissionManifest } from "../../shared/src/contracts";
import type { AdapterRegistry } from "./adapters/registry";
import { Logger } from "./logger";
import { PromptLoader } from "./prompts/loader";
import type { WorkflowDefinition } from "./run/workflow";
import { newId } from "./utils/ids";

export class Planner {
  private readonly prompts: PromptLoader;
  private readonly registry: AdapterRegistry;
  private readonly logger: Logger;

  constructor(prompts: PromptLoader, registry: AdapterRegistry, logger: Logger) {
    this.prompts = prompts;
    this.registry = registry;
    this.logger = logger;
  }

  plan(input: {
    project_id: string;
    chat_id?: string;
    message: ChatMessageInput;
    mission: MissionManifest;
  }): WorkflowDefinition {
    const plannerPrompt = this.prompts.loadPlannerPrompt();
    const criticPrompt = this.prompts.loadCriticPrompt();
    this.logger.debug("Planner prompts loaded", {
      planner_bytes: plannerPrompt.length,
      critic_bytes: criticPrompt.length
    });

    const adapters = this.registry.list();
    if (adapters.length === 0) {
      return {
        workflow_id: newId(),
        project_id: input.project_id,
        chat_id: input.chat_id,
        scope: { targets: input.mission.scope_targets },
        steps: []
      };
    }

    const adapter = adapters[0];
    return {
      workflow_id: newId(),
      project_id: input.project_id,
      chat_id: input.chat_id,
      scope: { targets: input.mission.scope_targets },
      steps: [
        {
          id: "step-1",
          adapter: adapter.id,
          category: "dry-run",
          risk: "low",
          inputs: {
            message: input.message.content,
            mission: {
              objective: input.mission.objective,
              scope_targets: input.mission.scope_targets
            }
          },
          outputs: {},
          limits: {},
          params: {}
        }
      ]
    };
  }
}
