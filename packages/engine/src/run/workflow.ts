export interface WorkflowScope {
  targets: string[];
}

export interface WorkflowStep {
  id: string;
  adapter: string;
  category: string;
  risk: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  limits: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface WorkflowDefinition {
  workflow_id: string;
  project_id?: string;
  chat_id?: string;
  scope?: WorkflowScope;
  steps: WorkflowStep[];
}
