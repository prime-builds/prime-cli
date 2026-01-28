import { contextBridge, ipcRenderer } from "electron";
import type { IpcContracts, RunEvent } from "../../../../packages/shared/src/contracts";

type IpcMethod = keyof IpcContracts;

type IpcRequest<K extends IpcMethod> = {
  id: string;
  method: K;
  params: IpcContracts[K]["request"];
};

type IpcSuccess<K extends IpcMethod> = {
  id: string;
  method: K;
  ok: true;
  result: IpcContracts[K] extends { response: infer R } ? R : never;
};

type IpcFailure<K extends IpcMethod> = {
  id: string;
  method: K;
  ok: false;
  error: { code: string; message: string };
};

type IpcResponse<K extends IpcMethod> = IpcSuccess<K> | IpcFailure<K>;

type RunEventEnvelope = { run_id: string; event: RunEvent };

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const runListeners = new Map<string, Set<(event: RunEvent) => void>>();

ipcRenderer.on("prime:response", (_event, response: IpcResponse<IpcMethod>) => {
  const handler = pending.get(response.id);
  if (!handler) {
    return;
  }
  pending.delete(response.id);
  if (response.ok) {
    handler.resolve(response.result);
  } else {
    handler.reject(new Error(response.error.message));
  }
});

ipcRenderer.on("prime:event", (_event, envelope: RunEventEnvelope) => {
  const listeners = runListeners.get(envelope.run_id);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    listener(envelope.event);
  }
});

async function request<K extends IpcMethod>(
  method: K,
  params: IpcContracts[K]["request"]
): Promise<IpcContracts[K] extends { response: infer R } ? R : never> {
  const id = crypto.randomUUID();
  const payload: IpcRequest<K> = { id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ipcRenderer.send("prime:request", payload);
  }) as Promise<IpcContracts[K] extends { response: infer R } ? R : never>;
}

async function subscribeRunEvents(runId: string, listener: (event: RunEvent) => void): Promise<() => void> {
  if (!runListeners.has(runId)) {
    runListeners.set(runId, new Set());
    await request("run.events", { run_id: runId });
  }
  runListeners.get(runId)?.add(listener);
  return () => {
    const listeners = runListeners.get(runId);
    if (!listeners) {
      return;
    }
    listeners.delete(listener);
    if (listeners.size === 0) {
      runListeners.delete(runId);
    }
  };
}

async function selectFolder(): Promise<string | null> {
  return ipcRenderer.invoke("prime:dialog:openFolder");
}

async function selectFiles(filters?: Array<{ name: string; extensions: string[] }>): Promise<string[]> {
  return ipcRenderer.invoke("prime:dialog:openFiles", filters);
}

async function readFile(path: string): Promise<string> {
  return ipcRenderer.invoke("prime:file:read", path);
}

contextBridge.exposeInMainWorld("prime", {
  request,
  subscribeRunEvents,
  selectFolder,
  selectFiles,
  readFile
});

export type PrimeApi = {
  request: typeof request;
  subscribeRunEvents: typeof subscribeRunEvents;
  selectFolder: typeof selectFolder;
  selectFiles: typeof selectFiles;
  readFile: typeof readFile;
};
