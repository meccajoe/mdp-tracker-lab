import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const rendererPath = join(root, "src/components/ada-message-markdown.tsx");
const detailPath = join(root, "src/components/ada-workspace-detail.tsx");
const packagePath = join(root, "package.json");

test("Ada renders assistant Markdown through a safe dedicated renderer", () => {
  assert.ok(existsSync(rendererPath));
  const renderer = readFileSync(rendererPath, "utf8");
  const detail = readFileSync(detailPath, "utf8");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  assert.ok(pkg.dependencies["react-markdown"]);
  assert.ok(pkg.dependencies["remark-gfm"]);
  assert.match(renderer, /ReactMarkdown/);
  assert.match(renderer, /remarkGfm/);
  assert.match(renderer, /skipHtml/);
  assert.match(renderer, /allowedElements/);
  assert.match(renderer, /target="_blank"/);
  assert.match(renderer, /rel="noopener noreferrer"/);
  assert.match(detail, /AdaMessageMarkdown/);
  assert.match(detail, /message\.role === "assistant"/);
  assert.match(detail, /<AdaMessageMarkdown content=\{message\.content\}/);
});

test("user messages remain literal text rather than executable Markdown", () => {
  const detail = readFileSync(detailPath, "utf8");
  assert.match(detail, /message\.role === "user"[\s\S]*?<p className="whitespace-pre-wrap">\{message\.content\}<\/p>/);
});
