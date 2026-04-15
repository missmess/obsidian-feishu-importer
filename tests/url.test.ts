import test from "node:test";
import assert from "node:assert/strict";
import { parseFeishuDocUrl, sanitizeNoteTitle } from "../src/url";

test("parseFeishuDocUrl extracts token from docx URL", () => {
  const result = parseFeishuDocUrl("https://example.feishu.cn/docx/AbCdEf123?from=wiki");
  assert.equal(result.token, "AbCdEf123");
  assert.equal(result.normalizedUrl, "https://example.feishu.cn/docx/AbCdEf123");
});

test("parseFeishuDocUrl rejects unsupported URL", () => {
  assert.throws(() => parseFeishuDocUrl("https://example.feishu.cn/base/anything"), /extract a Feishu document token/);
});

test("sanitizeNoteTitle removes illegal filename characters", () => {
  assert.equal(sanitizeNoteTitle('Roadmap: Q3/Q4*Plan?'), 'Roadmap- Q3-Q4-Plan-');
});

test("sanitizeNoteTitle avoids Windows reserved filenames and trailing dots", () => {
  assert.equal(sanitizeNoteTitle("CON"), "CON-");
  assert.equal(sanitizeNoteTitle("report. "), "report");
  assert.equal(sanitizeNoteTitle("COM1.txt"), "COM1.txt-");
});
