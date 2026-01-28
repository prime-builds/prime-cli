import type { ChatMessageInput, MissionManifest } from "../../../shared/src/contracts";
import type { AdapterRegistry } from "../adapters/registry";
import type { DocsService } from "../docs";
import type { Logger } from "../logger";
import type { StorageRepos } from "../storage";
import { buildPlannerContext } from "./context";
import type { PlannerContext, PlannerPlanResult, PlannerProvider, PlannerTelemetry } from "./types";
import type { WorkflowDefinition } from "../run/workflow";
import { validateWorkflow } from "../run/validator";
import { newId } from "../utils/ids";

export class PlannerService {
  private readonly providers: Map<string, PlannerProvider>;
  private readonly registry: AdapterRegistry;
  private readonly docs: DocsService;
  private readonly repos: StorageRepos;
  private readonly logger: Logger;
  private readonly promptVersion: string;
  private readonly selectedProviderId: string;
  private readonly enableCritic: boolean;

  constructor(input: {
    providers: PlannerProvider[];
    registry: AdapterRegistry;
    docs: DocsService;
    repos: StorageRepos;
    logger: Logger;
    promptVersion: string;
    selectedProviderId: string;
    enableCritic: boolean;
    providerSettings?: Record<string, unknown>;
  }) {
    this.providers = new Map(input.providers.map((provider) => [provider.id, provider]));
    this.registry = input.registry;
    this.docs = input.docs;
    this.repos = input.repos;
    this.logger = input.logger;
    this.promptVersion = input.promptVersion;
    this.selectedProviderId = input.selectedProviderId;
    this.enableCritic = input.enableCritic;

    if (input.providerSettings) {
      const provider = this.providers.get(input.selectedProviderId);
      provider?.configure?.(input.providerSettings);
    }
  }

  async planForMessage(input: {
    project_id: string;
    chat_id?: string;
    message: ChatMessageInput;
    mission: MissionManifest;
    project_root?: string;
  }): Promise<{ workflow: WorkflowDefinition; telemetry: PlannerTelemetry }> {
    const context = buildPlannerContext({
      project_id: input.project_id,
      chat_id: input.chat_id,
      message: { role: input.message.role, content: input.message.content },
      mission: input.mission,
      project_root: input.project_root,
      repos: this.repos,
      docs: this.docs,
      registry: this.registry
    });

    const provider =
      this.providers.get(this.selectedProviderId) ??
      this.providers.get("local.heuristic");

    if (!provider) {
      return {
        workflow: emptyWorkflow(context),
        telemetry: {
          provider_id: "unknown",
          prompt_version: this.promptVersion
        }
      };
    }

    const start = Date.now();
    let planResult: PlannerPlanResult | null = null;
    try {
      planResult = await provider.plan(context);
    } catch (error) {
      this.logger.warn("Planner provider failed", {
        provider_id: provider.id,
        error: error instanceof Error ? error.message : "unknown"
      });
      return {
        workflow: emptyWorkflow(context),
        telemetry: {
          provider_id: provider.id,
          prompt_version: this.promptVersion,
          latency_ms: Date.now() - start
        }
      };
    }

    const resolved = resolvePlanResult(planResult, provider.id, this.promptVersion, start);
    let workflow: WorkflowDefinition;
    try {
      workflow = parseWorkflowJson(resolved.workflow_json);
      validateWorkflow(workflow);
    } catch (error) {
      this.logger.warn("Planner output rejected", {
        provider_id: provider.id,
        error: error instanceof Error ? error.message : "invalid"
      });
      return { workflow: emptyWorkflow(context), telemetry: resolved.telemetry };
    }

    if (this.enableCritic && provider.critic) {
      const criticResult = await provider.critic(context, resolved.workflow_json);
      const issues = criticResult.issues ?? [];
      if (!criticResult.ok) {
        this.logger.warn("Planner critic rejected workflow", {
          provider_id: provider.id,
          issues
        });
        return { workflow: emptyWorkflow(context), telemetry: resolved.telemetry };
      }
    }

    return { workflow, telemetry: resolved.telemetry };
  }
}

function resolvePlanResult(
  result: PlannerPlanResult | Promise<PlannerPlanResult>,
  providerId: string,
  promptVersion: string,
  start: number
): { workflow_json: string; telemetry: PlannerTelemetry } {
  const unwrap = result as PlannerPlanResult;
  const telemetry: PlannerTelemetry = {
    provider_id: unwrap.telemetry?.provider_id ?? providerId,
    model_name: unwrap.telemetry?.model_name,
    prompt_version: unwrap.telemetry?.prompt_version ?? promptVersion,
    tokens_in: unwrap.telemetry?.tokens_in,
    tokens_out: unwrap.telemetry?.tokens_out,
    latency_ms: Date.now() - start
  };
  return { workflow_json: unwrap.workflow_json, telemetry };
}

function parseWorkflowJson(value: string): WorkflowDefinition {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error("Planner output must be JSON-only");
  }
  return JSON.parse(trimmed) as WorkflowDefinition;
}

function emptyWorkflow(context: PlannerContext): WorkflowDefinition {
  return {
    workflow_id: newId(),
    project_id: context.project_id,
    chat_id: context.chat_id,
    scope: { targets: context.mission_manifest.scope_targets },
    steps: []
  };
}
