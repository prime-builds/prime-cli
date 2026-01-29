export type LogLevel = "debug" | "info" | "warn" | "error";

export interface EngineConfig {
  dbPath: string;
  artifactsDir: string;
  logLevel?: LogLevel;
  parserRepairMode?: "store_untrusted" | "off";
  plannerProvider?: {
    id: string;
    settings?: Record<string, unknown>;
    enableCritic?: boolean;
  };
}
