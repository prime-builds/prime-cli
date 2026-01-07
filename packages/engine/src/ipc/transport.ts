import type { IpcContracts } from "../../../shared/src/contracts";
import { newId } from "../utils/ids";
import type {
  IpcMethod,
  IpcRequest,
  IpcResponse,
  IpcTransport,
  RunEventEnvelope
} from "./types";

type ResponseListener = (response: IpcResponse) => void;
type EventListener = (event: RunEventEnvelope) => void;

export class InMemoryIpcTransport implements IpcTransport {
  private requestHandler?: (request: IpcRequest) => void;
  private readonly responseListeners = new Set<ResponseListener>();
  private readonly eventListeners = new Set<EventListener>();

  onRequest(handler: (request: IpcRequest) => void): void {
    this.requestHandler = handler;
  }

  onResponse(listener: ResponseListener): () => void {
    this.responseListeners.add(listener);
    return () => this.responseListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  sendResponse(response: IpcResponse): void {
    for (const listener of this.responseListeners) {
      listener(response);
    }
  }

  sendEvent(event: RunEventEnvelope): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  async invoke<K extends IpcMethod>(
    method: K,
    params: IpcContracts[K]["request"]
  ): Promise<IpcResponse<K>> {
    const id = newId();
    return new Promise<IpcResponse<K>>((resolve) => {
      const unsubscribe = this.onResponse((response) => {
        if (response.id !== id) {
          return;
        }
        unsubscribe();
        resolve(response as IpcResponse<K>);
      });
      this.requestHandler?.({ id, method, params });
    });
  }
}
