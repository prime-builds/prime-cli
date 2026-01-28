# Prompt — M7 Desktop Cockpit (VS Code UI) + Engine Wiring + Artifact Editor

```text
You are working in https://github.com/prime-builds/prime-cli.git

Precondition:
- The Findings Pipeline milestone (candidates ? triage ? report) is finished and merged.
- Engine + IPC + SQLite + events + artifacts + KB search already exist.
- Adapter platform and scaffolder exist.

Now build the VS Code–style DESKTOP COCKPIT to make the system usable end-to-end.

DO NOT:
- Add web server / REST API
- Add auth/cloud features
- Implement new engine features unrelated to UI wiring
- Add exploit logic
- Overdesign visuals — minimal clean UI is enough

GOAL (Definition of Done)
From the desktop app, a user can:
1) Open/select a Project (choose project root folder)
2) Create/select a Chat and send a message
3) Start a Run (if engine doesn’t auto-start) and watch live RunEvents
4) Open artifacts produced by steps
5) Edit a JSON artifact and save (artifact.update)
6) Replay a run and fork from a chosen step
7) Open the generated report.md in a tab
8) Search docs (KB) and open source documents

A) Electron App Setup (apps/desktop)
- Main process: window + start/attach engine process
- Preload: contextIsolation true, expose typed API on window.prime
- Renderer: React + TypeScript, VS Code-like layout
Use a modern Electron+Vite setup. Keep deps minimal.

B) Typed IPC Wiring
Use packages/shared IPC contracts end-to-end. Expose:
- project.*  chat.*  mission.*  run.*  artifact.*  docs.*  adapters.list
Event subscriptions must be leak-free (cleanup on unmount/tab close).

C) UI Layout (VS Code-style)
Sidebar: Projects, Chats, Runs, Artifacts, Docs, Adapters
Tabs: Chat, Run, Artifact(JSON Monaco), Report(Markdown), Docs Search
Bottom panel: Run Output (events), Engine Logs (optional), Audit (optional)

D) Chat Tab
- MissionManifest objective pinned at top + edit modal
- Message list + input
- On send, open Run tab if a run is created and auto-subscribe

E) Run Tab
- Steps table + step detail (logs + artifacts)
Controls: Cancel, Replay, Fork-from-step, Open report if present
Live event stream shown in bottom panel.

F) Artifact Explorer + Editor
- List artifacts grouped by run
- Open JSON artifacts in Monaco (read-only by default; edit toggle)
- Save -> artifact.update({artifact_id, new_content_json, reason})
- Ensure ARTIFACT_EDITED shows in output panel
- Open report.md in a Markdown tab (basic renderer ok)

G) Docs (KB) Search UI
- Import docs (file picker) -> docs.import
- Search -> docs.search
- Open -> docs.open

H) Adapters Panel
Read-only list with id/category/risk/inputs/outputs/params summary.

I) Minimal Tests / Smoke
Dev boot reliability + minimal smoke script. Don’t block on full e2e.

J) Docs
Update README (desktop dev run) + ARCHITECTURE.md (desktop responsibilities + IPC boundary).

Commit in logical chunks.
```
