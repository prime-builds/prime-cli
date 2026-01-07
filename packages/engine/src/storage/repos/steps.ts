import type Database from "better-sqlite3";
import type { RunStep, RunStepStatus } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { serializeJson, parseJson } from "../../utils/json";
import { nowIso } from "../../utils/time";

type StepRow = {
  id: string;
  run_id: string;
  step_id: string;
  status: string;
  adapter: string;
  category: string;
  risk: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  inputs: string | null;
  outputs: string | null;
  params: string | null;
};

export class StepsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: {
    run_id: string;
    step_id: string;
    status?: RunStepStatus;
    adapter: string;
    category: string;
    risk: string;
    started_at?: string;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    params?: Record<string, unknown>;
  }): RunStep {
    const id = newId();
    const createdAt = nowIso();
    const status = input.status ?? "pending";
    this.db
      .prepare(
        "INSERT INTO run_steps (id, run_id, step_id, status, adapter, category, risk, created_at, started_at, inputs, outputs, params) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.run_id,
        input.step_id,
        status,
        input.adapter,
        input.category,
        input.risk,
        createdAt,
        input.started_at ?? null,
        serializeJson(input.inputs),
        serializeJson(input.outputs),
        serializeJson(input.params)
      );
    return {
      id,
      run_id: input.run_id,
      step_id: input.step_id,
      status,
      adapter: input.adapter,
      category: input.category,
      risk: input.risk,
      created_at: createdAt,
      started_at: input.started_at,
      inputs: input.inputs,
      outputs: input.outputs,
      params: input.params
    };
  }

  updateStatus(
    stepId: string,
    status: RunStepStatus,
    updates?: { started_at?: string; finished_at?: string; outputs?: Record<string, unknown> }
  ): RunStep | null {
    const current = this.getById(stepId);
    if (!current) {
      return null;
    }
    const startedAt = updates?.started_at ?? current.started_at ?? null;
    const finishedAt = updates?.finished_at ?? current.finished_at ?? null;
    const outputs = updates?.outputs ?? current.outputs ?? undefined;
    this.db
      .prepare(
        "UPDATE run_steps SET status = ?, started_at = ?, finished_at = ?, outputs = ? WHERE id = ?"
      )
      .run(status, startedAt, finishedAt, serializeJson(outputs), stepId);
    return {
      ...current,
      status,
      started_at: startedAt ?? undefined,
      finished_at: finishedAt ?? undefined,
      outputs
    };
  }

  getById(id: string): RunStep | null {
    const row = this.db
      .prepare("SELECT * FROM run_steps WHERE id = ?")
      .get(id) as StepRow | undefined;
    return row ? this.toStep(row) : null;
  }

  private toStep(row: StepRow): RunStep {
    return {
      id: row.id,
      run_id: row.run_id,
      step_id: row.step_id,
      status: row.status as RunStepStatus,
      adapter: row.adapter,
      category: row.category,
      risk: row.risk,
      created_at: row.created_at,
      started_at: row.started_at ?? undefined,
      finished_at: row.finished_at ?? undefined,
      inputs: parseJson(row.inputs),
      outputs: parseJson(row.outputs),
      params: parseJson(row.params)
    };
  }
}
