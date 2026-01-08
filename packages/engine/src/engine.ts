import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type Database from "better-sqlite3";
import type {
  ArtifactListRequest,
  ArtifactListResponse,
  ArtifactOpenRequest,
  ArtifactOpenResponse,
  ArtifactUpdateRequest,
  ArtifactUpdateResponse,
  ChatCreateRequest,
  ChatCreateResponse,
  ChatListRequest,
  ChatListResponse,
  ChatMessageInput,
  ChatSendMessageRequest,
  ChatSendMessageResponse,
  MissionGetRequest,
  MissionGetResponse,
  MissionManifest,
  MissionSetRequest,
  MissionSetResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectListRequest,
  ProjectListResponse,
  ProjectOpenRequest,
  ProjectOpenResponse,
  RunCancelRequest,
  RunCancelResponse,
  RunEvent,
  RunForkRequest,
  RunForkResponse,
  RunReplayRequest,
  RunReplayResponse,
  RunStartRequest,
  RunStartResponse
} from "../../shared/src/contracts";
import { EmptyAdapterRegistry, type AdapterRegistry } from "./adapters/registry";
import { EngineError, NotFoundError, ValidationError } from "./errors";
import type { EngineConfig } from "./config";
import { Logger } from "./logger";
import { PromptLoader } from "./prompts/loader";
import { Planner } from "./planner";
import { Executor } from "./run/executor";
import { RunEventHub } from "./run/event-hub";
import { RunManager } from "./run/run-manager";
import { validateWorkflow } from "./run/validator";
import type { WorkflowDefinition } from "./run/workflow";
import { openDatabase } from "./storage/db";
import { createRepos, type StorageRepos } from "./storage";

export class Engine {
  private readonly config: EngineConfig;
  private readonly logger: Logger;
  private readonly registry: AdapterRegistry;
  private readonly events = new RunEventHub();
  private readonly promptsDir: string;
  private readonly plannerPromptVersion = "planner-v0.md";
  private readonly criticPromptVersion = "critic-v0.md";
  private db?: Database.Database;
  private repos?: StorageRepos;
  private runManager?: RunManager;
  private planner?: Planner;

  constructor(
    config: EngineConfig,
    options?: { logger?: Logger; adapterRegistry?: AdapterRegistry; promptsDir?: string }
  ) {
    this.config = config;
    this.logger = options?.logger ?? new Logger(config.logLevel ?? "info");
    this.registry = options?.adapterRegistry ?? new EmptyAdapterRegistry();
    this.promptsDir =
      options?.promptsDir ?? path.resolve(process.cwd(), "docs", "prompts");
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.config.artifactsDir, { recursive: true });
    this.db = openDatabase(this.config.dbPath, this.logger);
    this.repos = createRepos(this.db);

