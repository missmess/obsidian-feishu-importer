import test from "node:test";
import assert from "node:assert/strict";
import { blocksToMarkdown } from "../src/markdown";

test("blocksToMarkdown renders common Obsidian-friendly markdown", () => {
  const markdown = blocksToMarkdown([
    { id: "1", type: "heading1", text: [{ text: "Weekly Review" }] },
    { id: "2", type: "paragraph", text: [{ text: "Hello" }, { text: " world", style: { bold: true } }] },
    { id: "3", type: "todo", checked: true, text: [{ text: "Ship MVP" }] },
    { id: "4", type: "code", language: "ts", text: [{ text: 'console.log("hi")' }] },
  ]);

  assert.equal(
    markdown,
    '# Weekly Review\n\nHello** world**\n\n- [x] Ship MVP\n\n```ts\nconsole.log("hi")\n```',
  );
});
