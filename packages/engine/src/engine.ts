import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import type {
  ArtifactListRequest,
  ArtifactListResponse,
  ArtifactOpenRequest,
  ArtifactOpenResponse,
  ChatCreateRequest,
  ChatCreateResponse,
  ChatListRequest,
  ChatListResponse,
  ChatSendMessageRequest,
  ChatSendMessageResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectListRequest,
  ProjectListResponse,
  ProjectOpenRequest,
  ProjectOpenResponse,
  RunCancelRequest,
  RunCancelResponse,
  RunStartRequest,
  RunStartResponse,
  RunEvent
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

    const workflow = planner.plan({
      project_id: chat.project_id,
      chat_id: chat.id,
      message: request.message
    });
    validateWorkflow(workflow);
    const run = runManager.startRun({
      project_id: chat.project_id,
      chat_id: chat.id,
      workflow
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
      workflow
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

  private ensureReady(): { repos: StorageRepos; runManager: RunManager; planner: Planner } {
    if (!this.repos || !this.runManager || !this.planner) {
      throw new EngineError("ENGINE_NOT_READY", "Engine has not been started");
    }
    return { repos: this.repos, runManager: this.runManager, planner: this.planner };
  }
}
