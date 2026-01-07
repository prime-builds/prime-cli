import fs from "fs";
import path from "path";
import { Logger } from "../logger";

export class PromptLoader {
  private readonly promptsDir: string;
  private readonly logger: Logger;
  private readonly cache = new Map<string, string>();

  constructor(promptsDir: string, logger: Logger) {
    this.promptsDir = promptsDir;
    this.logger = logger;
  }

  loadPrompt(fileName: string): string {
    if (this.cache.has(fileName)) {
      return this.cache.get(fileName) as string;
    }
    const fullPath = path.resolve(this.promptsDir, fileName);
    const contents = fs.readFileSync(fullPath, "utf8");
    this.cache.set(fileName, contents);
    this.logger.debug("Loaded prompt", { fileName });
    return contents;
  }

  loadPlannerPrompt(): string {
    return this.loadPrompt("planner-v0.md");
  }

  loadCriticPrompt(): string {
    return this.loadPrompt("critic-v0.md");
  }
}
