import { test } from "node:test";
import path from "path";
import { FileSystemAdapterRegistry } from "../../../registry";
import { Logger } from "../../../../logger";
import { runAdapterWithFixtures } from "../../../testing/harness";

test("file.extract.json fixtures", async () => {
  const registry = new FileSystemAdapterRegistry({
    builtinsDir: path.resolve(process.cwd(), "packages", "engine", "src", "adapters", "builtin"),
    logger: new Logger("error")
  });
  await runAdapterWithFixtures(registry, "file.extract.json", path.join(process.cwd(), "packages", "engine", "src", "adapters", "builtin", "file.extract.json"));
});
