export type LogLevel = "debug" | "info" | "warn" | "error";

export interface EngineConfig {
  dbPath: string;
  artifactsDir: string;
  logLevel?: LogLevel;
  plannerProvider?: {
    id: string;
    settings?: Record<string, unknown>;
    enableCritic?: boolean;
  };
}
