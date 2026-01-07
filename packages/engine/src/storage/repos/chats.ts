import type Database from "better-sqlite3";
import type { Chat, ChatCreateRequest } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

type ChatRow = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string | null;
};

export class ChatsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: ChatCreateRequest): Chat {
    const id = newId();
    const createdAt = nowIso();
    const title = input.title?.trim() || "New Chat";
    this.db
      .prepare(
        "INSERT INTO chats (id, project_id, title, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(id, input.project_id, title, createdAt);
    return {
      id,
      project_id: input.project_id,
      title,
      created_at: createdAt
    };
  }

  listByProject(projectId: string): Chat[] {
    const rows = this.db
      .prepare("SELECT * FROM chats WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as ChatRow[];
    return rows.map(this.toChat);
  }

  getById(id: string): Chat | null {
    const row = this.db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .get(id) as ChatRow | undefined;
    return row ? this.toChat(row) : null;
  }

  private toChat(row: ChatRow): Chat {
    return {
      id: row.id,
      project_id: row.project_id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at ?? undefined
    };
  }
}
