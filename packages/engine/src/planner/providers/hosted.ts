import type { PlannerProvider, PlannerContext, PlannerPlanResult, PlannerCriticResult } from "../types";

export class HostedPlannerProvider implements PlannerProvider {
  id = "hosted.http";
  name = "Hosted Planner Provider";
  private endpoint?: string;
  private apiKey?: string;
  private modelName?: string;
  private promptVersion?: string;

  configure(settings: Record<string, unknown>): void {
    if (typeof settings.endpoint === "string") {
      this.endpoint = settings.endpoint;
    }
    if (typeof settings.api_key === "string") {
      this.apiKey = settings.api_key;
    }
    if (typeof settings.model_name === "string") {
      this.modelName = settings.model_name;
    }
    if (typeof settings.prompt_version === "string") {
      this.promptVersion = settings.prompt_version;
    }
  }

  async plan(context: PlannerContext): Promise<PlannerPlanResult> {
    if (!this.endpoint) {
      throw new Error("Hosted planner endpoint not configured");
    }
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        context,
        model_name: this.modelName,
        prompt_version: this.promptVersion
      })
    });
    if (!response.ok) {
      throw new Error(`Hosted planner error ${response.status}`);
    }
    const payload = (await response.json()) as PlannerPlanResult;
    if (!payload || typeof payload.workflow_json !== "string") {
      throw new Error("Hosted planner returned invalid payload");
    }
    ensureJsonOnly(payload.workflow_json);
    return payload;
  }

  async critic(context: PlannerContext, workflow_json: string): Promise<PlannerCriticResult> {
    if (!this.endpoint) {
      return { ok: true, issues: [] };
    }
    const response = await fetch(`${this.endpoint}/critic`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({ context, workflow_json })
    });
    if (!response.ok) {
      return { ok: true, issues: [] };
    }
    const payload = (await response.json()) as PlannerCriticResult;
    if (!payload || typeof payload.ok !== "boolean") {
      return { ok: true, issues: [] };
    }
    return payload;
  }
}

function ensureJsonOnly(value: string): void {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    throw new Error("Planner output must be JSON-only");
  }
  JSON.parse(trimmed);
}
