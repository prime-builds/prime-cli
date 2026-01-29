PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chat_id TEXT,
  workflow_id TEXT NOT NULL,
  workflow_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  parent_run_id TEXT,
  forked_from_step_id TEXT,
  replay_of_run_id TEXT,
  planner_provider_id TEXT,
  planner_model_name TEXT,
  planner_prompt_version TEXT,
  critic_prompt_version TEXT,
  planner_latency_ms INTEGER,
  planner_tokens_in INTEGER,
  planner_tokens_out INTEGER,
  tokens_estimate INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY (forked_from_step_id) REFERENCES run_steps(id) ON DELETE SET NULL,
  FOREIGN KEY (replay_of_run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL,
  adapter TEXT NOT NULL,
  category TEXT NOT NULL,
  risk TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  inputs TEXT,
  outputs TEXT,
  params TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  chat_id TEXT,
  name TEXT NOT NULL,
  hash TEXT,
  path TEXT NOT NULL,
  media_type TEXT,
  size_bytes INTEGER,
  trust_state TEXT NOT NULL DEFAULT 'trusted',
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  chat_id TEXT,
  artifact_id TEXT,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  hash TEXT,
  media_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mission_manifests (
  mission_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  objective TEXT NOT NULL,
  scope_targets TEXT NOT NULL,
  constraints TEXT,
  success_criteria TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS docs (
  doc_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_ext TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  mime TEXT,
  title TEXT,
  tool_name TEXT,
  category TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_chunks (
  chunk_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks_fts USING fts5(
  chunk_id,
  doc_id,
  text
);

CREATE INDEX IF NOT EXISTS idx_docs_project_id ON docs(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id ON doc_chunks(doc_id);
