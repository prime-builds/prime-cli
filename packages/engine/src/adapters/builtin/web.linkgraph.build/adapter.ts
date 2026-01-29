import fs from "fs";
import path from "path";
import type { AdapterExecution, AdapterLogEntry } from "../../../../../core/src/adapters";
import type { LinkGraphArtifact, WebSurfaceArtifact } from "../../../../../core/src/artifacts";

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  const webSurface = loadInput<WebSurfaceArtifact>(inputs, "web_surface.json", ctx);
  const maxEdges = normalizeInt(params.max_edges, 2000, 1);

  const nodes = new Map<string, { url: string }>();
  const edges: Array<{ from: string; to: string; source?: string }> = [];

  const urls = webSurface.urls ?? [];
  const links = webSurface.links ?? [];

  for (const entry of urls) {
    nodes.set(entry.url, { url: entry.url });
  }
  for (const entry of links) {
    nodes.set(entry.url, { url: entry.url });
  }

  const base = webSurface.target;
  for (const entry of urls) {
    if (edges.length >= maxEdges) {
      break;
    }
    if (entry.url !== base) {
      edges.push({ from: base, to: entry.url, source: entry.source });
    }
  }
  for (const entry of links) {
    if (edges.length >= maxEdges) {
      break;
    }
    if (entry.url !== base) {
      edges.push({ from: base, to: entry.url, source: entry.source });
    }
  }

  const artifact: LinkGraphArtifact = {
    target: webSurface.target,
    timestamp: new Date().toISOString(),
    nodes: [...nodes.values()],
    edges,
    stats: {
      node_count: nodes.size,
      edge_count: edges.length
    }
  };

  const logs: AdapterLogEntry[] = [
    {
      level: "info",
      message: "link graph build complete",
      data: { nodes: nodes.size, edges: edges.length }
    }
  ];

  return {
    logs,
    artifacts: [
      {
        type: "link_graph.json",
        content_json: artifact
      }
    ]
  };
};

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

function normalizeInt(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
}
