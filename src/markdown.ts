import type { FeishuAsset, FeishuBlock, FeishuTextRun, SyncedAsset } from "./types";

export function blocksToMarkdown(blocks: FeishuBlock[], downloadedAssets: Record<string, SyncedAsset> = {}): string {
  return blocks
    .flatMap((block) => renderBlock(block, downloadedAssets, 0))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function collectAssetsFromBlocks(blocks: FeishuBlock[]): FeishuAsset[] {
  const assets: FeishuAsset[] = [];
  for (const block of blocks) {
    if (block.asset) {
      assets.push(block.asset);
    }
    if (block.children?.length) {
      assets.push(...collectAssetsFromBlocks(block.children));
    }
  }
  return assets;
}

function renderBlock(block: FeishuBlock, downloadedAssets: Record<string, SyncedAsset>, depth: number): string[] {
  const text = renderText(block.text ?? []);
  const children = block.children?.flatMap((child) => renderBlock(child, downloadedAssets, depth + 1)) ?? [];

  switch (block.type) {
    case "heading1":
    case "heading2":
    case "heading3":
    case "heading4":
    case "heading5":
    case "heading6":
    case "heading7":
    case "heading8":
    case "heading9":
      return [`${"#".repeat(Math.min(block.level ?? 1, 6))} ${text}`];
    case "bullet":
      return [`${"  ".repeat(depth)}- ${text}`, ...children];
    case "ordered":
      return [`${"  ".repeat(depth)}1. ${text}`, ...children];
    case "todo":
      return [`${"  ".repeat(depth)}- [${block.checked ? "x" : " "}] ${text}`, ...children];
    case "quote":
      return [`> ${text}`];
    case "quoteContainer":
      return prefixLines(children.length ? children : [text], "> ");
    case "code":
      return [`\`\`\`${block.language ?? "text"}\n${text}\n\`\`\``];
    case "callout":
      return renderCallout(text, children);
    case "divider":
      return ["---"];
    case "image":
      return [renderImage(block, downloadedAssets)];
    case "file":
      return [renderAttachment(block, downloadedAssets)];
    case "sheet":
      return [renderLinkCard("Sheet", block)];
    case "bitable":
      return [renderLinkCard("Bitable", block)];
    case "embed":
      return [renderLinkCard("Embed", block)];
    case "table":
      return [renderTable(block, downloadedAssets)];
    case "tableCell":
      return [];
    case "paragraph":
      return text ? [text, ...children] : children;
    case "unsupported":
      return children;
    default:
      return text ? [text, ...children] : children;
  }
}

function renderCallout(text: string, children: string[]): string[] {
  const content = text ? [text, ...children] : children;
  return prefixLines(["[!info]", ...content], "> ");
}

function prefixLines(lines: string[], prefix: string): string[] {
  return lines.filter(Boolean).map((line) => `${prefix}${line}`);
}

function renderImage(block: FeishuBlock, downloadedAssets: Record<string, SyncedAsset>): string {
  const synced = block.asset?.token ? downloadedAssets[block.asset.token] : undefined;
  if (synced) {
    return `![[${synced.vaultPath}]]`;
  }

  if (block.asset?.url) {
    return `![${escapeLabel(block.asset.caption || block.asset.name || "Image")}](${block.asset.url})`;
  }

  return `![${escapeLabel(block.asset?.caption || block.asset?.name || "Image")}]()`;
}

function renderAttachment(block: FeishuBlock, downloadedAssets: Record<string, SyncedAsset>): string {
  const synced = block.asset?.token ? downloadedAssets[block.asset.token] : undefined;
  const label = block.asset?.name || block.asset?.caption || "Attachment";
  if (synced) {
    return `[[${synced.vaultPath}|${label}]]`;
  }
  if (block.asset?.url) {
    return `[${label}](${block.asset.url})`;
  }
  return `[${label}]`;
}

function renderLinkCard(kind: string, block: FeishuBlock): string {
  const label = block.link?.title || renderText(block.text ?? []) || kind;
  return block.link?.url ? `[${label}](${block.link.url})` : `> [!info] ${kind}: ${label}`;
}

function renderTable(block: FeishuBlock, downloadedAssets: Record<string, SyncedAsset>): string {
  const rows = typeof block.metadata?.rows === "number" ? block.metadata.rows : undefined;
  const columns = typeof block.metadata?.columns === "number" ? block.metadata.columns : undefined;
  const cells = block.children?.filter((child) => child.type === "tableCell") ?? [];

  if (!rows || !columns || cells.length === 0) {
    const suffix = rows || columns ? ` (${rows ?? "?"} x ${columns ?? "?"})` : "";
    return `> [!info] Table${suffix}`;
  }

  const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ""));
  for (const cell of cells) {
    const row = typeof cell.metadata?.row === "number" ? cell.metadata.row : undefined;
    const column = typeof cell.metadata?.column === "number" ? cell.metadata.column : undefined;
    if (row === undefined || column === undefined || row >= rows || column >= columns) {
      continue;
    }

    const childMarkdown = cell.children?.flatMap((child) => renderBlock(child, downloadedAssets, 0)).join("<br>") ?? "";
    const inlineText = renderText(cell.text ?? []);
    grid[row][column] = escapeTableCell(childMarkdown || inlineText);
  }

  const header = grid[0] ?? Array.from({ length: columns }, () => "");
  const body = grid.slice(1);
  const separator = Array.from({ length: columns }, () => "---");

  return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function renderText(runs: FeishuTextRun[]): string {
  return runs.map(renderInline).join("");
}

function renderInline(run: FeishuTextRun): string {
  let text = run.text;
  if (run.style?.href) {
    text = `[${text}](${run.style.href})`;
  }
  if (run.style?.inlineCode) {
    text = `\`${text}\``;
  }
  if (run.style?.bold) {
    text = `**${text}**`;
  }
  if (run.style?.italic) {
    text = `*${text}*`;
  }
  if (run.style?.underline) {
    text = `<u>${text}</u>`;
  }
  if (run.style?.strikethrough) {
    text = `~~${text}~~`;
  }
  return text;
}

function escapeLabel(value: string): string {
  return value.replace(/]/g, "\\]");
}

function escapeTableCell(value: string): string {
  return value.replace(/\n+/g, "<br>").replace(/\|/g, "\\|").trim();
}
