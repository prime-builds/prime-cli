export type JSONSchema = Record<string, unknown>;

export type AdapterRisk = "passive" | "active" | "destructive";

export type AdapterLogLevel = "debug" | "info" | "warn" | "error";

export interface AdapterManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  risk_default: AdapterRisk;
  version: string;
  inputs: string[];
  outputs: string[];
  params_schema: JSONSchema;
  artifact_schemas?: Record<string, JSONSchema>;
  tags?: string[];
  supported_platforms?: Array<"win32" | "darwin" | "linux">;
}

export interface AdapterLogEntry {
  level: AdapterLogLevel;
  message: string;
  data?: unknown;
}

export interface AdapterArtifact {
  type: string;
  path?: string;
  content_json?: unknown;
  meta?: Record<string, unknown>;
}

export interface ExecutionMetrics {
  duration_ms?: number;
  counts?: Record<string, number>;
}

export interface ExecutionResult {
  logs: AdapterLogEntry[];
  artifacts: AdapterArtifact[];
  warnings?: string[];
  metrics?: ExecutionMetrics;
}

export interface AdapterExecutionContext {
  project_root: string;
  artifacts_dir: string;
  evidence_dir?: string;
  run_id?: string;
  step_id?: string;
  project_id?: string;
  mission?: {
    objective: string;
    scope_targets: string[];
  };
  docs_search?: (input: {
    query: string;
    top_k?: number;
    filter?: {
      tool_name?: string;
      category?: string;
    };
  }) => {
    results: Array<{
      doc_id: string;
      chunk_id: string;
      snippet: string;
      file_name: string;
      tool_name?: string;
      category?: string;
      score?: number;
    }>;
  };
  signal?: AbortSignal;
}

export interface AdapterRuntime {
  validateParams: (params: Record<string, unknown>) => { ok: boolean; errors: string[] };
  validateInputs: (artifacts: AdapterArtifact[]) => { ok: boolean; errors: string[] };
}

export interface AdapterExecution {
  execute: (
    params: Record<string, unknown>,
    inputs: AdapterArtifact[],
    ctx: AdapterExecutionContext
  ) => Promise<ExecutionResult> | ExecutionResult;
}
