import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import type { SourceDoc } from "../src/docs/source-doc";
import { extractDocTitle, loadSourceDoc } from "../src/docs/source-doc";

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
