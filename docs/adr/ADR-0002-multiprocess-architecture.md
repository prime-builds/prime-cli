# ADR-0002: Multiprocess Architecture

## Context
The application is local-first, deterministic, and must remain responsive while executing potentially long-running workflows. Electron UI stability should not depend on execution details.

## Decision
Use an Electron UI process and a separate Engine process, communicating over IPC (not HTTP).

## Consequences
- The Engine lifecycle is isolated from the UI, improving stability and responsiveness.
- IPC contracts become a first-class interface and must be versioned carefully.
- Cross-process boundaries require explicit data models and event streaming patterns.
