import type {
  ChatMessageInput,
  DocsSearchResult,
  MissionManifest
} from "../../shared/src/contracts";
import type { AdapterRegistry } from "./adapters/registry";
import { buildAdapterSummaries, type AdapterSummary } from "./adapters/summary";
import { DocsService } from "./docs";
import { Logger } from "./logger";
import { PromptLoader } from "./prompts/loader";
import type { WorkflowDefinition } from "./run/workflow";
import { newId } from "./utils/ids";

export type PlannerSnippet = Pick<
  DocsSearchResult,
  "doc_id" | "chunk_id" | "snippet" | "file_name" | "tool_name" | "category"
>;

export type PlannerContext = {
  adapter_capabilities: AdapterSummary[];
  mission_manifest: MissionManifest;
  retrieved_snippets: PlannerSnippet[];
};

export class Planner {
  private readonly prompts: PromptLoader;
  private readonly registry: AdapterRegistry;
  private readonly docs: DocsService;
  private readonly logger: Logger;

  constructor(
    prompts: PromptLoader,
    registry: AdapterRegistry,
    docs: DocsService,
    logger: Logger
  ) {
    this.prompts = prompts;
    this.registry = registry;
    this.docs = docs;
    this.logger = logger;
  }

  plan(input: {
    project_id: string;
    chat_id?: string;
    message: ChatMessageInput;
    mission: MissionManifest;
    project_root?: string;
  }): WorkflowDefinition {
    const plannerPrompt = this.prompts.loadPlannerPrompt();
    const criticPrompt = this.prompts.loadCriticPrompt();
    this.logger.debug("Planner prompts loaded", {
      planner_bytes: plannerPrompt.length,
      critic_bytes: criticPrompt.length
    });

    const context = this.buildContext(input);
    this.logger.debug("Planner context built", {
      adapter_count: context.adapter_capabilities.length,
      snippet_count: context.retrieved_snippets.length
    });

    if (context.adapter_capabilities.length === 0) {
      return {
        workflow_id: newId(),
        project_id: input.project_id,
        chat_id: input.chat_id,
        scope: { targets: input.mission.scope_targets },
        steps: []
      };
    }

    const targetUrl = input.mission.scope_targets[0];
    const webAdapter = context.adapter_capabilities.find(
      (summary) => summary.id === "web.surface.discover.http"
    );
    const candidatesAdapter = context.adapter_capabilities.find(
      (summary) => summary.id === "findings.candidates.from_web_surface"
    );
    const triageAdapter = context.adapter_capabilities.find(
      (summary) => summary.id === "findings.triage.rulebased"
    );
    const reportAdapter = context.adapter_capabilities.find(
      (summary) => summary.id === "report.generate.markdown"
    );

    const wantsAssessmentFlow = wantsAssessment(input.message.content);
    const hasFindingsPipeline = Boolean(
      candidatesAdapter && triageAdapter && reportAdapter
    );

    if (wantsAssessmentFlow && hasFindingsPipeline && targetUrl) {
      const steps = [];
      if (webAdapter) {
        steps.push({
          id: "step-1",
          adapter: webAdapter.id,
          category: webAdapter.category,
          risk: webAdapter.risk_default,
          inputs: {
            mission: {
              objective: context.mission_manifest.objective,
              scope_targets: context.mission_manifest.scope_targets
            }
          },
          outputs: {
            "web_surface.json": {}
          },
          limits: {},
          params: {
            target_url: targetUrl
          }
        });
      }

      steps.push({
        id: webAdapter ? "step-2" : "step-1",
        adapter: candidatesAdapter.id,
        category: candidatesAdapter.category,
        risk: candidatesAdapter.risk_default,
        inputs: {
          mission: {
            objective: context.mission_manifest.objective,
            scope_targets: context.mission_manifest.scope_targets
          }
        },
        outputs: {
          "findings_candidates.json": {}
        },
        limits: {},
        params: {
          target: targetUrl,
          ruleset: "baseline",
          max_candidates: 50,
          include_kb_refs: true
        }
      });

      steps.push({
        id: webAdapter ? "step-3" : "step-2",
        adapter: triageAdapter.id,
        category: triageAdapter.category,
        risk: triageAdapter.risk_default,
        inputs: {},
        outputs: {
          "findings_triaged.json": {}
        },
        limits: {},
        params: {
          triage_mode: "balanced",
          max_kept: 30
        }
      });

      steps.push({
        id: webAdapter ? "step-4" : "step-3",
        adapter: reportAdapter.id,
        category: reportAdapter.category,
        risk: reportAdapter.risk_default,
        inputs: {},
        outputs: {
          "report.json": {}
        },
        limits: {},
        params: {
          template: "default",
          include_evidence_links: true,
          include_kb_citations: true
        }
      });

      return {
        workflow_id: newId(),
        project_id: input.project_id,
        chat_id: input.chat_id,
        scope: { targets: input.mission.scope_targets },
        steps
      };
    }

    const shouldDiscoverWeb = wantsWebDiscovery(input.message.content);
    if (shouldDiscoverWeb && webAdapter && targetUrl) {
      return {
        workflow_id: newId(),
        project_id: input.project_id,
        chat_id: input.chat_id,
        scope: { targets: input.mission.scope_targets },
        steps: [
          {
            id: "step-1",
            adapter: webAdapter.id,
            category: webAdapter.category,
            risk: webAdapter.risk_default,
            inputs: {
              mission: {
                objective: context.mission_manifest.objective,
                scope_targets: context.mission_manifest.scope_targets
              }
            },
            outputs: {
              "web_surface.json": {}
            },
            limits: {},
            params: {
              target_url: targetUrl
            }
          }
        ]
      };
    }

    return {
      workflow_id: newId(),
      project_id: input.project_id,
      chat_id: input.chat_id,
      scope: { targets: input.mission.scope_targets },
      steps: []
    };
  }

