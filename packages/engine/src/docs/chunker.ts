export type TextChunk = {
  text: string;
  start_offset: number;
  end_offset: number;
  ordinal: number;
};

export type ChunkOptions = {
  chunkSize: number;
  overlap: number;
};

const DEFAULT_CHUNK_SIZE = 2000;
const DEFAULT_OVERLAP = 200;

export function chunkText(
  input: string,
  options?: Partial<ChunkOptions>
): TextChunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(options?.overlap ?? DEFAULT_OVERLAP, chunkSize - 1);
  const text = normalizeText(input);

  if (!text) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let ordinal = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const splitIndex = findSplitIndex(window);
      if (splitIndex > Math.floor(chunkSize * 0.5)) {
        end = start + splitIndex;
      }
    }

    const raw = text.slice(start, end);
    const chunkText = raw.trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        start_offset: start,
        end_offset: end,
        ordinal
      });
      ordinal += 1;
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = end - overlap;
    if (nextStart <= start) {
      break;
    }
    start = nextStart;
  }

  return chunks;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function findSplitIndex(window: string): number {
  const doubleBreak = window.lastIndexOf("\n\n");
  if (doubleBreak >= 0) {
    return doubleBreak;
  }
  return window.lastIndexOf("\n");
}
