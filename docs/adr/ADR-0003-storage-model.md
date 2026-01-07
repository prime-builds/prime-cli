# ADR-0003: Storage Model

## Context
The system needs durable local storage for metadata, fast search, and large artifacts. It must remain portable and debuggable on a single machine.

## Decision
Store metadata and search indices in SQLite, and store artifacts on the filesystem.

## Consequences
- SQLite provides a single-file, reliable metadata store with simple migrations.
- Artifacts avoid database bloat and remain easy to inspect or back up.
- The metadata layer must track filesystem paths and lifecycle of artifacts.
