export function serializeJson(value?: Record<string, unknown>): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export function parseJson(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
