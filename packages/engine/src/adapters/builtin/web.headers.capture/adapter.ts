import fs from "fs";
import path from "path";
import type { AdapterExecution, AdapterLogEntry } from "../../../../../core/src/adapters";
import type { WebHeadersArtifact } from "../../../../../core/src/artifacts";

export const execute: AdapterExecution["execute"] = async (params, _inputs, ctx) => {
  const targetUrl = String(params.target_url ?? "").trim();
  if (!targetUrl) {
    throw new Error("target_url is required");
  }

  const timeoutSec = normalizeInt(params.timeout_sec, 10, 1);
  const followRedirects = params.follow_redirects !== false;
  const userAgent = typeof params.user_agent === "string" ? params.user_agent : undefined;

  const logs: AdapterLogEntry[] = [];
  let headers: Array<{ name: string; value: string; source?: string; url?: string }> = [];
  let notes: string[] = [];
  let status = 0;
  let finalUrl = targetUrl;

  try {
    const response = await fetchWithTimeout(targetUrl, timeoutSec * 1000, {
      redirect: followRedirects ? "follow" : "manual",
      headers: userAgent ? { "user-agent": userAgent } : undefined
    });
    status = response.status;
    finalUrl = response.url || targetUrl;
    headers = [...response.headers.entries()].map(([name, value]) => ({
      name,
      value,
      source: "response",
      url: finalUrl
    }));
  } catch (error) {
    notes = ["header capture failed"];
  }

  const evidenceEntries: WebHeadersArtifact["evidence"] = [];
  if (headers.length > 0) {
    const evidenceDir = ctx.evidence_dir ?? ctx.artifacts_dir;
    fs.mkdirSync(evidenceDir, { recursive: true });
    const evidencePath = path.join(evidenceDir, "headers.json");
    fs.writeFileSync(
      evidencePath,
      JSON.stringify({ url: finalUrl, status, headers }, null, 2),
      "utf8"
    );
    evidenceEntries.push({
      kind: "http_headers",
      path: toRelativePath(ctx.project_root, evidencePath),
      description: "Captured response headers"
    });
  }

  const artifact: WebHeadersArtifact = {
    target: targetUrl,
    timestamp: new Date().toISOString(),
    headers,
    evidence: evidenceEntries.length > 0 ? evidenceEntries : undefined,
    notes: notes.length > 0 ? notes : undefined
  };

  logs.push({
    level: "info",
    message: "headers capture complete",
    data: { count: headers.length }
  });

  return {
    logs,
    artifacts: [
      {
        type: "web_headers.json",
        content_json: artifact
      }
    ]
  };
};

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeInt(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
}

function toRelativePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  if (!relative || relative.startsWith("..")) {
    return filePath;
  }
  return relative.split(path.sep).join("/");
}
