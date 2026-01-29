import assert from "node:assert/strict";
import { execute } from "../adapter";
import { validateArtifactContent } from "../../../../../core/src/artifacts";

test("web.robots_sitemap.fetch emits schema-valid artifact", async () => {
  const result = await execute(
    { target_url: "http://127.0.0.1:9", timeout_sec: 1, follow_redirects: false },
    [],
    {
      project_root: process.cwd(),
      artifacts_dir: "./artifacts",
      evidence_dir: "./artifacts",
      run_id: "run-robots",
      step_id: "step-robots"
    }
  );

  const artifact = result.artifacts[0].content_json;
  const validation = validateArtifactContent("robots_sitemap.json", artifact);
  assert.ok(validation.ok, validation.errors.join("; "));
});
