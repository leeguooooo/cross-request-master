import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import type { SourceDoc } from "../src/docs/source-doc";
import {
  buildPayloadMarkdownField,
  extractDocTitle,
  listSourceDocFiles,
  loadSourceDoc,
  renderSourceDocToHtml,
  resolveConflicts,
} from "../src/docs/source-doc";
import type { DocsSyncOptions } from "../src/cli/types";

describe("source-doc module", () => {
  test("bootstrap: SourceDoc type is exported", () => {
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: "", title: "" };
    assert.equal(doc.kind, "markdown");
  });
});

describe("extractDocTitle", () => {
  test("markdown: returns first H1", () => {
    assert.equal(extractDocTitle("markdown", "# Hello\n\nbody"), "Hello");
  });
  test("markdown: empty → empty string", () => {
    assert.equal(extractDocTitle("markdown", ""), "");
  });
  test("html: returns <title> when present", () => {
    const html = "<!doctype html><html><head><title>Doc Title</title></head><body><h1>Other</h1></body></html>";
    assert.equal(extractDocTitle("html", html), "Doc Title");
  });
  test("html: falls back to first <h1> when no <title>", () => {
    const html = "<body><h1>Heading</h1></body>";
    assert.equal(extractDocTitle("html", html), "Heading");
  });
  test("html: returns empty when no <title> and no <h1>", () => {
    assert.equal(extractDocTitle("html", "<body><p>no heading</p></body>"), "");
  });
  test("html: <h1> with nested tags is unwrapped", () => {
    assert.equal(extractDocTitle("html", "<h1><span>X</span> Y</h1>"), "X Y");
  });
  test("html: trims whitespace", () => {
    assert.equal(extractDocTitle("html", "<title>  Spaced  </title>"), "Spaced");
  });
});

describe("loadSourceDoc", () => {
  test("markdown file → kind=markdown", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-"));
    const abs = path.join(dir, "foo.md");
    writeFileSync(abs, "# Title\nbody", "utf8");
    const doc = loadSourceDoc(abs, "foo.md");
    assert.equal(doc.kind, "markdown");
    assert.equal(doc.relPath, "foo.md");
    assert.equal(doc.raw, "# Title\nbody");
    assert.equal(doc.title, "Title");
  });
  test("html file → kind=html", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-"));
    const abs = path.join(dir, "bar.html");
    writeFileSync(abs, "<title>HX</title><body>x</body>", "utf8");
    const doc = loadSourceDoc(abs, "bar.html");
    assert.equal(doc.kind, "html");
    assert.equal(doc.title, "HX");
    assert.equal(doc.raw, "<title>HX</title><body>x</body>");
  });
  test("unknown extension throws", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-"));
    const abs = path.join(dir, "baz.txt");
    writeFileSync(abs, "x", "utf8");
    assert.throws(() => loadSourceDoc(abs, "baz.txt"));
  });
});

describe("buildPayloadMarkdownField", () => {
  test("markdown doc → returns raw verbatim", () => {
    const doc: SourceDoc = { kind: "markdown", relPath: "a.md", raw: "# Hi\nbody", title: "Hi" };
    assert.equal(buildPayloadMarkdownField(doc), "# Hi\nbody");
  });
  test("html doc → banner + fenced source block", () => {
    const doc: SourceDoc = { kind: "html", relPath: "a.html", raw: "<p>hi</p>", title: "" };
    const out = buildPayloadMarkdownField(doc);
    assert.ok(out.includes("⚠️"));
    assert.ok(out.includes("此文档由 HTML 源生成"));
    assert.ok(out.includes("源文件：a.html"));
    assert.ok(out.includes("```html"));
    assert.ok(out.includes("<p>hi</p>"));
    assert.ok(out.endsWith("```"));
  });
  test("html doc with backticks in source switches to tilde fence", () => {
    const doc: SourceDoc = { kind: "html", relPath: "b.html", raw: "<pre>```inside```</pre>", title: "" };
    const out = buildPayloadMarkdownField(doc);
    assert.ok(out.includes("~~~html"), "should use ~~~ fence when raw contains ```");
    assert.ok(out.endsWith("~~~"), "closing fence should also be ~~~");
  });
});

describe("listSourceDocFiles", () => {
  test("collects .md and .html, excludes README.*", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "src-doc-list-"));
    writeFileSync(path.join(dir, "a.md"), "");
    writeFileSync(path.join(dir, "b.html"), "");
    writeFileSync(path.join(dir, "README.md"), "");
    writeFileSync(path.join(dir, "README.html"), "");
    writeFileSync(path.join(dir, "ignore.txt"), "");
    writeFileSync(path.join(dir, "ignore.htm"), "");
    const entries = listSourceDocFiles(dir).sort((x, y) => x.file.localeCompare(y.file));
    assert.deepEqual(entries, [
      { file: "a.md", kind: "markdown" },
      { file: "b.html", kind: "html" },
    ]);
  });
});

describe("resolveConflicts", () => {
  test("no conflict: returns all kept", () => {
    const r = resolveConflicts([
      { file: "a.md", kind: "markdown" },
      { file: "b.html", kind: "html" },
    ]);
    assert.equal(r.kept.length, 2);
    assert.deepEqual(r.dropped, []);
  });
  test("same stem .md + .html → keep html, drop md", () => {
    const r = resolveConflicts([
      { file: "foo.md", kind: "markdown" },
      { file: "foo.html", kind: "html" },
      { file: "bar.md", kind: "markdown" },
    ]);
    assert.deepEqual(r.kept.map((x) => x.file).sort(), ["bar.md", "foo.html"]);
    assert.deepEqual(r.dropped, ["foo.md"]);
  });
  test("multiple conflicts independent", () => {
    const r = resolveConflicts([
      { file: "a.md", kind: "markdown" },
      { file: "a.html", kind: "html" },
      { file: "b.md", kind: "markdown" },
      { file: "b.html", kind: "html" },
    ]);
    assert.equal(r.kept.length, 2);
    assert.deepEqual(r.dropped.sort(), ["a.md", "b.md"]);
    assert.ok(r.kept.every((x) => x.kind === "html"));
  });
});

describe("renderSourceDocToHtml", () => {
  test("html doc → returns raw verbatim, no diagnostics", () => {
    const doc: SourceDoc = { kind: "html", relPath: "x.html", raw: "<p>hi</p>", title: "" };
    const result = renderSourceDocToHtml(doc, {} as DocsSyncOptions, "[test]");
    assert.equal(result.html, "<p>hi</p>");
    assert.equal(result.mermaidFailed, false);
    assert.equal(result.diagramFailed, false);
    assert.deepEqual(result.diagramMetrics, []);
  });
  test("markdown doc → renders to HTML containing rendered content", () => {
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: "# Hello", title: "Hello" };
    const result = renderSourceDocToHtml(doc, {} as DocsSyncOptions, "[test]");
    assert.ok(result.html.includes("Hello"));
  });
});
