import type Database from "better-sqlite3";
import type { ChatMessage, ChatMessageInput } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { serializeJson, parseJson } from "../../utils/json";
import { nowIso } from "../../utils/time";

type ChatMessageRow = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  metadata: string | null;
  created_at: string;
};

export class MessagesRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(chatId: string, message: ChatMessageInput): ChatMessage {
    const id = newId();
    const createdAt = nowIso();
    const metadata = serializeJson(message.metadata);
    this.db
      .prepare(
        "INSERT INTO chat_messages (id, chat_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, chatId, message.role, message.content, metadata, createdAt);
    return {
      id,
      chat_id: chatId,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      created_at: createdAt
    };
  }

  listByChat(chatId: string): ChatMessage[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC"
      )
      .all(chatId) as ChatMessageRow[];
    return rows.map(this.toMessage);
  }

  private toMessage(row: ChatMessageRow): ChatMessage {
    return {
      id: row.id,
      chat_id: row.chat_id,
      role: row.role as ChatMessage["role"],
      content: row.content,
      metadata: parseJson(row.metadata),
      created_at: row.created_at
    };
  }
}
