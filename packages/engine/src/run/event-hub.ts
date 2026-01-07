import type { ID, RunEvent } from "../../../shared/src/contracts";

export type RunEventListener = (event: RunEvent) => void;

export class RunEventHub {
  private readonly listeners = new Map<ID, Set<RunEventListener>>();

  subscribe(runId: ID, listener: RunEventListener): () => void {
    const set = this.listeners.get(runId) ?? new Set<RunEventListener>();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => {
      const current = this.listeners.get(runId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  emit(event: RunEvent): void {
    const set = this.listeners.get(event.run_id);
    if (!set) {
      return;
    }
    for (const listener of set) {
      listener(event);
    }
  }
}
