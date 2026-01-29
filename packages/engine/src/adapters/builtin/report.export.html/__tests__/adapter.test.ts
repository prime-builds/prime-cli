import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execute } from "../adapter";
import { validateArtifactContent } from "../../../../../core/src/artifacts";

test("report.export.html emits schema-valid export", async () => {
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), "tmp-report-"));
  const reportDir = path.join(tmpDir, "reports", "run");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "report.md");
  fs.writeFileSync(reportPath, "# Report\n", "utf8");

  const report = {
    target: "https://example.com",
    timestamp: "2025-01-01T00:00:00Z",
    artifacts: ["web_surface.json"],
    report_path: path.relative(tmpDir, reportPath).split(path.sep).join("/")
  };

  const result = await execute(
    { include_css: true },
    [{ type: "report.json", content_json: report }],
    { project_root: tmpDir, artifacts_dir: tmpDir, run_id: "run-1" }
  );

  const artifact = result.artifacts[0].content_json;
  const validation = validateArtifactContent("report_export.json", artifact);
  assert.ok(validation.ok, validation.errors.join("; "));
});
