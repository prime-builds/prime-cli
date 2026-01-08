param(
  [switch]$SkipNpmChecks,
  [switch]$KeepTemp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Section([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path (Join-Path $repoRoot "package.json"))) {
  throw "package.json not found. Run this script from the repo."
}

if (-not $SkipNpmChecks) {
  Write-Section "Running adapter conformance"
  npm run adapters:check
  if ($LASTEXITCODE -ne 0) { throw "adapters:check failed" }

  Write-Section "Running adapter fixtures"
  npm run adapters:test
  if ($LASTEXITCODE -ne 0) { throw "adapters:test failed" }

  Write-Section "Running engine tests"
  npm run test:engine
  if ($LASTEXITCODE -ne 0) { throw "test:engine failed" }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tempRoot = Join-Path $env:TEMP "prime-cli-web-surface-$timestamp"
$projectRoot = Join-Path $tempRoot "project"
$siteRoot = Join-Path $tempRoot "site"
$artifactsDir = Join-Path $tempRoot "artifacts"
$dbPath = Join-Path $tempRoot "engine.db"

New-Item -ItemType Directory -Force -Path $projectRoot, $siteRoot, $artifactsDir | Out-Null

@'
<!doctype html>
<html>
  <head>
    <title>Prime CLI Test</title>
    <script src="/app.js"></script>
  </head>
  <body>
    <a href="/about.html">About</a>
    <form action="/submit" method="post"></form>
    <img src="/logo.png" />
  </body>
</html>
'@ | Set-Content (Join-Path $siteRoot "index.html") -Encoding utf8

@'<!doctype html><html><body>About</body></html>'@ | Set-Content (Join-Path $siteRoot "about.html") -Encoding utf8
"console.log('app');" | Set-Content (Join-Path $siteRoot "app.js") -Encoding utf8
"PNG" | Set-Content (Join-Path $siteRoot "logo.png") -Encoding utf8

$repoRootJson = ($repoRoot | ConvertTo-Json -Compress)
$projectRootJson = ($projectRoot | ConvertTo-Json -Compress)
$siteRootJson = ($siteRoot | ConvertTo-Json -Compress)
$artifactsDirJson = ($artifactsDir | ConvertTo-Json -Compress)
$dbPathJson = ($dbPath | ConvertTo-Json -Compress)

$runnerPath = Join-Path $tempRoot "run-web-surface.ts"
@"
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const repoRoot = $repoRootJson;
const projectRoot = $projectRootJson;
const siteRoot = $siteRootJson;
const artifactsDir = $artifactsDirJson;
const dbPath = $dbPathJson;

const engineModule = await import(pathToFileURL(path.join(repoRoot, "packages", "engine", "src", "index.ts")).href);
const artifactsModule = await import(pathToFileURL(path.join(repoRoot, "packages", "core", "src", "artifacts", "index.ts")).href);

const { Engine } = engineModule;
const { validateArtifactContent } = artifactsModule;

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(siteRoot, requestPath);
  if (fs.existsSync(filePath)) {
    res.writeHead(200);
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Failed to start server");
}
const baseUrl = `http://127.0.0.1:${address.port}`;
const targetUrl = `${baseUrl}/index.html`;

const engine = new Engine({
  dbPath,
  artifactsDir,
  logLevel: "error"
});
await engine.start();

const { project } = await engine.createProject({
  name: "Web Surface Project",
  root_path: projectRoot
});
const { chat } = await engine.createChat({ project_id: project.id, title: "Web Chat" });

const workflow = {
  workflow_id: "workflow-web-surface",
  project_id: project.id,
  chat_id: chat.id,
  scope: { targets: [targetUrl] },
  steps: [
    {
      id: "step-1",
      adapter: "web.surface.discover.http",
      category: "web",
      risk: "passive",
      inputs: {},
      outputs: { "web_surface.json": {} },
      limits: {},
      params: { target_url: targetUrl, max_depth: 1, max_pages: 5, timeout_sec: 2 }
    }
  ]
};

const { run } = await engine.startRun({
  project_id: project.id,
  chat_id: chat.id,
  workflow_id: workflow.workflow_id,
  inputs: { workflow }
});

await engine.waitForRun(run.id);

const { artifacts } = await engine.listArtifacts({ run_id: run.id });
if (artifacts.length === 0) {
  throw new Error("No artifacts produced");
}

const artifact = artifacts[0];
const payload = JSON.parse(fs.readFileSync(artifact.path, "utf8"));
const validation = validateArtifactContent("web_surface.json", payload);
if (!validation.ok) {
  throw new Error(`Artifact validation failed: ${validation.errors.join("; ")}`);
}
if (!payload.urls || !payload.urls.some((entry: { url: string }) => entry.url.endsWith("/about.html"))) {
  throw new Error("Expected URL not found in artifact");
}
if (!payload.evidence || payload.evidence.length === 0) {
  throw new Error("Expected evidence entries in artifact");
}

const evidenceDir = path.join(projectRoot, "evidence", run.id, "step-1");
if (!fs.existsSync(evidenceDir) || fs.readdirSync(evidenceDir).length === 0) {
  throw new Error("Evidence files missing");
}

const db = new Database(dbPath);
const evidenceRows = db.prepare("SELECT id FROM evidence WHERE run_id = ?").all(run.id);
if (evidenceRows.length === 0) {
  throw new Error("Evidence rows missing in SQLite");
}

const events = db.prepare("SELECT type FROM run_events WHERE run_id = ? ORDER BY created_at ASC").all(run.id);
const types = events.map((row: { type: string }) => row.type);
const required = ["RUN_STARTED", "STEP_STARTED", "ARTIFACT_WRITTEN", "STEP_FINISHED", "RUN_FINISHED"];
for (const event of required) {
  if (!types.includes(event)) {
    throw new Error(`Missing event: ${event}`);
  }
}

db.close();
await engine.stop();
await new Promise<void>((resolve) => server.close(() => resolve()));

console.log("Web surface discovery verification passed.");
"@ | Set-Content $runnerPath -Encoding utf8

Write-Section "Running end-to-end web surface discovery"
npx tsx $runnerPath
if ($LASTEXITCODE -ne 0) { throw "web surface discovery script failed" }

if (-not $KeepTemp) {
  Remove-Item -Recurse -Force $tempRoot
} else {
  Write-Host "Temp data kept at $tempRoot"
}

Write-Host "All checks passed."
