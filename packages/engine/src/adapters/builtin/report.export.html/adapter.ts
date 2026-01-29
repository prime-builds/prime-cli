import fs from "fs";
import path from "path";
import type { AdapterExecution, AdapterLogEntry } from "../../../../../core/src/adapters";
import type { ReportArtifact, ReportExportArtifact } from "../../../../../core/src/artifacts";

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  const report = loadInput<ReportArtifact>(inputs, "report.json", ctx);
  const includeCss = params.include_css !== false;

  const reportPath = resolvePath(ctx.project_root, report.report_path);
  const markdown = fs.readFileSync(reportPath, "utf8");
  const htmlBody = escapeHtml(markdown).replace(/\n/g, "<br />\n");
  const css = includeCss
    ? "body{font-family:Arial, sans-serif; padding:24px; background:#0f1115; color:#e5e7eb;} h1,h2,h3{color:#7dd3fc;}"
    : "";

  const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Report</title>${includeCss ? `<style>${css}</style>` : ""}</head><body>${htmlBody}</body></html>`;

  const exportDir = path.resolve(ctx.project_root, "reports", ctx.run_id ?? "run");
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, "report.html");
  fs.writeFileSync(exportPath, html, "utf8");

  const artifact: ReportExportArtifact = {
    target: report.target,
    timestamp: new Date().toISOString(),
    artifacts: report.artifacts,
    report_path: report.report_path,
    export_path: toRelativePath(ctx.project_root, exportPath)
  };

  const logs: AdapterLogEntry[] = [
    { level: "info", message: "report export complete", data: { path: artifact.export_path } }
  ];

  return {
    logs,
    artifacts: [
      {
        type: "report_export.json",
        content_json: artifact
      }
    ]
  };
};

function resolvePath(projectRoot: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(projectRoot, filePath);
}

function toRelativePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  if (!relative || relative.startsWith("..")) {
    return filePath;
  }
  return relative.split(path.sep).join("/");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadInput<T>(
  inputs: Array<{ type: string; content_json?: unknown; path?: string }>,
  type: string,
  ctx: { project_root: string }
): T {
  const artifact = inputs.find((entry) => entry.type === type);
  if (!artifact) {
    throw new Error(`missing input artifact: ${type}`);
  }
  if (artifact.content_json) {
    return artifact.content_json as T;
  }
  if (!artifact.path) {
    throw new Error(`input artifact missing content and path: ${type}`);
  }
  const resolved = path.isAbsolute(artifact.path)
    ? artifact.path
    : path.resolve(ctx.project_root, artifact.path);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw) as T;
}
