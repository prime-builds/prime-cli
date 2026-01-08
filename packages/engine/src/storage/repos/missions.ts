import type Database from "better-sqlite3";
import type { MissionManifest } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

type MissionRow = {
  mission_id: string;
  chat_id: string;
  objective: string;
  scope_targets: string;
  constraints: string | null;
  success_criteria: string | null;
  notes: string | null;
  created_at: string;
};

export class MissionsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByChatId(chatId: string): MissionManifest | null {
    const row = this.db
      .prepare("SELECT * FROM mission_manifests WHERE chat_id = ?")
      .get(chatId) as MissionRow | undefined;
    return row ? this.toManifest(row) : null;
  }

  setManifest(
    chatId: string,
    input: Omit<MissionManifest, "mission_id" | "chat_id" | "created_at">
  ): MissionManifest {
    const existing = this.getByChatId(chatId);
    const missionId = existing?.mission_id ?? newId();
    const createdAt = existing?.created_at ?? nowIso();
    this.db
      .prepare(
        `INSERT INTO mission_manifests
        (mission_id, chat_id, objective, scope_targets, constraints, success_criteria, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          objective = excluded.objective,
          scope_targets = excluded.scope_targets,
          constraints = excluded.constraints,
          success_criteria = excluded.success_criteria,
          notes = excluded.notes`
      )
      .run(
        missionId,
        chatId,
        input.objective,
        JSON.stringify(input.scope_targets),
        input.constraints ? JSON.stringify(input.constraints) : null,
        input.success_criteria ? JSON.stringify(input.success_criteria) : null,
        input.notes ?? null,
        createdAt
      );
    return {
      mission_id: missionId,
      chat_id: chatId,
      objective: input.objective,
      scope_targets: input.scope_targets,
      constraints: input.constraints,
      success_criteria: input.success_criteria,
      notes: input.notes,
      created_at: createdAt
    };
  }

  private toManifest(row: MissionRow): MissionManifest {
    const constraints = row.constraints ? (JSON.parse(row.constraints) as string[]) : undefined;
    const success = row.success_criteria
      ? (JSON.parse(row.success_criteria) as string[])
      : undefined;
    return {
      mission_id: row.mission_id,
      chat_id: row.chat_id,
      objective: row.objective,
      scope_targets: JSON.parse(row.scope_targets) as string[],
      constraints: Array.isArray(constraints) ? constraints : undefined,
      success_criteria: Array.isArray(success) ? success : undefined,
      notes: row.notes ?? undefined,
      created_at: row.created_at
    };
  }
}
