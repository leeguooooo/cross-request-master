import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import MarkdownIt from "markdown-it";

export type MarkdownRenderOptions = {
  noMermaid?: boolean;
  logMermaid?: boolean;
  logDiagrams?: boolean;
  mermaidLook?: "classic" | "handDrawn";
  mermaidHandDrawnSeed?: number;
  logger?: (message: string) => void;
  onMermaidError?: (error: unknown) => void;
};

let cachedPandocAvailable: boolean | null = null;
let cachedMmdcAvailable: boolean | null = null;
let cachedMmdcCommand: string | null = null;
let cachedMarkdownIt: MarkdownIt | null = null;
let cachedPlantUmlAvailable: boolean | null = null;
let cachedGraphvizAvailable: boolean | null = null;
let cachedD2Available: boolean | null = null;

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

function formatRenderError(error: unknown): string {
  if (!error || typeof error !== "object") return "未知错误";
  const err = error as { message?: string; stderr?: unknown; stdout?: unknown };
  const parts: string[] = [];
  if (err.message) {
    parts.push(stripAnsi(err.message).trim());
  }
  const extra = [err.stderr, err.stdout].find(
    (value) => typeof value === "string" || Buffer.isBuffer(value),
  );
  if (extra) {
    const text = stripAnsi(
      typeof extra === "string" ? extra : Buffer.from(extra as Buffer).toString("utf8"),
    );
    const line = text
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean);
    if (line && !parts.join(" ").includes(line)) {
      parts.push(line);
    }
  }
  const merged = parts.join(" | ").trim();
  if (!merged) return "未知错误";
  return merged.length > 300 ? `${merged.slice(0, 300)}...` : merged;
}

function resolveLocalBin(binName: string): string {
  const baseName = process.platform === "win32" ? `${binName}.cmd` : binName;
  const localBin = path.resolve(__dirname, "..", "..", "node_modules", ".bin", baseName);
  if (fs.existsSync(localBin)) return localBin;
  return binName;
}

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

function resolveMmdcCommand(): string {
  if (cachedMmdcCommand) return cachedMmdcCommand;
  const binName = process.platform === "win32" ? "mmdc.cmd" : "mmdc";
  const localBin = path.resolve(__dirname, "..", "..", "node_modules", ".bin", binName);
  if (fs.existsSync(localBin)) {
    cachedMmdcCommand = localBin;
    return cachedMmdcCommand;
  }
  cachedMmdcCommand = binName;
  return cachedMmdcCommand;
}

export function isMmdcAvailable(): boolean {
  if (cachedMmdcAvailable !== null) return cachedMmdcAvailable;
  try {
    execFileSync(resolveMmdcCommand(), ["--version"], { stdio: "ignore" });
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

export function isPlantUmlAvailable(): boolean {
  if (cachedPlantUmlAvailable !== null) return cachedPlantUmlAvailable;
  try {
    execFileSync(resolveLocalBin("plantuml"), ["-version"], { stdio: "ignore" });
    cachedPlantUmlAvailable = true;
  } catch {
    cachedPlantUmlAvailable = false;
  }
  return cachedPlantUmlAvailable;
}

export function isGraphvizAvailable(): boolean {
  if (cachedGraphvizAvailable !== null) return cachedGraphvizAvailable;
  try {
    execFileSync(resolveLocalBin("dot"), ["-V"], { stdio: "ignore" });
    cachedGraphvizAvailable = true;
  } catch {
    cachedGraphvizAvailable = false;
  }
  return cachedGraphvizAvailable;
}

export function isD2Available(): boolean {
  if (cachedD2Available !== null) return cachedD2Available;
  try {
    execFileSync(resolveLocalBin("d2"), ["--version"], { stdio: "ignore" });
    cachedD2Available = true;
  } catch {
    cachedD2Available = false;
  }
  return cachedD2Available;
}

function stripSvgProlog(svg: string): string {
  return svg
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>\s*/i, "")
    .trim();
}

function renderMermaidWithMmdc(source: string, config?: MermaidRenderConfig): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yapi-docs-sync-"));
  const inputPath = path.join(tmpDir, "diagram.mmd");
  const outputPath = path.join(tmpDir, "diagram.svg");
  try {
    fs.writeFileSync(inputPath, source, "utf8");
    const mmdcCommand = resolveMmdcCommand();
    const args = ["-i", inputPath, "-o", outputPath, "-b", "transparent"];
    if (config && (config.look || config.handDrawnSeed !== undefined)) {
      const configPath = path.join(tmpDir, "mermaid.config.json");
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      args.push("-c", configPath);
    }
    execFileSync(mmdcCommand, args, { stdio: "pipe" });
    const svg = fs.readFileSync(outputPath, "utf8");
    return stripSvgProlog(svg);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function ensurePlantUml(): void {
  if (!isPlantUmlAvailable()) {
    throw new Error("plantuml not found. Install it to render PlantUML diagrams.");
  }
}

function ensureGraphviz(): void {
  if (!isGraphvizAvailable()) {
    throw new Error("graphviz (dot) not found. Install it to render Graphviz diagrams.");
  }
}

function ensureD2(): void {
  if (!isD2Available()) {
    throw new Error("d2 not found. Install it to render D2 diagrams.");
  }
}

type MermaidRenderResult = {
  svg: string;
  normalized: boolean;
};

type MermaidRenderConfig = {
  look?: "classic" | "handDrawn";
  handDrawnSeed?: number;
};

type DiagramRenderer = {
  name: string;
  label: string;
  languages: string[];
  isAvailable: () => boolean;
  render: (source: string) => string;
};

function normalizeMermaidLabels(source: string): string {
  return source.replace(/(?<!\[)\[([^\]\n]+)\](?!\])/g, (_match, label: string) => {
    const trimmed = String(label || "").trim();
    if (!trimmed || !/[()]/.test(trimmed)) return _match;
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return _match;
    }
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) return _match;
    const escaped = trimmed.replace(/"/g, '\\"');
    return `["${escaped}"]`;
  });
}

