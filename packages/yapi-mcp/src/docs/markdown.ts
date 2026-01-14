import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import MarkdownIt from "markdown-it";

export type MarkdownRenderOptions = {
  noMermaid?: boolean;
  logMermaid?: boolean;
  logger?: (message: string) => void;
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

type MermaidRenderResult = {
  svg: string;
  normalized: boolean;
};

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

function renderMermaidToSvg(source: string): MermaidRenderResult {
  ensureMmdc();
  const normalized = normalizeMermaidLabels(source);
  const attempts: Array<{ text: string; normalized: boolean }> = [{ text: source, normalized: false }];
  if (normalized !== source) attempts.push({ text: normalized, normalized: true });
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return { svg: renderMermaidWithMmdc(attempt.text), normalized: attempt.normalized };
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
  const shouldLog = Boolean(options.logMermaid);
  const logger = options.logger || console.log;
  let index = 0;
  return markdown.replace(pattern, (match, content: string) => {
    index += 1;
    if (shouldLog) {
      logger(`已识别 Mermaid 块 #${index}，开始渲染...`);
    }
    try {
      const result = renderMermaidToSvg(String(content || "").trim());
      if (shouldLog) {
        if (result.normalized) {
          logger(`Mermaid 块 #${index} 渲染成功（已自动修正 label）。`);
        } else {
          logger(`Mermaid 块 #${index} 渲染成功。`);
        }
      }
      return `<div class="mermaid-diagram">\n${result.svg}\n</div>`;
    } catch {
      if (shouldLog) {
        logger(`Mermaid 块 #${index} 渲染失败，保持代码块原样。`);
      }
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
