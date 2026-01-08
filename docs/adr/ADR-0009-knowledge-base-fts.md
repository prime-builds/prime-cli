# ADR-0009: Knowledge Base via SQLite FTS

## Context
The planner needs grounded tool and documentation knowledge without adding external services or vector databases. The system is local-first and must index project docs deterministically.

## Decision
Ingest documentation into `<ProjectRoot>/docs/`, extract text, chunk it, and index chunks using SQLite FTS5 (`docs`, `doc_chunks`, `doc_chunks_fts` tables). Retrieval uses FTS queries only.

## Consequences
- Documentation is searchable offline and available for planner context grounding.
- No external dependencies or remote services are required.
- A future vector-based layer can be added without changing the core storage model.

## References
- ARCHITECTURE.md
- STORAGE.md
