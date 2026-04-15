import test from "node:test";
import assert from "node:assert/strict";
import { blocksToMarkdown, collectAssetsFromBlocks } from "../src/markdown";

test("blocksToMarkdown renders common Obsidian-friendly markdown", () => {
  const markdown = blocksToMarkdown([
    { id: "1", type: "heading1", text: [{ text: "Weekly Review" }] },
    { id: "2", type: "paragraph", text: [{ text: "Hello" }, { text: " world", style: { bold: true, href: "https://example.com" } }] },
    { id: "3", type: "todo", checked: true, text: [{ text: "Ship MVP" }] },
    { id: "4", type: "code", language: "ts", text: [{ text: 'console.log("hi")' }] },
    { id: "5", type: "image", asset: { type: "image", token: "img-1", name: "hero.png" } },
    { id: "6", type: "callout", text: [{ text: "Read me" }], children: [{ id: "7", type: "paragraph", text: [{ text: "Nested body" }] }] },
  ], {
    "img-1": {
      token: "img-1",
      type: "image",
      name: "hero.png",
      vaultPath: "Feishu/assets/Hero/hero.png",
    },
  });

  assert.equal(
    markdown,
    '# Weekly Review\n\nHello**[ world](https://example.com)**\n\n- [x] Ship MVP\n\n```ts\nconsole.log("hi")\n```\n\n![[Feishu/assets/Hero/hero.png]]\n\n> [!info]\n\n> Read me\n\n> Nested body',
  );
});

test("collectAssetsFromBlocks walks nested children", () => {
  const assets = collectAssetsFromBlocks([
    {
      id: "1",
      type: "callout",
      children: [
        { id: "2", type: "image", asset: { type: "image", token: "img-1" } },
        { id: "3", type: "file", asset: { type: "file", token: "file-1" } },
      ],
    },
  ]);

  assert.deepEqual(
    assets.map((asset) => asset.token),
    ["img-1", "file-1"],
  );
});

test("blocksToMarkdown renders callout blocks as grouped highlighted content", () => {
  const markdown = blocksToMarkdown([
    {
      id: "1",
      type: "callout",
      children: [
        { id: "2", type: "paragraph", text: [{ text: "实例地址：https://example.com" }] },
        { id: "3", type: "paragraph", text: [{ text: "账号：main" }] },
      ],
    },
  ]);

  assert.equal(markdown, "> [!info]\n\n> 实例地址：https://example.com\n\n> 账号：main");
});

test("blocksToMarkdown renders quote containers as markdown quotes", () => {
  const markdown = blocksToMarkdown([
    {
      id: "1",
      type: "quoteContainer",
      children: [
        { id: "2", type: "paragraph", text: [{ text: "引用里的第一行" }] },
        { id: "3", type: "paragraph", text: [{ text: "引用里的第二行" }] },
      ],
    },
  ]);

  assert.equal(markdown, "> 引用里的第一行\n\n> 引用里的第二行");
});

test("blocksToMarkdown renders table cells as markdown table", () => {
  const markdown = blocksToMarkdown([
    {
      id: "table-1",
      type: "table",
      metadata: { rows: 2, columns: 2 },
      children: [
        { id: "cell-1", type: "tableCell", metadata: { row: 0, column: 0 }, text: [{ text: "Name" }] },
        { id: "cell-2", type: "tableCell", metadata: { row: 0, column: 1 }, text: [{ text: "Status" }] },
        { id: "cell-3", type: "tableCell", metadata: { row: 1, column: 0 }, text: [{ text: "Importer" }] },
        { id: "cell-4", type: "tableCell", metadata: { row: 1, column: 1 }, children: [{ id: "p-1", type: "paragraph", text: [{ text: "Ready | verified" }] }] },
      ],
    },
  ]);

  assert.equal(markdown, "| Name | Status |\n| --- | --- |\n| Importer | Ready \\| verified |");
});
