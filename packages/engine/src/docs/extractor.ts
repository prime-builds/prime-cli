import fs from "fs";
import path from "path";

export type ExtractedDoc = {
  text: string;
  title?: string;
  mime?: string;
};

export function extractText(filePath: string): ExtractedDoc {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".txt") {
    const text = fs.readFileSync(filePath, "utf8");
    return {
      text,
      title: extractMarkdownTitle(text),
      mime: ext === ".md" ? "text/markdown" : "text/plain"
    };
  }
  if (ext === ".html" || ext === ".htm") {
    const html = fs.readFileSync(filePath, "utf8");
    return {
      text: stripHtml(html),
      title: extractHtmlTitle(html),
      mime: "text/html"
    };
  }
  if (ext === ".json") {
    const text = fs.readFileSync(filePath, "utf8");
    try {
      const parsed = JSON.parse(text) as unknown;
      return {
        text: JSON.stringify(parsed, null, 2),
        mime: "application/json"
      };
    } catch {
      return { text, mime: "application/json" };
    }
  }
  throw new Error(`Unsupported file type: ${ext || "unknown"}`);
}

function extractMarkdownTitle(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#\s+(.*)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : undefined;
}

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|br|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  text = decodeEntities(text);
  return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
