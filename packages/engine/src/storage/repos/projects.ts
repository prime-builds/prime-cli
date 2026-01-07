import type Database from "better-sqlite3";
import type { Project, ProjectCreateRequest } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string | null;
};

export class ProjectsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: ProjectCreateRequest): Project {
    const id = newId();
    const createdAt = nowIso();
    this.db
      .prepare(
        "INSERT INTO projects (id, name, root_path, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(id, input.name, input.root_path, createdAt);
    return {
      id,
      name: input.name,
      root_path: input.root_path,
      created_at: createdAt
    };
  }

  list(): Project[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as ProjectRow[];
    return rows.map(this.toProject);
  }

  getById(id: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;
    return row ? this.toProject(row) : null;
  }

  getByRootPath(rootPath: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE root_path = ?")
      .get(rootPath) as ProjectRow | undefined;
    return row ? this.toProject(row) : null;
  }

  private toProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      root_path: row.root_path,
      created_at: row.created_at,
      updated_at: row.updated_at ?? undefined
    };
  }
}
