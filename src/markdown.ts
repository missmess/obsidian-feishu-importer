import type { FeishuBlock, FeishuTextRun } from "./types";

function renderInline(run: FeishuTextRun): string {
  let text = run.text;
  if (run.style?.inlineCode) {
    text = `\`${text}\``;
  }
  if (run.style?.bold) {
    text = `**${text}**`;
  }
  if (run.style?.italic) {
    text = `*${text}*`;
  }
  if (run.style?.strikethrough) {
    text = `~~${text}~~`;
  }
  return text;
}

function renderText(block: FeishuBlock): string {
  return (block.text ?? []).map(renderInline).join("");
}

export function blocksToMarkdown(blocks: FeishuBlock[]): string {
  return blocks
    .map((block) => {
      const text = renderText(block);
      switch (block.type) {
        case "heading1":
          return `# ${text}`;
        case "heading2":
          return `## ${text}`;
        case "heading3":
          return `### ${text}`;
        case "bullet":
          return `- ${text}`;
        case "ordered":
          return `1. ${text}`;
        case "todo":
          return `- [${block.checked ? "x" : " "}] ${text}`;
        case "quote":
          return `> ${text}`;
        case "code":
          return `\`\`\`${block.language ?? "text"}\n${text}\n\`\`\``;
        case "paragraph":
        default:
          return text;
      }
    })
    .join("\n\n")
    .trim();
}
