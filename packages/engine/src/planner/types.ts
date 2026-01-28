export type PlannerTelemetry = {
  provider_id: string;
  model_name?: string;
  prompt_version?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
};

export type PlannerPlanResult = {
  workflow_json: string;
  telemetry: PlannerTelemetry;
};

export type PlannerCriticResult = {
  ok: boolean;
  issues: string[];
};

export type PlannerSnippet = {
  doc_id: string;
  chunk_id: string;
  snippet: string;
  file_name: string;
  tool_name?: string;
  category?: string;
};

export type PlannerContext = {
  project_id: string;
  chat_id?: string;
  message: { role: "user" | "assistant" | "system"; content: string };
  mission_manifest: {
    objective: string;
    scope_targets: string[];
    constraints?: string[];
    success_criteria?: string[];
    notes?: string;
  };
  adapter_capabilities: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    risk_default: "passive" | "active" | "destructive";
    inputs: string[];
    outputs: string[];
    params_summary: Array<{
      name: string;
      type: string;
      required: boolean;
      enum?: unknown[];
      description?: string;
    }>;
  }>;
  artifacts: Array<{
    id: string;
    name: string;
    path: string;
    media_type?: string;
    run_id?: string;
    step_id?: string;
    chat_id?: string;
  }>;
  retrieved_snippets: PlannerSnippet[];
};

export interface PlannerProvider {
  id: string;
  name: string;
  configure?: (settings: Record<string, unknown>) => void;
  plan: (context: PlannerContext) => Promise<PlannerPlanResult> | PlannerPlanResult;
  critic?: (
    context: PlannerContext,
    workflow_json: string
  ) => Promise<PlannerCriticResult> | PlannerCriticResult;
}
