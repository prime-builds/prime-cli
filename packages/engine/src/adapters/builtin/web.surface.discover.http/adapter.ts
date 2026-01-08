import fs from "fs";
import path from "path";
import type {
  AdapterExecution,
  AdapterLogEntry
} from "../../../../../core/src/adapters";
import type {
  WebSurfaceArtifact,
  WebSurfaceEvidence,
  WebSurfaceForm,
  WebSurfaceLink,
  WebSurfaceUrl
} from "../../../../../core/src/artifacts";

type QueueEntry = {
  url: string;
  depth: number;
  source: string;
};

const SAMPLE_BODY_LIMIT = 2000;

export const execute: AdapterExecution["execute"] = async (params, _inputs, ctx) => {
  const targetUrl = String(params.target_url ?? "").trim();
  if (!targetUrl) {
    throw new Error("target_url is required");
  }

  const maxDepth = normalizeInt(params.max_depth, 1, 0);
  const maxPages = normalizeInt(params.max_pages, 25, 1);
  const timeoutSec = normalizeInt(params.timeout_sec, 10, 1);
  const followRedirects = params.follow_redirects !== false;
  const userAgent =
    typeof params.user_agent === "string" && params.user_agent.length > 0
      ? params.user_agent
      : "Prime-CLI-WebSurface";

  const origin = new URL(targetUrl).origin;
  const evidenceDir = resolveEvidenceDir(ctx);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const queue: QueueEntry[] = [{ url: targetUrl, depth: 0, source: "seed" }];
  const visited = new Set<string>();
  const urlMap = new Map<string, WebSurfaceUrl>();
  const links: WebSurfaceLink[] = [];
  const forms: WebSurfaceForm[] = [];
  const evidence: WebSurfaceEvidence[] = [];
  const logs: AdapterLogEntry[] = [];
  const notes: string[] = [];

  let pagesFetched = 0;

  while (queue.length > 0 && pagesFetched < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current.url)) {
      continue;
    }
    if (ctx.signal?.aborted) {
      throw new Error("run canceled");
    }
    visited.add(current.url);
    pagesFetched += 1;

    try {
      const response = await fetchWithTimeout(
        current.url,
        {
          method: "GET",
          redirect: followRedirects ? "follow" : "manual",
          headers: {
            "User-Agent": userAgent
          }
        },
        timeoutSec * 1000,
        ctx.signal
      );

      const contentType = response.headers.get("content-type") ?? undefined;
      const bodyText = await response.text();
      const sample = bodyText.slice(0, SAMPLE_BODY_LIMIT);
      const headers = Object.fromEntries(response.headers.entries());

      upsertUrl(urlMap, {
        url: current.url,
        method: "GET",
        status: response.status,
        content_type: contentType,
        source: current.source
      });

      const evidencePath = path.join(evidenceDir, `response-${pagesFetched}.json`);
      fs.writeFileSync(
        evidencePath,
        JSON.stringify(
          {
            url: current.url,
            status: response.status,
            headers,
            body_sample: sample
          },
          null,
          2
        ),
        "utf8"
      );

      evidence.push({
        kind: "http_response",
        path: toRelativePath(ctx.project_root, evidencePath),
        description: `Response sample for ${current.url}`
      });

      logs.push({
        level: "info",
        message: "fetched url",
        data: { url: current.url, status: response.status }
      });

      if (contentType && contentType.includes("text/html")) {
        const parsed = parseHtml(bodyText, current.url, origin, current.depth);
        for (const link of parsed.links) {
          links.push(link);
        }
        for (const form of parsed.forms) {
          forms.push(form);
        }
        for (const entry of parsed.queue) {
          if (!visited.has(entry.url) && entry.depth <= maxDepth) {
            queue.push(entry);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch failed";
      logs.push({
        level: "warn",
        message: "fetch error",
        data: { url: current.url, error: message }
      });
      notes.push(`Failed to fetch ${current.url}: ${message}`);
      if (current.depth === 0) {
        throw error;
      }
    }
  }

  const urls = Array.from(urlMap.values());

  const artifact: WebSurfaceArtifact = {
    target: targetUrl,
    timestamp: new Date().toISOString(),
    urls,
    forms: forms.length > 0 ? forms : undefined,
    links: links.length > 0 ? links : undefined,
    notes: notes.length > 0 ? notes : undefined,
    evidence: evidence.length > 0 ? evidence : undefined
  };

  return {
    logs,
    artifacts: [{ type: "web_surface.json", content_json: artifact }]
  };
};

function normalizeInt(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
}

function upsertUrl(map: Map<string, WebSurfaceUrl>, entry: WebSurfaceUrl): void {
  const existing = map.get(entry.url);
  if (!existing) {
    map.set(entry.url, entry);
    return;
  }
  map.set(entry.url, { ...existing, ...entry });
}

function parseHtml(html: string, baseUrl: string, origin: string, currentDepth: number): {
  links: WebSurfaceLink[];
  forms: WebSurfaceForm[];
  queue: QueueEntry[];
} {
  const links: WebSurfaceLink[] = [];
  const forms: WebSurfaceForm[] = [];
  const queue: QueueEntry[] = [];

  for (const href of extractAttribute(html, "a", "href")) {
    const normalized = normalizeUrl(href, baseUrl, origin);
    if (!normalized) {
      continue;
    }
    links.push({ url: normalized, source: "anchor" });
    queue.push({ url: normalized, depth: currentDepth + 1, source: "anchor" });
  }

  for (const src of extractAttribute(html, "script", "src")) {
    const normalized = normalizeUrl(src, baseUrl, origin);
    if (!normalized) {
      continue;
    }
    queue.push({ url: normalized, depth: currentDepth + 1, source: "script" });
  }

  for (const src of extractAttribute(html, "img", "src")) {
    const normalized = normalizeUrl(src, baseUrl, origin);
    if (!normalized) {
      continue;
    }
    queue.push({ url: normalized, depth: currentDepth + 1, source: "image" });
  }

  for (const form of extractForms(html, baseUrl, origin)) {
    forms.push(form);
    queue.push({ url: form.action, depth: currentDepth + 1, source: "form" });
  }

  return { links, forms, queue };
}

function extractAttribute(html: string, tag: string, attr: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*["']([^"']+)["']`, "gi");
  const values: string[] = [];
  let match = regex.exec(html);
  while (match) {
    values.push(match[1]);
    match = regex.exec(html);
  }
  return values;
}

function extractForms(html: string, baseUrl: string, origin: string): WebSurfaceForm[] {
  const forms: WebSurfaceForm[] = [];
  const formRegex = /<form\b[^>]*>/gi;
  let match = formRegex.exec(html);
  while (match) {
    const tag = match[0];
    const actionMatch = /action\s*=\s*["']([^"']+)["']/i.exec(tag);
    const methodMatch = /method\s*=\s*["']([^"']+)["']/i.exec(tag);
    const actionRaw = actionMatch?.[1] ?? "";
    const normalized = normalizeUrl(actionRaw, baseUrl, origin);
    if (normalized) {
      const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
      forms.push({ action: normalized, method });
    }
    match = formRegex.exec(html);
  }
  return forms;
}

function normalizeUrl(candidate: string, baseUrl: string, origin: string): string | null {
  if (!candidate || candidate.startsWith("#")) {
    return null;
  }
  if (candidate.startsWith("mailto:") || candidate.startsWith("javascript:")) {
    return null;
  }
  try {
    const url = new URL(candidate, baseUrl);
    if (url.origin !== origin) {
      return null;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function resolveEvidenceDir(ctx: { evidence_dir?: string; project_root: string; run_id?: string; step_id?: string }): string {
  if (ctx.evidence_dir) {
    return ctx.evidence_dir;
  }
  return path.resolve(
    ctx.project_root,
    "evidence",
    ctx.run_id ?? "run",
    ctx.step_id ?? "step"
  );
}

function toRelativePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  if (!relative || relative.startsWith("..")) {
    return filePath;
  }
  return relative.split(path.sep).join("/");
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