    const promptLoader = new PromptLoader(this.promptsDir, this.logger);
    this.planner = new Planner(promptLoader, this.registry, this.logger);
    const executor = new Executor(
      this.config.artifactsDir,
      this.repos.artifacts,
      this.registry,
      this.logger
    );
    this.runManager = new RunManager(this.repos, executor, this.events, this.logger);
  }

  async stop(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  subscribeToRunEvents(runId: string, listener: (event: RunEvent) => void): () => void {
    return this.events.subscribe(runId, listener);
  }

  async waitForRun(runId: string): Promise<void> {
    const { runManager } = this.ensureReady();
    await runManager.waitForRun(runId);
  }

  async createProject(request: ProjectCreateRequest): Promise<ProjectCreateResponse> {
    const { repos } = this.ensureReady();
    const project = repos.projects.create(request);
    return { project };
  }

  async listProjects(_request: ProjectListRequest): Promise<ProjectListResponse> {
    const { repos } = this.ensureReady();
    return { projects: repos.projects.list() };
  }

  async openProject(request: ProjectOpenRequest): Promise<ProjectOpenResponse> {
    const { repos } = this.ensureReady();
    const project =
      "project_id" in request
        ? repos.projects.getById(request.project_id)
        : repos.projects.getByRootPath(request.root_path);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    return { project };
  }

  async getMission(request: MissionGetRequest): Promise<MissionGetResponse> {
    const { repos } = this.ensureReady();
    const manifest = repos.missions.getByChatId(request.chat_id);
    return { manifest };
  }

  async setMission(request: MissionSetRequest): Promise<MissionSetResponse> {
    const { repos } = this.ensureReady();
    const chat = repos.chats.getById(request.chat_id);
    if (!chat) {
      throw new NotFoundError("Chat not found");
    }
    const manifest = repos.missions.setManifest(request.chat_id, request.manifest);
    return { manifest };
  }

  async createChat(request: ChatCreateRequest): Promise<ChatCreateResponse> {
    const { repos } = this.ensureReady();
    const project = repos.projects.getById(request.project_id);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    const chat = repos.chats.create(request);
    return { chat };
  }

  async listChats(request: ChatListRequest): Promise<ChatListResponse> {
    const { repos } = this.ensureReady();
    return { chats: repos.chats.listByProject(request.project_id) };
  }

  async sendMessage(request: ChatSendMessageRequest): Promise<ChatSendMessageResponse> {
    const { repos, planner, runManager } = this.ensureReady();
    const chat = repos.chats.getById(request.chat_id);
    if (!chat) {
      throw new NotFoundError("Chat not found");
    }

    const message = repos.messages.create(request.chat_id, request.message);

    if (request.message.role !== "user") {
      return { message };
    }

    const mission = this.ensureMissionManifest(chat.id, request.message);
    const workflow = planner.plan({
      project_id: chat.project_id,
      chat_id: chat.id,
      message: request.message,
      mission
    });
    validateWorkflow(workflow);
    const run = runManager.startRun({
      project_id: chat.project_id,
      chat_id: chat.id,
      workflow,
      workflowJson: JSON.stringify(workflow),
      planner_prompt_version: this.plannerPromptVersion,
      critic_prompt_version: this.criticPromptVersion
    });

    return { message, run };
  }

  async startRun(request: RunStartRequest): Promise<RunStartResponse> {
    const { repos, runManager } = this.ensureReady();
    const project = repos.projects.getById(request.project_id);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    if (request.chat_id) {
      const chat = repos.chats.getById(request.chat_id);
      if (!chat) {
        throw new NotFoundError("Chat not found");
      }
    }
    const workflow = this.resolveWorkflow(request);
    validateWorkflow(workflow);
    const run = runManager.startRun({
      project_id: request.project_id,
      chat_id: request.chat_id,
      workflow,
      workflowJson: JSON.stringify(workflow),
      planner_prompt_version: this.plannerPromptVersion,
      critic_prompt_version: this.criticPromptVersion
    });
    return { run };
  }

  async cancelRun(request: RunCancelRequest): Promise<RunCancelResponse> {
    const { runManager } = this.ensureReady();
    const run = runManager.cancelRun(request.run_id);
    if (!run) {
      throw new NotFoundError("Run not found");
    }
    return { run };
  }

  async forkRun(request: RunForkRequest): Promise<RunForkResponse> {
    const { repos, runManager } = this.ensureReady();
    const parentRun = repos.runs.getById(request.run_id);
    if (!parentRun) {
      throw new NotFoundError("Run not found");
    }
    const workflowJson = repos.runs.getWorkflowJson(request.run_id);
    if (!workflowJson) {
      throw new ValidationError("Run workflow is missing");
    }
    const workflow = JSON.parse(workflowJson) as WorkflowDefinition;
    validateWorkflow(workflow);
    const stepIndex = workflow.steps.findIndex((step) => step.id === request.step_id);
    if (stepIndex === -1) {
      throw new NotFoundError("Step not found");
    }
    const stepRow = repos.steps.getByRunAndStepId(request.run_id, request.step_id);
    if (!stepRow) {
      throw new NotFoundError("Step not found");
    }

    const remainingWorkflow: WorkflowDefinition = {
      ...workflow,
      steps: workflow.steps.slice(stepIndex + 1)
    };
    validateWorkflow(remainingWorkflow);

    const run = runManager.startRun({
      project_id: parentRun.project_id,
      chat_id: parentRun.chat_id,
      workflow: remainingWorkflow,
      workflowJson: workflowJson,
      parent_run_id: parentRun.id,
      forked_from_step_id: stepRow.id,
      planner_prompt_version: this.plannerPromptVersion,
      critic_prompt_version: this.criticPromptVersion,
      initialEvents: (createdRun) => [
        {
          type: "RUN_FORKED",
          run_id: createdRun.id,
          parent_run_id: parentRun.id,
          forked_from_step_id: stepRow.id,
          timestamp: this.now()
        }
      ]
    });

    this.copyForkArtifacts(parentRun.id, run.id, workflow.steps.slice(0, stepIndex + 1));

    return { new_run_id: run.id };
  }

  async replayRun(request: RunReplayRequest): Promise<RunReplayResponse> {
    const { repos, runManager } = this.ensureReady();
    const parentRun = repos.runs.getById(request.run_id);
    if (!parentRun) {
      throw new NotFoundError("Run not found");
    }
    const workflowJson = repos.runs.getWorkflowJson(request.run_id);
    if (!workflowJson) {
      throw new ValidationError("Run workflow is missing");
    }
    const workflow = JSON.parse(workflowJson) as WorkflowDefinition;
    validateWorkflow(workflow);
    const run = runManager.startRun({
      project_id: parentRun.project_id,
      chat_id: parentRun.chat_id,
      workflow,
      workflowJson: workflowJson,
      replay_of_run_id: parentRun.id,
      planner_prompt_version: this.plannerPromptVersion,
      critic_prompt_version: this.criticPromptVersion,
      initialEvents: (createdRun) => [
        {
          type: "RUN_REPLAYED",
          run_id: createdRun.id,
          replay_of_run_id: parentRun.id,
          timestamp: this.now()
        }
      ]
    });

    return { new_run_id: run.id };
  }

  async listArtifacts(request: ArtifactListRequest): Promise<ArtifactListResponse> {
    const { repos } = this.ensureReady();
    return {
      artifacts: repos.artifacts.list({
        project_id: request.project_id,
        run_id: request.run_id,
        chat_id: request.chat_id
      })
    };
  }

  async openArtifact(request: ArtifactOpenRequest): Promise<ArtifactOpenResponse> {
    const { repos } = this.ensureReady();
    const artifact = repos.artifacts.getById(request.artifact_id);
    if (!artifact) {
      throw new NotFoundError("Artifact not found");
    }
    return { artifact };
  }

  async updateArtifact(request: ArtifactUpdateRequest): Promise<ArtifactUpdateResponse> {
    const { repos } = this.ensureReady();
    const artifact = repos.artifacts.getById(request.artifact_id);
    if (!artifact) {
      throw new NotFoundError("Artifact not found");
    }
    if (!artifact.run_id) {
      throw new ValidationError("Artifact is not associated with a run");
    }

    const backupPath = `${artifact.path}.bak.${this.fileTimestamp()}`;
    fs.copyFileSync(artifact.path, backupPath);
    fs.writeFileSync(
      artifact.path,
      JSON.stringify(request.new_content_json, null, 2),
      "utf8"
    );

    const buffer = fs.readFileSync(artifact.path);
    const hash = this.hashContent(buffer);
    const updated = repos.artifacts.updateContent({
      id: artifact.id,
      hash,
      size_bytes: buffer.byteLength
    });
    if (!updated) {
      throw new NotFoundError("Artifact not found");
    }

    this.emitEvent({
      type: "ARTIFACT_EDITED",
      run_id: artifact.run_id,
      artifact_id: artifact.id,
      editor: "human",
      reason: request.reason,
      timestamp: this.now()
    });

    return { artifact: updated };
  }

  private resolveWorkflow(request: RunStartRequest): WorkflowDefinition {
    const workflow = request.inputs?.workflow;
    if (workflow && typeof workflow === "object") {
      return workflow as WorkflowDefinition;
    }
    if (!request.workflow_id) {
      throw new ValidationError("workflow_id is required");
    }
    return {
      workflow_id: request.workflow_id,
      project_id: request.project_id,
      chat_id: request.chat_id,
      steps: []
    };
  }

  private ensureMissionManifest(chatId: string, message: ChatMessageInput): MissionManifest {
    const { repos } = this.ensureReady();
    const existing = repos.missions.getByChatId(chatId);
    if (existing) {
      return existing;
    }
    const metadata = message.metadata ?? {};
    const scopeTargets = Array.isArray(metadata.scope_targets)
      ? (metadata.scope_targets as string[])
      : [];
    const constraints = Array.isArray(metadata.constraints)
      ? (metadata.constraints as string[])
      : undefined;
    const success = Array.isArray(metadata.success_criteria)
      ? (metadata.success_criteria as string[])
      : undefined;
    const notes = typeof metadata.notes === "string" ? metadata.notes : undefined;

    return repos.missions.setManifest(chatId, {
      objective: message.content,
      scope_targets: scopeTargets,
      constraints,
      success_criteria: success,
      notes
    });
  }

  private copyForkArtifacts(
    parentRunId: string,
    newRunId: string,
    stepsToInclude: WorkflowDefinition["steps"]
  ): void {
    const { repos } = this.ensureReady();
    const allowedStepIds = new Set(stepsToInclude.map((step) => step.id));
    const parentArtifacts = repos.artifacts.list({ run_id: parentRunId });
    for (const artifact of parentArtifacts) {
      if (artifact.step_id && !allowedStepIds.has(artifact.step_id)) {
        continue;
      }
      repos.artifacts.create({
        project_id: artifact.project_id,
        run_id: newRunId,
        step_id: artifact.step_id,
        chat_id: artifact.chat_id,
        name: artifact.name,
        hash: artifact.hash,
        path: artifact.path,
        media_type: artifact.media_type,
        size_bytes: artifact.size_bytes
      });
    }
  }

  private emitEvent(event: RunEvent): void {
    const { repos } = this.ensureReady();
    repos.runEvents.append(event);
    this.events.emit(event);
  }

  private hashContent(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  private now(): string {
    return new Date().toISOString();
  }

  private fileTimestamp(): string {
    return this.now().replace(/[:.]/g, "-");
  }

  private ensureReady(): { repos: StorageRepos; runManager: RunManager; planner: Planner } {
    if (!this.repos || !this.runManager || !this.planner) {
      throw new EngineError("ENGINE_NOT_READY", "Engine has not been started");
    }
    return { repos: this.repos, runManager: this.runManager, planner: this.planner };
  }
}
