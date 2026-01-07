import type { IpcContracts, ID, RunEvent } from "../../../shared/src/contracts";

export type IpcMethod = keyof IpcContracts;

export type IpcRequest<K extends IpcMethod = IpcMethod> = {
  id: string;
  method: K;
  params: IpcContracts[K]["request"];
};

export type IpcResponseData<K extends IpcMethod> = IpcContracts[K] extends {
  response: infer R;
}
  ? R
  : {};

export type IpcError = {
  code: string;
  message: string;
};

export type IpcSuccess<K extends IpcMethod = IpcMethod> = {
  id: string;
  method: K;
  ok: true;
  result: IpcResponseData<K>;
};

export type IpcFailure<K extends IpcMethod = IpcMethod> = {
  id: string;
  method: K;
  ok: false;
  error: IpcError;
};

export type IpcResponse<K extends IpcMethod = IpcMethod> = IpcSuccess<K> | IpcFailure<K>;

export type RunEventEnvelope = {
  run_id: ID;
  event: RunEvent;
};

export interface IpcTransport {
  onRequest(handler: (request: IpcRequest) => void): void;
  sendResponse(response: IpcResponse): void;
  sendEvent(event: RunEventEnvelope): void;
}
