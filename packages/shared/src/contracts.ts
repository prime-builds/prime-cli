export type ID = string;
export type ISODateTime = string;

export type ChatMessageRole = "user" | "assistant" | "system";
export type RunStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";
export type RunStepStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";

export interface Project {
  id: ID;
  name: string;
  root_path: string;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface Chat {
  id: ID;
  project_id: ID;
  title: string;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface ChatMessage {
  id: ID;
  chat_id: ID;
  role: ChatMessageRole;
  content: string;
  created_at: ISODateTime;
  metadata?: Record<string, unknown>;
}

export interface Run {
  id: ID;
  project_id: ID;
  chat_id?: ID;
  workflow_id: string;
  status: RunStatus;
  created_at: ISODateTime;
  started_at?: ISODateTime;
  finished_at?: ISODateTime;
  error?: string;
  parent_run_id?: ID;
  forked_from_step_id?: string;
  replay_of_run_id?: ID;
  planner_prompt_version?: string;
  critic_prompt_version?: string;
  planner_latency_ms?: number;
  tokens_estimate?: number;
}

export interface RunStep {
  id: ID;
  run_id: ID;
  step_id: string;
  status: RunStepStatus;
  adapter: string;
  category: string;
  risk: string;
  created_at: ISODateTime;
  started_at?: ISODateTime;
  finished_at?: ISODateTime;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export interface Artifact {
  id: ID;
  project_id: ID;
  run_id?: ID;
  step_id?: string;
  chat_id?: ID;
  name: string;
  hash?: string;
  path: string;
  media_type?: string;
  size_bytes?: number;
  created_at: ISODateTime;
}

export interface MissionManifest {
  mission_id: string;
  chat_id: string;
  objective: string;
  scope_targets: string[];
  constraints?: string[];
  success_criteria?: string[];
  notes?: string;
  created_at: string;
}

export type RunEventType =
  | "RUN_STARTED"
  | "RUN_FORKED"
  | "RUN_REPLAYED"
  | "STEP_STARTED"
  | "STEP_LOG"
  | "ARTIFACT_WRITTEN"
  | "ARTIFACT_EDITED"
  | "STEP_FINISHED"
  | "RUN_FINISHED"
  | "RUN_FAILED";

export interface RunEventBase {
  type: RunEventType;
  run_id: ID;
  timestamp: ISODateTime;
}

export interface RunStartedEvent extends RunEventBase {
  type: "RUN_STARTED";
  workflow_id: string;
}

export interface RunForkedEvent extends RunEventBase {
  type: "RUN_FORKED";
  parent_run_id: ID;
  forked_from_step_id: string;
}

export interface RunReplayedEvent extends RunEventBase {
  type: "RUN_REPLAYED";
  replay_of_run_id: ID;
}

export interface StepStartedEvent extends RunEventBase {
  type: "STEP_STARTED";
  step_id: string;
}

export interface StepLogEvent extends RunEventBase {
  type: "STEP_LOG";
  step_id: string;
  message: string;
  level?: "debug" | "info" | "warn" | "error";
}

export interface ArtifactWrittenEvent extends RunEventBase {
  type: "ARTIFACT_WRITTEN";
  artifact_id: ID;
  step_id?: string;
}

export interface ArtifactEditedEvent extends RunEventBase {
  type: "ARTIFACT_EDITED";
  artifact_id: ID;
  editor: "human";
  reason?: string;
}

export interface StepFinishedEvent extends RunEventBase {
  type: "STEP_FINISHED";
  step_id: string;
  status: RunStepStatus;
}

export interface RunFinishedEvent extends RunEventBase {
  type: "RUN_FINISHED";
  status: "succeeded" | "canceled";
}

export interface RunFailedEvent extends RunEventBase {
  type: "RUN_FAILED";
  error: string;
}

export type RunEvent =
  | RunStartedEvent
  | RunForkedEvent
  | RunReplayedEvent
  | StepStartedEvent
  | StepLogEvent
  | ArtifactWrittenEvent
  | ArtifactEditedEvent
  | StepFinishedEvent
  | RunFinishedEvent
  | RunFailedEvent;

export interface ProjectCreateRequest {
  name: string;
  root_path: string;
  description?: string;
}

export interface ProjectCreateResponse {
  project: Project;
}

export interface ProjectListRequest {
  include_archived?: boolean;
}

export interface ProjectListResponse {
  projects: Project[];
}

export type ProjectOpenRequest = { project_id: ID } | { root_path: string };

export interface ProjectOpenResponse {
  project: Project;
}

export interface ChatCreateRequest {
  project_id: ID;
  title?: string;
}

export interface ChatCreateResponse {
  chat: Chat;
}

export interface ChatListRequest {
  project_id: ID;
}

export interface ChatListResponse {
  chats: Chat[];
}

export interface ChatMessageInput {
  role: ChatMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSendMessageRequest {
  chat_id: ID;
  message: ChatMessageInput;
}

export interface ChatSendMessageResponse {
  message: ChatMessage;
  run?: Run;
}

export interface RunStartRequest {
  project_id: ID;
  chat_id?: ID;
  workflow_id: string;
  inputs?: Record<string, unknown>;
}

export interface RunStartResponse {
  run: Run;
}

export interface RunCancelRequest {
  run_id: ID;
}

export interface RunCancelResponse {
  run: Run;
}

export interface RunEventsRequest {
  run_id: ID;
}

export interface RunForkRequest {
  run_id: ID;
  step_id: string;
  new_run_name?: string;
}

export interface RunForkResponse {
  new_run_id: ID;
}

export interface RunReplayRequest {
  run_id: ID;
  new_run_name?: string;
}

export interface RunReplayResponse {
  new_run_id: ID;
}

export interface ArtifactListRequest {
  project_id?: ID;
  run_id?: ID;
  chat_id?: ID;
}

export interface ArtifactListResponse {
  artifacts: Artifact[];
}

export interface ArtifactOpenRequest {
  artifact_id: ID;
}

export interface ArtifactOpenResponse {
  artifact: Artifact;
}

export interface ArtifactUpdateRequest {
  artifact_id: ID;
  new_content_json: Record<string, unknown>;
  reason?: string;
}

export interface ArtifactUpdateResponse {
  artifact: Artifact;
}

export interface MissionGetRequest {
  chat_id: ID;
}

export interface MissionGetResponse {
  manifest: MissionManifest | null;
}

export interface MissionSetRequest {
  chat_id: ID;
  manifest: Omit<MissionManifest, "mission_id" | "chat_id" | "created_at">;
}

export interface MissionSetResponse {
  manifest: MissionManifest;
}

export interface IpcContracts {
  "project.create": { request: ProjectCreateRequest; response: ProjectCreateResponse };
  "project.list": { request: ProjectListRequest; response: ProjectListResponse };
  "project.open": { request: ProjectOpenRequest; response: ProjectOpenResponse };
  "mission.get": { request: MissionGetRequest; response: MissionGetResponse };
  "mission.set": { request: MissionSetRequest; response: MissionSetResponse };
  "chat.create": { request: ChatCreateRequest; response: ChatCreateResponse };
  "chat.list": { request: ChatListRequest; response: ChatListResponse };
  "chat.sendMessage": { request: ChatSendMessageRequest; response: ChatSendMessageResponse };
  "run.start": { request: RunStartRequest; response: RunStartResponse };
  "run.cancel": { request: RunCancelRequest; response: RunCancelResponse };
  "run.fork": { request: RunForkRequest; response: RunForkResponse };
  "run.replay": { request: RunReplayRequest; response: RunReplayResponse };
  "run.events": { request: RunEventsRequest; event: RunEvent };
  "artifact.list": { request: ArtifactListRequest; response: ArtifactListResponse };
  "artifact.open": { request: ArtifactOpenRequest; response: ArtifactOpenResponse };
  "artifact.update": { request: ArtifactUpdateRequest; response: ArtifactUpdateResponse };
}
