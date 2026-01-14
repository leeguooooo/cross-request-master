import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import MarkdownIt from "markdown-it";

export type MarkdownRenderOptions = {
  noMermaid?: boolean;
};

let cachedPandocAvailable: boolean | null = null;
let cachedMmdcAvailable: boolean | null = null;
let cachedMarkdownIt: MarkdownIt | null = null;

export function isPandocAvailable(): boolean {
  if (cachedPandocAvailable !== null) return cachedPandocAvailable;
  try {
    execFileSync("pandoc", ["--version"], { stdio: "ignore" });
    cachedPandocAvailable = true;
  } catch {
    cachedPandocAvailable = false;
  }
  return cachedPandocAvailable;
}

export function isMmdcAvailable(): boolean {
  if (cachedMmdcAvailable !== null) return cachedMmdcAvailable;
  try {
    execFileSync("mmdc", ["--version"], { stdio: "ignore" });
    cachedMmdcAvailable = true;
  } catch {
    cachedMmdcAvailable = false;
  }
  return cachedMmdcAvailable;
}

export function ensurePandoc(): void {
  if (!isPandocAvailable()) {
    throw new Error("pandoc not found. Install pandoc first.");
  }
}

export function ensureMmdc(): void {
  if (!isMmdcAvailable()) {
    throw new Error("mmdc (mermaid-cli) not found. Install it to render Mermaid diagrams.");
  }
}

function stripSvgProlog(svg: string): string {
  return svg
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>\s*/i, "")
    .trim();
}

function renderMermaidWithMmdc(source: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yapi-docs-sync-"));
  const inputPath = path.join(tmpDir, "diagram.mmd");
  const outputPath = path.join(tmpDir, "diagram.svg");
  try {
    fs.writeFileSync(inputPath, source, "utf8");
    execFileSync("mmdc", ["-i", inputPath, "-o", outputPath, "-b", "transparent"], { stdio: "pipe" });
    const svg = fs.readFileSync(outputPath, "utf8");
    return stripSvgProlog(svg);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function normalizeMermaidLabels(source: string): string {
  return source.replace(/(?<!\[)\[([^\]\n]+)\](?!\])/g, (match, label: string) => {
    const trimmed = String(label || "").trim();
    if (!trimmed || !/[()]/.test(trimmed)) return match;
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return match;
    }
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) return match;
    const escaped = trimmed.replace(/"/g, '\\"');
    return `["${escaped}"]`;
  });
}

function renderMermaidToSvg(source: string): string {
  ensureMmdc();
  const attempts = [source];
  const normalized = normalizeMermaidLabels(source);
  if (normalized !== source) attempts.push(normalized);
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return renderMermaidWithMmdc(attempt);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Failed to render mermaid diagram.");
}

export function preprocessMarkdown(markdown: string, options: MarkdownRenderOptions = {}): string {
  if (options.noMermaid) return markdown;
  if (!isMmdcAvailable()) return markdown;
  const pattern = /```mermaid\s*\r?\n([\s\S]*?)\r?\n```/g;
  return markdown.replace(pattern, (match, content: string) => {
    try {
      const svg = renderMermaidToSvg(String(content || "").trim());
      return `<div class="mermaid-diagram">\n${svg}\n</div>`;
    } catch {
      return match;
    }
  });
}

export function markdownToHtml(markdown: string): string {
  if (isPandocAvailable()) {
    return execFileSync("pandoc", ["-f", "gfm+hard_line_breaks", "-t", "html"], {
      input: markdown,
      encoding: "utf8",
    });
  }
  if (!cachedMarkdownIt) {
    cachedMarkdownIt = new MarkdownIt({ html: true, linkify: true, breaks: true });
  }
  return cachedMarkdownIt.render(markdown);
}

export function renderMarkdownToHtml(markdown: string, options: MarkdownRenderOptions = {}): string {
  return markdownToHtml(preprocessMarkdown(markdown, options));
}