function resolveMermaidConfig(options: MarkdownRenderOptions): MermaidRenderConfig | null {
  const config: MermaidRenderConfig = {};
  if (!options.mermaidLook && options.mermaidHandDrawnSeed === undefined) {
    config.look = "handDrawn";
  }
  if (options.mermaidLook) {
    config.look = options.mermaidLook;
  }
  if (Number.isFinite(options.mermaidHandDrawnSeed ?? NaN)) {
    config.handDrawnSeed = Number(options.mermaidHandDrawnSeed);
    if (!config.look) config.look = "handDrawn";
  }
  return config.look || config.handDrawnSeed !== undefined ? config : null;
}

function renderMermaidToSvg(
  source: string,
  config?: MermaidRenderConfig | null,
): MermaidRenderResult {
  ensureMmdc();
  const normalized = normalizeMermaidLabels(source);
  const attempts: Array<{ text: string; normalized: boolean }> = [
    { text: source, normalized: false },
  ];
  if (normalized !== source) attempts.push({ text: normalized, normalized: true });
  let lastError: unknown;
  let normalizedTried = false;
  for (const attempt of attempts) {
    try {
      return {
        svg: renderMermaidWithMmdc(attempt.text, config ?? undefined),
        normalized: attempt.normalized,
      };
    } catch (error) {
      if (attempt.normalized) normalizedTried = true;
      lastError = error;
    }
  }
  if (lastError instanceof Error) {
    const suffix = normalizedTried ? " (auto label normalization attempted)" : "";
    throw new Error(`${lastError.message}${suffix}`);
  }
  throw new Error(
    normalizedTried
      ? "Failed to render mermaid diagram after label normalization."
      : "Failed to render mermaid diagram.",
  );
}