  buildContext(input: {
    project_id: string;
    chat_id?: string;
    message: ChatMessageInput;
    mission: MissionManifest;
    project_root?: string;
  }): PlannerContext {
    const adapter_capabilities = buildAdapterSummaries(
      this.registry.listAdapters(input.project_root)
    );
    const retrieved_snippets = this.retrieveSnippets({
      project_id: input.project_id,
      message: input.message,
      mission: input.mission,
      adapters: adapter_capabilities
    });

    return {
      adapter_capabilities,
      mission_manifest: input.mission,
      retrieved_snippets
    };
  }

  private retrieveSnippets(input: {
    project_id: string;
    message: ChatMessageInput;
    mission: MissionManifest;
    adapters: AdapterSummary[];
  }): PlannerSnippet[] {
    const searchTerms = buildSearchTerms(input.message, input.mission, input.adapters);
    if (searchTerms.length === 0) {
      return [];
    }

    const toolNames = this.collectToolNames(input.project_id);
    const query = buildSearchQuery([...searchTerms, ...toolNames]);
    if (!query) {
      return [];
    }

    try {
      const results = this.docs.searchDocs({
        project_id: input.project_id,
        query,
        top_k: 6
      }).results;
      return results.map((result) => ({
        doc_id: result.doc_id,
        chunk_id: result.chunk_id,
        snippet: result.snippet,
        file_name: result.file_name,
        tool_name: result.tool_name,
        category: result.category
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn("Planner snippet retrieval failed", { error: message });
      return [];
    }
  }

  private collectToolNames(projectId: string): string[] {
    try {
      const docs = this.docs.listDocs({ project_id: projectId }).docs;
      const names = new Set<string>();
      for (const doc of docs) {
        if (doc.tool_name) {
          names.add(doc.tool_name);
        }
        if (doc.category) {
          names.add(doc.category);
        }
      }
      return [...names];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn("Planner tool name collection failed", { error: message });
      return [];
    }
  }
}

function wantsWebDiscovery(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("web discovery") ||
    text.includes("web surface") ||
    text.includes("surface") ||
    text.includes("urls") ||
    text.includes("url discovery") ||
    text.includes("discover urls") ||
    text.includes("crawl")
  );
}

function wantsAssessment(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("assessment") ||
    text.includes("analyze") ||
    text.includes("analysis") ||
    text.includes("find issues") ||
    text.includes("report") ||
    text.includes("audit")
  );
}

function buildSearchTerms(
  message: ChatMessageInput,
  mission: MissionManifest,
  adapters: AdapterSummary[]
): string[] {
  const terms = new Set<string>();
  addTokens(terms, message.content, 24);
  addTokens(terms, mission.objective, 24);
  for (const adapter of adapters) {
    if (adapter.name) {
      addTokens(terms, adapter.name, 6);
    }
    if (adapter.category) {
      addTokens(terms, adapter.category, 4);
    }
  }
  return [...terms];
}

function buildSearchQuery(terms: string[]): string {
  const sanitized = terms
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  if (sanitized.length === 0) {
    return "";
  }
  return sanitized.map((term) => `"${escapePhrase(term)}"`).join(" OR ");
}

function escapePhrase(value: string): string {
  return value.replace(/"/g, "\"\"");
}

function addTokens(target: Set<string>, value: string, maxTokens: number): void {
  if (!value) {
    return;
  }
  const matches = value.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g);
  if (!matches) {
    return;
  }
  let added = 0;
  for (const token of matches) {
    if (added >= maxTokens) {
      break;
    }
    if (!target.has(token)) {
      target.add(token);
      added += 1;
    }
  }
}
