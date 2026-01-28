import type { IpcContracts, RunEvent } from "../../../../packages/shared/src/contracts";

type IpcMethod = keyof IpcContracts;

type PrimeRequest = <K extends IpcMethod>(
  method: K,
  params: IpcContracts[K]["request"]
) => Promise<IpcContracts[K] extends { response: infer R } ? R : never>;

type PrimeSubscribe = (runId: string, listener: (event: RunEvent) => void) => Promise<() => void>;

type PrimeApi = {
  request: PrimeRequest;
  subscribeRunEvents: PrimeSubscribe;
  selectFolder: () => Promise<string | null>;
  selectFiles: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
};

declare global {
  interface Window {
    prime: PrimeApi;
  }
}

export {};
