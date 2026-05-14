import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SourceDoc } from "../src/docs/source-doc";

describe("source-doc module", () => {
  test("bootstrap: SourceDoc type is exported", () => {
    const doc: SourceDoc = { kind: "markdown", relPath: "x.md", raw: "", title: "" };
    assert.equal(doc.kind, "markdown");
  });
});
