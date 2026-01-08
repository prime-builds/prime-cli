You are working in https://github.com/prime-builds/prime-cli.git

Context:
- Adapter platform is done (SDK, scaffolder, conformance, tests, discovery, CI).
- Engine exists (SQLite, IPC, run lifecycle, events, artifacts, fork/replay/edit, provenance).
- Prompts are versioned under docs/prompts/.

Now remove the next bottleneck:
-> The Planner chooses poorly because it lacks grounded tool/document knowledge.

Goal:
Build a LOCAL Knowledge Base that ingests tool docs into the project folder,
extracts text, chunks it, indexes it with SQLite FTS5, and provides retrieval APIs.
Then wire retrieved snippets into planner context (capability-level + grounded snippets).

DO NOT:
- Add a vector database in this milestone (FTS only)
- Call external web services
- Build UI
- Implement exploit logic
- Add heavy policy/security bureaucracy

------------------------------------------------------------
A) Project Folder Convention (Docs)
------------------------------------------------------------
Ensure every project has:
<ProjectRoot>/docs/

Importing a doc means:
- Copy the original file into <ProjectRoot>/docs/<some-safe-name>
- Store metadata + extracted text index in SQLite
- Never store full file blobs in SQLite

------------------------------------------------------------
B) SQLite Schema (Docs + Chunks + FTS)
------------------------------------------------------------
Add migrations (no data loss).

Create tables:

docs
- doc_id TEXT PRIMARY KEY
- project_id TEXT NOT NULL
- source_path TEXT NOT NULL          -- relative path under project root
- file_name TEXT NOT NULL
- file_ext TEXT NOT NULL
- sha256 TEXT NOT NULL
- bytes INTEGER NOT NULL
- mime TEXT
- title TEXT                         -- optional
- tool_name TEXT                     -- optional tag
- category TEXT                      -- optional tag
- created_at TEXT NOT NULL

doc_chunks
- chunk_id TEXT PRIMARY KEY
- doc_id TEXT NOT NULL
- ordinal INTEGER NOT NULL
- text TEXT NOT NULL
- start_offset INTEGER
- end_offset INTEGER
- created_at TEXT NOT NULL

FTS:
- Use SQLite FTS5 virtual table:
  doc_chunks_fts(chunk_id, doc_id, text)
- Maintain it via triggers or explicit updates in code.

Add indexes minimally where helpful (doc_id foreign keys).

------------------------------------------------------------
C) Text Extraction (Local-only, Practical)
------------------------------------------------------------
Implement extraction for:
- .md, .txt (plain read)
- .html/.htm (strip tags -> text; preserve headings as newline markers)

Optional (nice-to-have if already easy):
- .json (pretty-print then index)
- PDFs can be deferred unless you already have a reliable local parser.

Store extracted text only in doc_chunks/doc_chunks_fts (not entire doc text in one row).

------------------------------------------------------------
D) Chunking Strategy
------------------------------------------------------------
Implement deterministic chunking:
- chunk_size_chars ~ 2000 (configurable)
- overlap_chars ~ 200 (configurable)
- split preferentially on headings/newlines when possible

Persist:
- ordinal
- offsets (optional but nice)

------------------------------------------------------------
E) Engine API + IPC
------------------------------------------------------------
Add engine services + IPC endpoints:

docs.import
Input:
{ project_id, file_paths: string[], tags?: {tool_name?, category?} }
Behavior:
- copy files into project docs/
- compute sha256
- extract text
- chunk + index into SQLite/FTS
Output:
{ imported: number, skipped: number, errors: [...] }

docs.list
Input: { project_id, filter?: {tool_name?, category?, ext?} }
Output: docs[]

docs.search
Input:
{ project_id, query: string, top_k?: number, filter?: {tool_name?, category?} }
Output:
[
  { doc_id, chunk_id, score, snippet, file_name, tool_name?, category? }
]

docs.open
Input: { project_id, doc_id }
Output: { doc metadata + absolute_path }

Add minimal logging/events if your event system supports it (not required).

------------------------------------------------------------
F) Planner Context Wiring (Grounding)
------------------------------------------------------------
Create a planner-context builder that produces:

- adapter_capabilities: existing adapter summaries
- mission_manifest: objective + scope targets
- retrieved_snippets: top N results from docs.search for:
   - user goal + mission objective
   - plus adapter names/categories
   - plus any tool_name tags

Important rules:
- Planner sees ONLY the snippet text + doc references (doc_id/chunk_id/file_name)
- Do NOT show raw file paths unless needed (use file_name + ids).
- Snippets must be short (e.g. <= 1200 chars each) and limited (e.g. top 6).

Update prompts:
- Create docs/prompts/planner-v1.md that instructs the planner to:
  - use retrieved_snippets when choosing params
  - cite snippet references in a simple field inside step params if needed (optional)
Keep the JSON-only workflow output rule unchanged.

Store provenance:
- runs.planner_prompt_version should now use "planner-v1" when enabled.

------------------------------------------------------------
G) Tests (Mandatory)
------------------------------------------------------------
Add tests that:
1) Create a project with a temp ProjectRoot
2) Import a small .md and .html doc
3) Verify:
   - doc rows created
   - chunks created
   - FTS search returns expected snippets for a query
4) Verify planner context builder includes snippets deterministically
5) Verify migrations apply cleanly

------------------------------------------------------------
H) Developer Ergonomics
------------------------------------------------------------
Add npm scripts:
- docs:import  (optional CLI helper)
- docs:search  (optional CLI helper)

Update docs:
- docs/architecture/STORAGE.md: add doc index tables + FTS
- docs/architecture/ARCHITECTURE.md: add Knowledge Base component
- docs/adr/ add ADR for Knowledge Base decision (FTS-first, vector later)

------------------------------------------------------------
Quality Bar (Done means)
------------------------------------------------------------
- docs.import, docs.search, docs.list work end-to-end
- FTS search is fast and deterministic
- Planner context now has grounded snippets
- Tests pass
- No UI changes

Commit in logical chunks.
