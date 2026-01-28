import type { IpcContracts } from "../../../shared/src/contracts";
import { Engine } from "../engine";
import { EngineError } from "../errors";
import { Logger } from "../logger";
import type { IpcRequest, IpcResponse, IpcTransport } from "./types";

export class EngineIpcServer {
  private readonly engine: Engine;
  private readonly transport: IpcTransport;
  private readonly logger: Logger;
  private readonly subscriptions = new Map<string, () => void>();

  constructor(engine: Engine, transport: IpcTransport, logger: Logger) {
    this.engine = engine;
    this.transport = transport;
    this.logger = logger;
  }

  attach(): void {
    this.transport.onRequest((request) => {
      void this.handleRequest(request);
    });
  }

  private async handleRequest(request: IpcRequest): Promise<void> {
    try {
      const result = await this.route(request);
      const response: IpcResponse = {
        id: request.id,
        method: request.method,
        ok: true,
        result
      };
      this.transport.sendResponse(response);
    } catch (error) {
      const err = error instanceof EngineError ? error : new EngineError("INTERNAL_ERROR", "Unexpected error");
      const response: IpcResponse = {
        id: request.id,
        method: request.method,
        ok: false,
        error: { code: err.code, message: err.message }
      };
      this.transport.sendResponse(response);
      this.logger.error("IPC request failed", { method: request.method, error: err.message });
    }
  }

  private async route(request: IpcRequest): Promise<unknown> {
    switch (request.method) {
      case "project.create":
        return this.engine.createProject(request.params);
      case "project.list":
        return this.engine.listProjects(request.params);
      case "project.open":
        return this.engine.openProject(request.params);
      case "mission.get":
        return this.engine.getMission(request.params);
      case "mission.set":
        return this.engine.setMission(request.params);
      case "chat.create":
        return this.engine.createChat(request.params);
      case "chat.list":
        return this.engine.listChats(request.params);
      case "chat.messages":
        return this.engine.listChatMessages(request.params);
      case "chat.sendMessage":
        return this.engine.sendMessage(request.params);
      case "run.list":
        return this.engine.listRuns(request.params);
      case "run.steps":
        return this.engine.listRunSteps(request.params);
      case "run.start":
        return this.engine.startRun(request.params);
      case "run.cancel":
        return this.engine.cancelRun(request.params);
      case "run.fork":
        return this.engine.forkRun(request.params);
      case "run.replay":
        return this.engine.replayRun(request.params);
      case "run.events":
        return this.subscribeToRunEvents(request.params.run_id);
      case "artifact.list":
        return this.engine.listArtifacts(request.params);
      case "artifact.open":
        return this.engine.openArtifact(request.params);
      case "artifact.update":
        return this.engine.updateArtifact(request.params);
      case "docs.import":
        return this.engine.importDocs(request.params);
      case "docs.list":
        return this.engine.listDocs(request.params);
      case "docs.search":
        return this.engine.searchDocs(request.params);
      case "docs.open":
        return this.engine.openDoc(request.params);
      case "adapters.list":
        return this.engine.listAdapters(request.params);
      default:
        throw new EngineError("UNKNOWN_METHOD", `Unknown method: ${request.method}`);
    }
  }

  private async subscribeToRunEvents(runId: string): Promise<{}> {
    if (!this.subscriptions.has(runId)) {
      const unsubscribe = this.engine.subscribeToRunEvents(runId, (event) => {
        this.transport.sendEvent({ run_id: runId, event });
      });
      this.subscriptions.set(runId, unsubscribe);
    }
    return {};
  }
}
