import fs from "fs";
import path from "path";

export type AdapterScope = "builtin" | "local";

export type AdapterScaffoldOptions = {
  id: string;
  category: string;
  risk: string;
  scope?: AdapterScope;
  projectRoot?: string;
};

type Args = {
  id?: string;
  category?: string;
  risk?: string;
  scope?: AdapterScope;
  projectRoot?: string;
};

export function createAdapterScaffold(options: AdapterScaffoldOptions): {
  baseDir: string;
  scope: AdapterScope;
  projectRoot?: string;
} {
  const scope = options.scope ?? "local";
  const projectRoot =
    scope === "local" ? options.projectRoot ?? inferProjectRoot() : undefined;

  validateOptions(options, scope, projectRoot);

  const baseDir =
    scope === "builtin"
      ? path.resolve(
          process.cwd(),
          "packages",
          "engine",
          "src",
          "adapters",
          "builtin",
          options.id
        )
      : path.resolve(projectRoot ?? "", "local_adapters", options.id);

  if (fs.existsSync(baseDir)) {
    throw new Error(`Adapter already exists: ${baseDir}`);
  }

  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(path.join(baseDir, "__tests__"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "fixtures", "inputs"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "fixtures", "expected"), { recursive: true });

  const manifestFile = `import paramsSchema from "./params.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "${options.id}",
  name: "${titleFromId(options.id)}",
  description: "Describe what this adapter does.",
  category: "${options.category}",
  risk_default: "${options.risk}",
  version: "0.1.0",
  inputs: [],
  outputs: ["output.json"],
  params_schema: paramsSchema
};
`;

  const adapterFile = `import type { AdapterExecution } from "../../../../../core/src/adapters";

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  return {
    logs: [{ level: "info", message: "adapter stub executed" }],
    artifacts: [
      {
        type: "output.json",
        content_json: { params, inputs }
      }
    ]
  };
};
`;

  const parserFile = `export function parse(): void {
  // Optional parser stub for adapter-specific parsing needs.
}
`;

  const paramsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: []
  };

  const readme = `# ${titleFromId(options.id)}

Describe the adapter purpose, inputs, outputs, and example usage here.
`;

  const testFile = `import { test } from "node:test";
import path from "path";
import { runAdapterWithFixtures } from "../../../testing/harness";
import { FileSystemAdapterRegistry } from "../../../registry";
import { Logger } from "../../../../logger";

test("adapter fixtures", async () => {
  const registry = new FileSystemAdapterRegistry({
    builtinsDir: path.resolve(process.cwd(), "packages", "engine", "src", "adapters", "builtin"),
    logger: new Logger("error")
  });
  await runAdapterWithFixtures(registry, "${options.id}", process.cwd());
});
`;

  const fixturesParams = JSON.stringify({}, null, 2);
  const fixturesArtifacts = JSON.stringify([], null, 2);
  const fixturesExpected = JSON.stringify(
    [
      {
        type: "output.json",
        content_json: { params: {}, inputs: [] }
      }
    ],
    null,
    2
  );

  fs.writeFileSync(path.join(baseDir, "manifest.ts"), manifestFile, "utf8");
  fs.writeFileSync(path.join(baseDir, "adapter.ts"), adapterFile, "utf8");
  fs.writeFileSync(path.join(baseDir, "parser.ts"), parserFile, "utf8");
  fs.writeFileSync(
    path.join(baseDir, "params.schema.json"),
    JSON.stringify(paramsSchema, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(baseDir, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(baseDir, "__tests__", "adapter.test.ts"), testFile, "utf8");
  fs.writeFileSync(
    path.join(baseDir, "fixtures", "inputs", "params.json"),
    fixturesParams,
    "utf8"
  );
  fs.writeFileSync(
    path.join(baseDir, "fixtures", "inputs", "artifacts.json"),
    fixturesArtifacts,
    "utf8"
  );
  fs.writeFileSync(
    path.join(baseDir, "fixtures", "expected", "artifacts.json"),
    fixturesExpected,
    "utf8"
  );

  return { baseDir, scope, projectRoot };
}

const args = parseArgs(process.argv.slice(2));
if (require.main === module) {
  if (!args.id || !args.category || !args.risk) {
    printUsage();
    process.exit(1);
  }

  try {
    const result = createAdapterScaffold({
      id: args.id,
      category: args.category,
      risk: args.risk,
      scope: args.scope,
      projectRoot: args.projectRoot
    });
    printNextSteps(result.baseDir, args.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(message);
    process.exit(1);
  }
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--id") {
      parsed.id = argv[i + 1];
      i += 1;
    } else if (value === "--category") {
      parsed.category = argv[i + 1];
      i += 1;
    } else if (value === "--risk") {
      parsed.risk = argv[i + 1];
      i += 1;
    } else if (value === "--scope") {
      parsed.scope = argv[i + 1] as AdapterScope;
      i += 1;
    } else if (value === "--projectRoot") {
      parsed.projectRoot = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function validateOptions(
  options: AdapterScaffoldOptions,
  scope: AdapterScope,
  projectRoot?: string
): void {
  if (!options.id.includes(".")) {
    throw new Error("Adapter id must be namespaced with dots.");
  }
  if (!["passive", "active", "destructive"].includes(options.risk)) {
    throw new Error("Risk must be one of: passive, active, destructive.");
  }
  if (!["builtin", "local"].includes(scope)) {
    throw new Error("Scope must be one of: builtin, local.");
  }
  if (scope === "local" && !projectRoot) {
    throw new Error("projectRoot is required for local scope.");
  }
}

function inferProjectRoot(): string {
  return process.cwd();
}

function titleFromId(id: string): string {
  return id
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function printNextSteps(baseDir: string, adapterId: string): void {
  console.log(`Adapter scaffold created at ${baseDir}`);
  console.log("Next:");
  console.log(`- npm run adapters:check -- --id ${adapterId}`);
  console.log(`- npm run adapter:test -- --id ${adapterId}`);
}

function printUsage(): void {
  console.log(
    "Usage: npm run adapter:new -- --id <id> --category <category> --risk <risk> --scope <builtin|local> --projectRoot <path>"
  );
}
