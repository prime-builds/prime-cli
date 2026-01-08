import { test } from "node:test";
import path from "path";
import { runAdapterWithFixtures } from "../../../testing/harness";
import { FileSystemAdapterRegistry } from "../../../registry";
import { Logger } from "../../../../logger";

test("adapter fixtures", async () => {
  const registry = new FileSystemAdapterRegistry({
    builtinsDir: path.resolve(process.cwd(), "packages", "engine", "src", "adapters", "builtin"),
    logger: new Logger("error")
  });
  await runAdapterWithFixtures(registry, "web.surface.discover.http", process.cwd());
});
