import assert from "node:assert/strict";
import { execute } from "../adapter";
import { validateArtifactContent } from "../../../../../core/src/artifacts";

test("web.linkgraph.build emits schema-valid artifact", async () => {
  const webSurface = {
    target: "https://example.com",
    timestamp: "2025-01-01T00:00:00Z",
    urls: [
      { url: "https://example.com/", source: "seed" },
      { url: "https://example.com/about", source: "anchor" }
    ],
    links: [{ url: "https://example.com/contact", source: "anchor" }]
  };

  const result = await execute(
    { max_edges: 10 },
    [{ type: "web_surface.json", content_json: webSurface }],
    { project_root: process.cwd(), artifacts_dir: "./artifacts" }
  );

  const artifact = result.artifacts[0].content_json;
  const validation = validateArtifactContent("link_graph.json", artifact);
  assert.ok(validation.ok, validation.errors.join("; "));
});
