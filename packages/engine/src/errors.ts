export class EngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class NotFoundError extends EngineError {
  constructor(message: string) {
    super("NOT_FOUND", message);
  }
}

export class ValidationError extends EngineError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class AdapterNotFoundError extends EngineError {
  constructor(adapterId: string) {
    super("ADAPTER_NOT_FOUND", `Adapter not found: ${adapterId}`);
  }
}

export class RunCanceledError extends EngineError {
  constructor() {
    super("RUN_CANCELED", "Run was canceled");
  }
}
