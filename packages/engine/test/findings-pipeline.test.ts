import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execute as candidatesExecute } from "../src/adapters/builtin/findings.candidates.from_web_surface/adapter";
import { execute as triageExecute } from "../src/adapters/builtin/findings.triage.rulebased/adapter";
import { execute as reportExecute } from "../src/adapters/builtin/report.generate.markdown/adapter";
import type { AdapterExecutionContext } from "../../core/src/adapters";
import { validateArtifactContent } from "../../core/src/artifacts";
import { createRepos } from "../src/storage";
import { openDatabase } from "../src/storage/db";
import { DocsService } from "../src/docs";
import { Logger } from "../src/logger";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

test("findings pipeline generates candidates, triage, and report with KB refs", async () => {
  const tempDir = createTempDir("findings");
  const projectRoot = path.join(tempDir, "project");
  fs.mkdirSync(projectRoot, { recursive: true });

  const dbPath = path.join(tempDir, "engine.db");
  const logger = new Logger("error");
  const db = openDatabase(dbPath, logger);
  const repos = createRepos(db);
  const project = repos.projects.create({ name: "Findings Project", root_path: projectRoot });
  const docs = new DocsService(repos, logger);

  const kbSource = path.join(tempDir, "kb.md");
  fs.writeFileSync(
    kbSource,
    "# Security Headers\nMissing security headers explanation and impact.",
    "utf8"
  );
  const importResult = docs.importDocs({
    project_id: project.id,
    file_paths: [kbSource],
    tags: { tool_name: "headers", category: "security" }
  });
  assert.equal(importResult.imported, 1);

  const evidenceDir = path.join(projectRoot, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, "response.json");
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        url: "https://example.com/",
        status: 200,
        headers: { "content-type": "text/html" },
        body_sample:
          "<html><body><h1>Index of /</h1><input type=\"password\"></body></html>"
      },
      null,
      2
    ),
    "utf8"
  );

  const webSurface = {
    target: "https://example.com",
    timestamp: "2025-01-01T00:00:00Z",
    urls: [
      { url: "https://example.com/", source: "seed" },
      { url: "http://example.com/insecure.js", source: "script" },
      { url: "https://example.com/admin", source: "anchor" },
      { url: "https://example.com/robots.txt", source: "anchor" }
    ],
    forms: [{ action: "https://example.com/login", method: "POST" }],
    evidence: [
      {
        kind: "http_response",
        path: path.relative(projectRoot, evidencePath).split(path.sep).join("/"),
        description: "Response sample"
      }
    ]
  };

  const ctx: AdapterExecutionContext = {
    project_root: projectRoot,
    artifacts_dir: path.join(tempDir, "artifacts"),
    run_id: "run-1",
    step_id: "step-1",
    mission: { objective: "Assess web surface", scope_targets: ["https://example.com"] },
    docs_search: (input) =>
      docs.searchDocs({
        project_id: project.id,
        query: input.query,
        top_k: input.top_k,
        filter: input.filter
      })
  };

  const candidatesResult = await candidatesExecute(
    {
      target: "https://example.com",
      ruleset: "baseline",
      include_kb_refs: true,
      max_candidates: 10
    },
    [{ type: "web_surface.json", content_json: webSurface }],
    ctx
  );
  const candidatesArtifact = candidatesResult.artifacts[0].content_json;
  assert.ok(candidatesArtifact);
  const candidatesValidation = validateArtifactContent(
    "findings_candidates.json",
    candidatesArtifact
  );
  assert.ok(candidatesValidation.ok, candidatesValidation.errors.join("; "));

  const candidateTypes = (candidatesArtifact as { candidates: Array<{ type: string; refs: unknown[] }> })
    .candidates
    .map((entry) => entry.type);
  assert.ok(candidateTypes.includes("missing_security_headers"));
  assert.ok(candidateTypes.includes("authentication_surface_present"));

  const withRefs = (candidatesArtifact as { candidates: Array<{ refs: unknown[] }> }).candidates.some(
    (entry) => entry.refs.length > 0
  );
  assert.ok(withRefs);

  const triageResult = await triageExecute(
    { triage_mode: "balanced", max_kept: 5 },
    [{ type: "findings_candidates.json", content_json: candidatesArtifact }],
    ctx
  );
  const triagedArtifact = triageResult.artifacts[0].content_json;
  assert.ok(triagedArtifact);
  const triageValidation = validateArtifactContent(
    "findings_triaged.json",
    triagedArtifact
  );
  assert.ok(triageValidation.ok, triageValidation.errors.join("; "));

  const reportResult = await reportExecute(
    { template: "default", include_evidence_links: true, include_kb_citations: true },
    [
      { type: "web_surface.json", content_json: webSurface },
      { type: "findings_triaged.json", content_json: triagedArtifact },
      { type: "findings_candidates.json", content_json: candidatesArtifact }
    ],
    ctx
  );
  const reportArtifact = reportResult.artifacts[0].content_json as { report_path: string };
  const reportValidation = validateArtifactContent("report.json", reportArtifact);
  assert.ok(reportValidation.ok, reportValidation.errors.join("; "));
  const reportPath = path.resolve(projectRoot, reportArtifact.report_path);
  assert.ok(fs.existsSync(reportPath));
  const reportBody = fs.readFileSync(reportPath, "utf8");
  assert.ok(reportBody.includes("Assessment Report"));
  assert.ok(reportBody.includes("Mission Objective: Assess web surface"));

  db.close();
});
