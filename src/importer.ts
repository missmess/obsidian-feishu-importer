import type { App } from "obsidian";
import { normalizePath, requestUrl } from "obsidian";
import { FeishuClient } from "./feishuClient";
import { blocksToMarkdown } from "./markdown";
import { parseFeishuDocUrl, sanitizeNoteTitle } from "./url";
import type { FeishuImporterSettings, ImportResult } from "./types";

export async function importFeishuDocument(app: App, settings: FeishuImporterSettings, documentUrl: string): Promise<ImportResult> {
  const { token, normalizedUrl } = parseFeishuDocUrl(documentUrl);
  const client = new FeishuClient({
    baseUrl: settings.baseUrl,
    userAccessToken: settings.userAccessToken,
    tenantAccessToken: settings.tenantAccessToken,
    appId: settings.appId,
    appSecret: settings.appSecret,
    requester: async (request) => requestUrl(request),
  });
  const document = await client.fetchDocumentMeta(token);
  const blocks = await client.fetchDocumentBlocks(token);
  const markdownBody = blocksToMarkdown(blocks);
  const markdown = buildMarkdown(document.title, normalizedUrl, token, document.revisionId, markdownBody);

  await ensureFolder(app, settings.importFolder);
  const fileName = `${sanitizeNoteTitle(document.title)}.md`;
  const filePath = normalizePath(`${settings.importFolder}/${fileName}`);
  await app.vault.adapter.write(filePath, markdown);

  return {
    filePath,
    markdown,
    document: {
      ...document,
      url: normalizedUrl,
    },
  };
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder);
  if (!normalized || normalized === ".") {
    return;
  }
  if (!(await app.vault.adapter.exists(normalized))) {
    await app.vault.createFolder(normalized);
  }
}

function buildMarkdown(title: string, sourceUrl: string, token: string, revisionId: number | undefined, body: string): string {
  const importedAt = new Date().toISOString();
  const frontmatter = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `source: "${sourceUrl}"`,
    `feishu_doc_token: "${token}"`,
    revisionId !== undefined ? `feishu_revision_id: ${revisionId}` : undefined,
    `imported_at: "${importedAt}"`,
    "---",
    "",
  ].filter(Boolean);

  return `${frontmatter.join("\n")}# ${title}\n\n${body}`.trimEnd() + "\n";
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}