function renderPlantUmlToSvg(source: string): string {
  ensurePlantUml();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yapi-docs-sync-"));
  const inputPath = path.join(tmpDir, "diagram.puml");
  const outputPath = path.join(tmpDir, "diagram.svg");
  try {
    fs.writeFileSync(inputPath, source, "utf8");
    execFileSync(resolveLocalBin("plantuml"), ["-tsvg", inputPath], { stdio: "pipe" });
    if (!fs.existsSync(outputPath)) {
      throw new Error("PlantUML output not found.");
    }
    const svg = fs.readFileSync(outputPath, "utf8");
    return stripSvgProlog(svg);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function renderGraphvizToSvg(source: string): string {
  ensureGraphviz();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yapi-docs-sync-"));
  const inputPath = path.join(tmpDir, "diagram.dot");
  const outputPath = path.join(tmpDir, "diagram.svg");
  try {
    fs.writeFileSync(inputPath, source, "utf8");
    execFileSync(resolveLocalBin("dot"), ["-Tsvg", inputPath, "-o", outputPath], {
      stdio: "pipe",
    });
    const svg = fs.readFileSync(outputPath, "utf8");
    return stripSvgProlog(svg);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function renderD2ToSvg(source: string): string {
  ensureD2();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yapi-docs-sync-"));
  const inputPath = path.join(tmpDir, "diagram.d2");
  const outputPath = path.join(tmpDir, "diagram.svg");
  try {
    fs.writeFileSync(inputPath, source, "utf8");
    execFileSync(resolveLocalBin("d2"), [inputPath, outputPath], { stdio: "pipe" });
    const svg = fs.readFileSync(outputPath, "utf8");
    return stripSvgProlog(svg);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function buildCodeBlockPattern(languages: string[]): RegExp {
  const escaped = languages.map((lang) => lang.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const fence = "```";
  return new RegExp(
    `${fence}\\s*(${escaped.join("|")})\\s*\\r?\\n([\\s\\S]*?)\\r?\\n${fence}`,
    "gi",
  );
}

function renderDiagramBlocks(
  markdown: string,
  renderer: DiagramRenderer,
  options: { shouldLog: boolean; logger: (message: string) => void },
): string {
  const pattern = buildCodeBlockPattern(renderer.languages);
  const available = renderer.isAvailable();
  let index = 0;
  let missingLogged = false;
  return markdown.replace(pattern, (match, _lang: string, content: string) => {
    index += 1;
    if (!match) return "";
    void _lang;
    const text = String(content || "").trim();
    if (!text) return "";
    if (!available) {
      if (options.shouldLog && !missingLogged) {
        options.logger(`${renderer.label} 未安装，相关图示将被跳过。`);
        missingLogged = true;
      }
      return "";
    }
    if (options.shouldLog) {
      options.logger(`已识别 ${renderer.label} 块 #${index}，开始渲染...`);
    }
    try {
      const svg = renderer.render(text);
      if (options.shouldLog) {
        options.logger(`${renderer.label} 块 #${index} 渲染成功。`);
      }
      return `<div class="${renderer.name}-diagram">\n${svg}\n</div>`;
    } catch (error) {
      if (options.shouldLog) {
        const message = formatRenderError(error);
        options.logger(`${renderer.label} 块 #${index} 渲染失败，已跳过。原因: ${message}`);
      }
      return "";
    }
  });
}

export function preprocessMarkdown(markdown: string, options: MarkdownRenderOptions = {}): string {
  let output = markdown;
  const shouldLogMermaid = Boolean(options.logMermaid);
  const shouldLogDiagrams = Boolean(options.logDiagrams ?? options.logMermaid);
  const logger = options.logger || console.log;
  const mermaidConfig = resolveMermaidConfig(options);

  if (!options.noMermaid && isMmdcAvailable()) {
    const pattern = /```mermaid\s*\r?\n([\s\S]*?)\r?\n```/g;
    let index = 0;
    output = output.replace(pattern, (_match, content: string) => {
      index += 1;
      if (shouldLogMermaid) {
        logger(`已识别 Mermaid 块 #${index}，开始渲染...`);
      }
      try {
        const result = renderMermaidToSvg(String(content || "").trim(), mermaidConfig);
        if (shouldLogMermaid) {
          if (result.normalized) {
            logger(`Mermaid 块 #${index} 渲染成功（已自动修正 label）。`);
          } else {
            logger(`Mermaid 块 #${index} 渲染成功。`);
          }
        }
        return `<div class="mermaid-diagram">\n${result.svg}\n</div>`;
      } catch (error) {
        if (shouldLogMermaid) {
          const message = formatRenderError(error);
          logger(`Mermaid 块 #${index} 渲染失败，保持代码块原样。原因: ${message}`);
        }
        if (options.onMermaidError) {
          options.onMermaidError(error);
        }
        return _match;
      }
    });
  }

  const renderers: DiagramRenderer[] = [
    {
      name: "plantuml",
      label: "PlantUML",
      languages: ["plantuml", "puml"],
      isAvailable: isPlantUmlAvailable,
      render: renderPlantUmlToSvg,
    },
    {
      name: "graphviz",
      label: "Graphviz",
      languages: ["dot", "graphviz"],
      isAvailable: isGraphvizAvailable,
      render: renderGraphvizToSvg,
    },
    {
      name: "d2",
      label: "D2",
      languages: ["d2"],
      isAvailable: isD2Available,
      render: renderD2ToSvg,
    },
  ];

  for (const renderer of renderers) {
    output = renderDiagramBlocks(output, renderer, { shouldLog: shouldLogDiagrams, logger });
  }

  return output;
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

export function renderMarkdownToHtml(
  markdown: string,
  options: MarkdownRenderOptions = {},
): string {
  return markdownToHtml(preprocessMarkdown(markdown, options));
}
