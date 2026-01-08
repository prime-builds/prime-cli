import fs from "fs";
import path from "path";

type Args = {
  id?: string;
  category?: string;
  risk?: string;
};

const args = parseArgs(process.argv.slice(2));
if (!args.id || !args.category || !args.risk) {
  printUsage();
  process.exit(1);
}
if (!args.id.includes(".")) {
  console.error("Adapter id must be namespaced with dots.");
  process.exit(1);
}
if (!["passive", "active", "destructive"].includes(args.risk)) {
  console.error("Risk must be one of: passive, active, destructive.");
  process.exit(1);
}

const adapterId = args.id;
const baseDir = path.resolve(
  process.cwd(),
  "packages",
  "engine",
  "src",
  "adapters",
  "builtin",
  adapterId
);

if (fs.existsSync(baseDir)) {
  console.error(`Adapter already exists: ${baseDir}`);
  process.exit(1);
}

fs.mkdirSync(baseDir, { recursive: true });
fs.mkdirSync(path.join(baseDir, "__tests__"), { recursive: true });
fs.mkdirSync(path.join(baseDir, "fixtures", "inputs"), { recursive: true });
fs.mkdirSync(path.join(baseDir, "fixtures", "expected"), { recursive: true });

const manifestFile = `import paramsSchema from "./params.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "${adapterId}",
  name: "${titleFromId(adapterId)}",
  description: "Describe what this adapter does.",
  category: "${args.category}",
  risk_default: "${args.risk}",
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

const readme = `# ${titleFromId(adapterId)}

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
  await runAdapterWithFixtures(registry, "${adapterId}", process.cwd());
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
fs.writeFileSync(path.join(baseDir, "fixtures", "inputs", "params.json"), fixturesParams, "utf8");
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

console.log(`Adapter scaffold created at ${baseDir}`);

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
    }
  }
  return parsed;
}

function titleFromId(id: string): string {
  return id
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function printUsage(): void {
  console.log("Usage: npm run adapter:new -- --id <id> --category <category> --risk <risk>");
}
