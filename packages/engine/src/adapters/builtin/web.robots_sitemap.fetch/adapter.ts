import fs from "fs";
import path from "path";
import type { AdapterExecution, AdapterLogEntry } from "../../../../../core/src/adapters";
import type { RobotsSitemapArtifact } from "../../../../../core/src/artifacts";

export const execute: AdapterExecution["execute"] = async (params, _inputs, ctx) => {
  const targetUrl = String(params.target_url ?? "").trim();
  if (!targetUrl) {
    throw new Error("target_url is required");
  }
  const timeoutSec = normalizeInt(params.timeout_sec, 10, 1);
  const followRedirects = params.follow_redirects !== false;

  const origin = new URL(targetUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;
  const sitemapUrl = `${origin}/sitemap.xml`;

  const notes: string[] = [];
  const evidence: RobotsSitemapArtifact["evidence"] = [];
  const sitemapUrls = new Set<string>();
  const discoveredUrls = new Set<string>();

  const robotsText = await fetchText(robotsUrl, timeoutSec * 1000, followRedirects).catch(() => null);
  if (robotsText) {
    const evidencePath = writeEvidence("robots.txt", robotsText);
    evidence.push({
      kind: "robots_txt",
      path: toRelativePath(ctx.project_root, evidencePath),
      description: "robots.txt content"
    });
    parseRobots(robotsText, origin, sitemapUrls, discoveredUrls);
  } else {
    notes.push("robots.txt fetch failed");
  }

  const sitemapText = await fetchText(sitemapUrl, timeoutSec * 1000, followRedirects).catch(() => null);
  if (sitemapText) {
    const evidencePath = writeEvidence("sitemap.xml", sitemapText);
    evidence.push({
      kind: "sitemap_xml",
      path: toRelativePath(ctx.project_root, evidencePath),
      description: "sitemap.xml content"
    });
    sitemapUrls.add(sitemapUrl);
    parseSitemap(sitemapText, discoveredUrls);
  } else {
    notes.push("sitemap.xml fetch failed");
  }

  const artifact: RobotsSitemapArtifact = {
    target: targetUrl,
    timestamp: new Date().toISOString(),
    robots_url: robotsUrl,
    sitemap_urls: [...sitemapUrls],
    discovered_urls: [...discoveredUrls],
    notes: notes.length > 0 ? notes : undefined,
    evidence: evidence.length > 0 ? evidence : undefined
  };

  const logs: AdapterLogEntry[] = [
    {
      level: "info",
      message: "robots/sitemap fetch complete",
      data: { sitemaps: sitemapUrls.size, discovered: discoveredUrls.size }
    }
  ];

  return {
    logs,
    artifacts: [
      {
        type: "robots_sitemap.json",
        content_json: artifact
      }
    ]
  };

  function writeEvidence(fileName: string, content: string): string {
    const evidenceDir = ctx.evidence_dir ?? ctx.artifacts_dir;
    const targetDir = evidenceDir || process.cwd();
    fs.mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, fileName);
    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }
};

async function fetchText(url: string, timeoutMs: number, followRedirects: boolean): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: followRedirects ? "follow" : "manual", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRobots(text: string, origin: string, sitemaps: Set<string>, discovered: Set<string>): void {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [key, value] = trimmed.split(":", 2).map((part) => part.trim());
    if (!key || !value) {
      continue;
    }
    if (key.toLowerCase() === "sitemap") {
      sitemaps.add(value);
    }
    if (key.toLowerCase() === "disallow" || key.toLowerCase() === "allow") {
      if (value.startsWith("/")) {
        discovered.add(`${origin}${value}`);
      }
    }
  }
}

function parseSitemap(text: string, discovered: Set<string>): void {
  const matches = text.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of matches) {
    const url = match[1]?.trim();
    if (url) {
      discovered.add(url);
    }
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
