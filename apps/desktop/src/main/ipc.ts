import { ipcMain, WebContents } from "electron";
import type { Logger } from "../../../../packages/engine/src/logger";
import type { IpcRequest, IpcResponse, IpcTransport, RunEventEnvelope } from "../../../../packages/engine/src/ipc/types";

export class ElectronIpcTransport implements IpcTransport {
  private requestHandler?: (request: IpcRequest) => void;
  private readonly responders = new Map<string, WebContents>();
  private readonly subscribers = new Set<WebContents>();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  attach(): void {
    ipcMain.on("prime:request", (event, request: IpcRequest) => {
      this.responders.set(request.id, event.sender);
      this.trackWebContents(event.sender);
      this.requestHandler?.(request);
    });
  }

  onRequest(handler: (request: IpcRequest) => void): void {
    this.requestHandler = handler;
  }

  sendResponse(response: IpcResponse): void {
    const sender = this.responders.get(response.id);
    if (!sender || sender.isDestroyed()) {
      this.responders.delete(response.id);
      return;
    }
    sender.send("prime:response", response);
    this.responders.delete(response.id);
  }

  sendEvent(event: RunEventEnvelope): void {
    for (const wc of this.subscribers) {
      if (wc.isDestroyed()) {
        this.subscribers.delete(wc);
        continue;
      }
      wc.send("prime:event", event);
    }
  }

  private trackWebContents(wc: WebContents): void {
    if (this.subscribers.has(wc)) {
      return;
    }
    this.subscribers.add(wc);
    wc.on("destroyed", () => {
      this.subscribers.delete(wc);
      for (const [key, value] of this.responders.entries()) {
        if (value === wc) {
          this.responders.delete(key);
        }
      }
      this.logger.debug("Renderer destroyed, cleaned IPC subscribers");
    });
  }
}
