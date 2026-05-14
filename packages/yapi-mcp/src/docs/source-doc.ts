// 源文档（.md / .html）抽象：把扫描、加载、标题抽取、渲染、payload markdown 字段
// 这几件事按文件类型分派，让 docs-sync.ts 主循环不再硬编码 markdown。
export type SourceDocKind = "markdown" | "html";

export interface SourceDoc {
  kind: SourceDocKind;
  relPath: string;
  raw: string;
  title: string;
}
