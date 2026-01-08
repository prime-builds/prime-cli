import path from "path";
import { Logger } from "../logger";
import { openDatabase } from "../storage/db";
import { createRepos } from "../storage";
import { DocsService } from "../docs";

type Command = "import" | "search";

type CommonArgs = {
  dbPath: string;
  projectId?: string;
};

type ImportArgs = CommonArgs & {
  files: string[];
  toolName?: string;
  category?: string;
};

type SearchArgs = CommonArgs & {
  query?: string;
  topK?: number;
  toolName?: string;
  category?: string;
};

const [command, ...rest] = process.argv.slice(2);

if (!command || (command !== "import" && command !== "search")) {
  printUsage();
  process.exit(1);
}

const args = parseArgs(rest);
const dbPath = args.dbPath;
const logger = new Logger("info");
const db = openDatabase(dbPath, logger);
const repos = createRepos(db);
const docs = new DocsService(repos, logger);

try {
  if (command === "import") {
    const importArgs = args as ImportArgs;
    if (!importArgs.projectId || importArgs.files.length === 0) {
      throw new Error("projectId and at least one file are required");
    }
    const result = docs.importDocs({
      project_id: importArgs.projectId,
      file_paths: importArgs.files,
      tags: {
        tool_name: importArgs.toolName,
        category: importArgs.category
      }
    });
    console.log(JSON.stringify(result, null, 2));
  }

  if (command === "search") {
    const searchArgs = args as SearchArgs;
    if (!searchArgs.projectId || !searchArgs.query) {
      throw new Error("projectId and query are required");
    }
    const result = docs.searchDocs({
      project_id: searchArgs.projectId,
      query: searchArgs.query,
      top_k: searchArgs.topK,
      filter: {
        tool_name: searchArgs.toolName,
        category: searchArgs.category
      }
    });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
} finally {
  db.close();
}

function parseArgs(argv: string[]): ImportArgs | SearchArgs {
  const parsed: ImportArgs & SearchArgs = {
    dbPath: resolveDbPath()
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--db") {
      parsed.dbPath = argv[i + 1];
      i += 1;
    } else if (value === "--project") {
      parsed.projectId = argv[i + 1];
      i += 1;
    } else if (value === "--file") {
      parsed.files = parsed.files ?? [];
      parsed.files.push(argv[i + 1]);
      i += 1;
    } else if (value === "--query") {
      parsed.query = argv[i + 1];
      i += 1;
    } else if (value === "--top") {
      const raw = argv[i + 1];
      parsed.topK = raw ? Number(raw) : undefined;
      i += 1;
    } else if (value === "--tool") {
      parsed.toolName = argv[i + 1];
      i += 1;
    } else if (value === "--category") {
      parsed.category = argv[i + 1];
      i += 1;
    }
  }
  parsed.files = parsed.files ?? [];
  return parsed;
}

function resolveDbPath(): string {
  return (
    process.env.PRIME_DB_PATH ?? path.resolve(process.cwd(), "prime-cli.db")
  );
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  npm run docs:import -- --project <id> --file <path> [--file <path>]");
  console.log("  npm run docs:search -- --project <id> --query <query>");
  console.log("Options:");
  console.log("  --db <path>        Override database path (default: PRIME_DB_PATH or ./prime-cli.db)");
  console.log("  --tool <name>      Tag imported docs with tool_name");
  console.log("  --category <name>  Tag imported docs with category");
  console.log("  --top <n>          Limit search results");
}
