import type { PlannerProvider, PlannerContext, PlannerPlanResult, PlannerCriticResult } from "../types";
import type { WorkflowDefinition } from "../../run/workflow";

export class LocalPlannerProvider implements PlannerProvider {
  id = "local.heuristic";
  name = "Local Heuristic Planner";
  private promptVersion = "planner-v1";

  configure(settings: Record<string, unknown>): void {
    if (typeof settings.prompt_version === "string") {
      this.promptVersion = settings.prompt_version;
    }
  }

  plan(context: PlannerContext): PlannerPlanResult {
    const workflow = buildWorkflow(context);
    return {
      workflow_json: JSON.stringify(workflow, null, 2),
      telemetry: {
        provider_id: this.id,
        model_name: "heuristic",
        prompt_version: this.promptVersion
      }
    };
  }

  critic(_context: PlannerContext, workflow_json: string): PlannerCriticResult {
    try {
      const parsed = JSON.parse(workflow_json) as WorkflowDefinition;
      if (!Array.isArray(parsed.steps)) {
        return { ok: false, issues: ["workflow.steps must be an array"] };
      }
      return { ok: true, issues: [] };
    } catch {
      return { ok: false, issues: ["workflow_json is not valid JSON"] };
    }
  }
}

function buildWorkflow(context: PlannerContext): WorkflowDefinition {
  const targetUrl = context.mission_manifest.scope_targets[0];
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

  const wantsAssessmentFlow = wantsAssessment(context.message.content);
  const hasFindingsPipeline = Boolean(
    candidatesAdapter && triageAdapter && reportAdapter
  );

  if (wantsAssessmentFlow && hasFindingsPipeline && targetUrl) {
    const steps = [] as WorkflowDefinition["steps"];
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
      workflow_id: newWorkflowId(),
      project_id: context.project_id,
      chat_id: context.chat_id,
      scope: { targets: context.mission_manifest.scope_targets },
      steps
    };
  }

  if (wantsWebDiscovery(context.message.content) && webAdapter && targetUrl) {
    return {
      workflow_id: newWorkflowId(),
      project_id: context.project_id,
      chat_id: context.chat_id,
      scope: { targets: context.mission_manifest.scope_targets },
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
    workflow_id: newWorkflowId(),
    project_id: context.project_id,
    chat_id: context.chat_id,
    scope: { targets: context.mission_manifest.scope_targets },
    steps: []
  };
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

function newWorkflowId(): string {
  return `wf-${Date.now()}`;
}
