import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { syncDocsDir } from "../src/cli/commands/docs-sync";
import type { DocsSyncMapping, DocsSyncOptions, YapiRequest } from "../src/cli/types";

function makeMapping(): DocsSyncMapping {
  return {
    project_id: 1,
    catid: 2,
    files: {},
    file_hashes: {},
  } as DocsSyncMapping;
}

interface CapturedCall {
  url: string;
  payload?: any;
}

function makeMockRequest(captured: CapturedCall[]): YapiRequest {
  return (async (url: string, _method: string, _query?: any, payload?: any) => {
    captured.push({ url, payload });
    if (url === "/api/interface/list_cat") {
      return { errcode: 0, data: { list: [] } };
    }
    if (url === "/api/interface/add") {
      return { errcode: 0, data: { _id: 100 } };
    }
    if (url === "/api/interface/up") {
      return { errcode: 0 };
    }
    return { errcode: 0 };
  }) as unknown as YapiRequest;
}

describe("docs-sync HTML integration", () => {
  test("HTML source: payload.markdown is banner+fenced source, payload.desc is raw HTML", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-html-"));
    const htmlRaw = "<!doctype html><html><head><title>Hi</title></head><body><p>Hello</p></body></html>";
    writeFileSync(path.join(dir, "report.html"), htmlRaw, "utf8");

    const captured: CapturedCall[] = [];
    const mapping = makeMapping();
    mapping.files = { "report.html": 999 };
    const options = {} as DocsSyncOptions;

    await syncDocsDir(dir, mapping, options, makeMockRequest(captured));

    const upCall = captured.find((c) => c.url === "/api/interface/up");
    assert.ok(upCall, "expected interface/up to be called");
    assert.equal(upCall!.payload.id, 999);
    // desc 是 iframe srcdoc 包装，避免 HTML 全局样式污染 YApi 页面
    const desc = String(upCall!.payload.desc);
    assert.ok(desc.startsWith("<iframe "));
    assert.ok(desc.includes('sandbox="allow-same-origin"'));
    // srcdoc 里要含 attribute-encoded 的原始 HTML（& 和 " 已转义）
    const encoded = htmlRaw.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    assert.ok(desc.includes(encoded), `desc should contain encoded HTML; got: ${desc.slice(0, 200)}...`);
    // markdown 字段保留警告横幅 + 原始 HTML 源
    assert.ok(String(upCall!.payload.markdown).includes("⚠️"));
    assert.ok(String(upCall!.payload.markdown).includes("```html"));
    assert.ok(String(upCall!.payload.markdown).includes(htmlRaw));
  });

  test("markdown source: payload.markdown equals raw md (backward compat)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-md-"));
    const md = "# Title\n\nbody";
    writeFileSync(path.join(dir, "report.md"), md, "utf8");

    const captured: CapturedCall[] = [];
    const mapping = makeMapping();
    mapping.files = { "report.md": 888 };
    const options = {} as DocsSyncOptions;

    await syncDocsDir(dir, mapping, options, makeMockRequest(captured));

    const upCall = captured.find((c) => c.url === "/api/interface/up");
    assert.ok(upCall, "expected interface/up to be called");
    assert.equal(upCall!.payload.markdown, md);
  });

  test("conflict: foo.md + foo.html → only foo.html is pushed, warn emitted", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-conflict-"));
    writeFileSync(path.join(dir, "foo.md"), "# md version", "utf8");
    writeFileSync(path.join(dir, "foo.html"), "<title>html version</title>", "utf8");

    const captured: CapturedCall[] = [];
    const mapping = makeMapping();
    mapping.files = { "foo.html": 777 };
    const options = {} as DocsSyncOptions;

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: any) => warnings.push(String(msg));
    try {
      await syncDocsDir(dir, mapping, options, makeMockRequest(captured));
    } finally {
      console.warn = origWarn;
    }

    const upCalls = captured.filter((c) => c.url === "/api/interface/up");
    assert.equal(upCalls.length, 1, "exactly one push expected");
    assert.equal(upCalls[0].payload.id, 777);
    assert.ok(
      warnings.some((w) => w.includes("foo.md") && w.includes(".html")),
      `expected conflict warning, got: ${warnings.join(" | ")}`,
    );
  });
});
