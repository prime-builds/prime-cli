import type Database from "better-sqlite3";
import type { Run, RunStatus } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

type RunRow = {
  id: string;
  project_id: string;
  chat_id: string | null;
  workflow_id: string;
  workflow_json: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  parent_run_id: string | null;
  forked_from_step_id: string | null;
  replay_of_run_id: string | null;
  planner_provider_id: string | null;
  planner_model_name: string | null;
  planner_prompt_version: string | null;
  critic_prompt_version: string | null;
  planner_latency_ms: number | null;
  planner_tokens_in: number | null;
  planner_tokens_out: number | null;
  tokens_estimate: number | null;
};

export class RunsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: {
    project_id: string;
    chat_id?: string;
    workflow_id: string;
    workflow_json?: string | null;
    status?: RunStatus;
    started_at?: string;
    parent_run_id?: string | null;
    forked_from_step_id?: string | null;
    replay_of_run_id?: string | null;
    planner_provider_id?: string | null;
    planner_model_name?: string | null;
    planner_prompt_version?: string | null;
    critic_prompt_version?: string | null;
    planner_latency_ms?: number | null;
    planner_tokens_in?: number | null;
    planner_tokens_out?: number | null;
    tokens_estimate?: number | null;
  }): Run {
    const id = newId();
    const createdAt = nowIso();
    const status = input.status ?? "pending";
    this.db
      .prepare(
        `INSERT INTO runs
        (id, project_id, chat_id, workflow_id, workflow_json, status, created_at, started_at,
         parent_run_id, forked_from_step_id, replay_of_run_id,
         planner_provider_id, planner_model_name,
         planner_prompt_version, critic_prompt_version, planner_latency_ms,
         planner_tokens_in, planner_tokens_out, tokens_estimate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.project_id,
        input.chat_id ?? null,
        input.workflow_id,
        input.workflow_json ?? null,
        status,
        createdAt,
        input.started_at ?? null,
        input.parent_run_id ?? null,
        input.forked_from_step_id ?? null,
        input.replay_of_run_id ?? null,
        input.planner_provider_id ?? null,
        input.planner_model_name ?? null,
        input.planner_prompt_version ?? null,
        input.critic_prompt_version ?? null,
        input.planner_latency_ms ?? null,
        input.planner_tokens_in ?? null,
        input.planner_tokens_out ?? null,
        input.tokens_estimate ?? null
      );
    return {
      id,
      project_id: input.project_id,
      chat_id: input.chat_id,
      workflow_id: input.workflow_id,
      status,
      created_at: createdAt,
      started_at: input.started_at,
      parent_run_id: input.parent_run_id ?? undefined,
      forked_from_step_id: input.forked_from_step_id ?? undefined,
      replay_of_run_id: input.replay_of_run_id ?? undefined,
      planner_provider_id: input.planner_provider_id ?? undefined,
      planner_model_name: input.planner_model_name ?? undefined,
      planner_prompt_version: input.planner_prompt_version ?? undefined,
      critic_prompt_version: input.critic_prompt_version ?? undefined,
      planner_latency_ms: input.planner_latency_ms ?? undefined,
      planner_tokens_in: input.planner_tokens_in ?? undefined,
      planner_tokens_out: input.planner_tokens_out ?? undefined,
      tokens_estimate: input.tokens_estimate ?? undefined
    };
  }

  updateStatus(
    runId: string,
    status: RunStatus,
    updates?: { started_at?: string; finished_at?: string; error?: string | null }
  ): Run | null {
    const current = this.getById(runId);
    if (!current) {
      return null;
    }
    const startedAt = updates?.started_at ?? current.started_at ?? null;
    const finishedAt = updates?.finished_at ?? current.finished_at ?? null;
    const error = updates?.error ?? current.error ?? null;
    this.db
      .prepare(
        "UPDATE runs SET status = ?, started_at = ?, finished_at = ?, error = ? WHERE id = ?"
      )
      .run(status, startedAt, finishedAt, error, runId);
    return {
      ...current,
      status,
      started_at: startedAt ?? undefined,
      finished_at: finishedAt ?? undefined,
      error: error ?? undefined
    };
  }

  getById(runId: string): Run | null {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as RunRow | undefined;
    return row ? this.toRun(row) : null;
  }

  getWorkflowJson(runId: string): string | null {
    const row = this.db
      .prepare("SELECT workflow_json FROM runs WHERE id = ?")
      .get(runId) as { workflow_json: string | null } | undefined;
    return row?.workflow_json ?? null;
  }

  listByProject(projectId: string): Run[] {
    const rows = this.db
      .prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as RunRow[];
    return rows.map((row) => this.toRun(row));
  }

  listByChat(chatId: string): Run[] {
    const rows = this.db
      .prepare("SELECT * FROM runs WHERE chat_id = ? ORDER BY created_at DESC")
      .all(chatId) as RunRow[];
    return rows.map((row) => this.toRun(row));
  }

  private toRun(row: RunRow): Run {
    return {
      id: row.id,
      project_id: row.project_id,
      chat_id: row.chat_id ?? undefined,
      workflow_id: row.workflow_id,
      status: row.status as RunStatus,
      created_at: row.created_at,
      started_at: row.started_at ?? undefined,
      finished_at: row.finished_at ?? undefined,
      error: row.error ?? undefined,
      parent_run_id: row.parent_run_id ?? undefined,
      forked_from_step_id: row.forked_from_step_id ?? undefined,
      replay_of_run_id: row.replay_of_run_id ?? undefined,
      planner_provider_id: row.planner_provider_id ?? undefined,
      planner_model_name: row.planner_model_name ?? undefined,
      planner_prompt_version: row.planner_prompt_version ?? undefined,
      critic_prompt_version: row.critic_prompt_version ?? undefined,
      planner_latency_ms: row.planner_latency_ms ?? undefined,
      planner_tokens_in: row.planner_tokens_in ?? undefined,
      planner_tokens_out: row.planner_tokens_out ?? undefined,
      tokens_estimate: row.tokens_estimate ?? undefined
    };
  }
}
