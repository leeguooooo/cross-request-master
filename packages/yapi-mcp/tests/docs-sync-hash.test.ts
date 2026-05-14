import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, test } from "node:test";
import { buildDocsSyncHash } from "../src/cli/utils";
import type { SourceDoc } from "../src/docs/source-doc";
import type { DocsSyncOptions } from "../src/cli/types";

// 旧版 hash 算法（升级前）：拷贝自原 buildDocsSyncHash 实现，作为兼容回归基准。
function legacyHash(markdown: string, options: DocsSyncOptions): string {
  const hash = crypto.createHash("sha1");
  hash.update(options.noMermaid ? "no-mermaid\n" : "mermaid\n");
  if (!options.noMermaid) {
    if (options.mermaidLook) hash.update(`mermaid-look:${options.mermaidLook}\n`);
    if (Number.isFinite(options.mermaidHandDrawnSeed ?? NaN)) {
      hash.update(`mermaid-seed:${options.mermaidHandDrawnSeed}\n`);
    }
  }
  hash.update(markdown);
  return hash.digest("hex");
}

const opts = {} as DocsSyncOptions;
const mermaidOpts = { mermaidLook: "handDrawn", mermaidHandDrawnSeed: 42 } as unknown as DocsSyncOptions;

describe("buildDocsSyncHash", () => {
  test("markdown kind: hash equals legacy hash byte-for-byte (default options)", () => {
    const md = "# Title\nbody";
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: md, title: "Title" };
    assert.equal(buildDocsSyncHash(doc, opts), legacyHash(md, opts));
  });
  test("markdown kind: hash equals legacy hash with mermaid options", () => {
    const md = "# T\n\n```mermaid\ngraph TD;A-->B;\n```\n";
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: md, title: "T" };
    assert.equal(buildDocsSyncHash(doc, mermaidOpts), legacyHash(md, mermaidOpts));
  });
  test("html kind: hash differs from same-raw markdown kind", () => {
    const raw = "<p>hi</p>";
    const mdDoc: SourceDoc = { kind: "markdown", relPath: "x.md", raw, title: "" };
    const htmlDoc: SourceDoc = { kind: "html", relPath: "x.html", raw, title: "" };
    assert.notEqual(buildDocsSyncHash(mdDoc, opts), buildDocsSyncHash(htmlDoc, opts));
  });
  test("html kind: hash deterministic", () => {
    const doc: SourceDoc = { kind: "html", relPath: "x.html", raw: "<p>hi</p>", title: "" };
    assert.equal(buildDocsSyncHash(doc, opts), buildDocsSyncHash(doc, opts));
  });
});
