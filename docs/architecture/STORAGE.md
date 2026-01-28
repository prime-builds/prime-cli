
# Prime CLI - Storage Model

## Philosophy
- Files live on disk.
- SQLite stores metadata, relationships, and indexes.
- The database is never used as a blob store.

## On-Disk Layout
<ProjectRoot>/
  docs/
  artifacts/<run_id>/
  evidence/<run_id>/<step_id>/
  reports/
  logs/

## SQLite Tables
- projects
- chats
- chat_messages
- mission_manifests
- runs
- run_steps
- artifacts
- evidence
- docs
- doc_chunks
- doc_chunks_fts (FTS5)

## Mission Manifests
Stored as a dedicated table, one per chat.

## Artifacts
- Stored as files on disk
- Indexed in SQLite with:
  - path
  - hash
  - size
  - producing run/step
  - timestamps

## Evidence
- Raw outputs and response samples stored under `evidence/<run_id>/<step_id>/`
- Evidence metadata recorded in SQLite for traceability

## Knowledge Base Docs
- Imported files are copied into `<ProjectRoot>/docs/`
- `docs` stores document metadata (paths, hashes, tags)
- `doc_chunks` stores extracted text segments
- `doc_chunks_fts` provides full-text search over chunks

## Reports
- Reports are written under `<ProjectRoot>/reports/<run_id>/report.md`
- `report.json` metadata artifacts register report paths in SQLite

## Versioning
Artifact edits preserve prior versions via backup files.

## Migrations
Schema changes are applied via forward-only migrations.
