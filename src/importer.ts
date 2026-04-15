import type { App } from "obsidian";
import { normalizePath, requestUrl } from "obsidian";
import { FeishuClient } from "./feishuClient";
import { blocksToMarkdown, collectAssetsFromBlocks } from "./markdown";
import { parseFeishuDocUrl, sanitizeNoteTitle } from "./url";
import type {
  DocumentAssetSyncResult,
  FeishuAsset,
  FeishuBlock,
  FeishuImporterSettings,
  ImportResult,
  ImportedDocumentRecord,
  SyncedAsset,
} from "./types";

export async function importFeishuDocument(
  app: App,
  settings: FeishuImporterSettings,
  documentUrl: string,
  options: { incremental?: boolean } = {},
): Promise<ImportResult> {
  const { token, normalizedUrl } = parseFeishuDocUrl(documentUrl);
  const client = new FeishuClient({
    baseUrl: settings.baseUrl,
    userAccessToken: settings.userAccessToken,
    requester: async (request) => {
      const response = await requestUrl(request);
      return {
        status: response.status,
        headers: response.headers,
        text: response.text,
        json: readResponseJson(response),
        arrayBuffer: response.arrayBuffer,
      };
    },
  });

  const document = await client.fetchDocumentMeta(token);
  const previous = settings.importedDocuments[token];
  if (options.incremental && previous?.revisionId !== undefined && previous.revisionId === document.revisionId) {
    return {
      filePath: previous.filePath,
      markdown: "",
      document: {
        ...document,
        url: normalizedUrl,
      },
      skipped: true,
    };
  }

  const blocks = await client.fetchDocumentBlocks(token);
  const assetResults = settings.downloadAssets
    ? await syncDocumentAssets(app, settings, client, document.title, blocks)
    : emptyAssetSyncResult();
  const markdownBody = blocksToMarkdown(blocks, assetResults.byToken);
  const markdown = buildMarkdown(document.title, normalizedUrl, token, document.revisionId, markdownBody);

  await ensureFolder(app, settings.importFolder);
  const fileName = `${sanitizeNoteTitle(document.title)}.md`;
  const filePath = normalizePath(`${settings.importFolder}/${fileName}`);
  await app.vault.adapter.write(filePath, markdown);

  settings.importedDocuments[token] = buildDocumentRecord(token, normalizedUrl, filePath, document.title, document.revisionId);

  return {
    filePath,
    markdown,
    document: {
      ...document,
      url: normalizedUrl,
    },
  };
}

function readResponseJson(response: { json: unknown }): unknown {
  try {
    return response.json;
  } catch {
    return undefined;
  }
}

export async function syncImportedDocuments(app: App, settings: FeishuImporterSettings): Promise<{
  updated: number;
  skipped: number;
  failed: Array<{ url: string; error: string }>;
}> {
  const records = Object.values(settings.importedDocuments);
  let updated = 0;
  let skipped = 0;
  const failed: Array<{ url: string; error: string }> = [];

  for (const record of records) {
    try {
      const result = await importFeishuDocument(app, settings, record.url, { incremental: true });
      if (result.skipped) {
        skipped += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      failed.push({
        url: record.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { updated, skipped, failed };
}

function buildDocumentRecord(token: string, url: string, filePath: string, title: string, revisionId?: number): ImportedDocumentRecord {
  return {
    token,
    url,
    filePath,
    title,
    revisionId,
    lastImportedAt: new Date().toISOString(),
  };
}

async function syncDocumentAssets(
  app: App,
  settings: FeishuImporterSettings,
  client: FeishuClient,
  documentTitle: string,
  blocks: FeishuBlock[],
): Promise<DocumentAssetSyncResult> {
  const assets = uniqueAssets(collectAssetsFromBlocks(blocks)).filter((asset) => asset.token);
  if (assets.length === 0) {
    return emptyAssetSyncResult();
  }

  const byToken: Record<string, SyncedAsset> = {};
  let downloadedCount = 0;

  const targetFolder = normalizePath(`${settings.assetsFolder}/${sanitizeNoteTitle(documentTitle)}`);
  await ensureFolder(app, targetFolder);

  for (const asset of assets) {
    const token = asset.token!;
    const media = await client.downloadMedia(token);
    const fileName = buildAssetFileName(asset, media.fileName, media.contentType, token);
    const vaultPath = normalizePath(`${targetFolder}/${fileName}`);

    if (!(await app.vault.adapter.exists(vaultPath))) {
      await app.vault.adapter.writeBinary(vaultPath, media.data);
      downloadedCount += 1;
    }

    byToken[token] = {
      token,
      type: asset.type,
      name: fileName,
      vaultPath,
    };
  }

  return { byToken, downloadedCount };
}

function uniqueAssets(assets: FeishuAsset[]): FeishuAsset[] {
  const seen = new Set<string>();
  const deduped: FeishuAsset[] = [];

  for (const asset of assets) {
    const key = asset.token || `${asset.type}:${asset.name || asset.url || ""}`;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(asset);
  }

  return deduped;
}

function buildAssetFileName(asset: FeishuAsset, downloadedName: string | undefined, contentType: string | undefined, token: string): string {
  const preferred = downloadedName || asset.name || `${asset.type}-${token}`;
  const sanitized = sanitizeNoteTitle(preferred);
  if (sanitized.includes(".")) {
    return sanitized;
  }

  const extension = inferExtension(asset, contentType);
  return extension ? `${sanitized}.${extension}` : sanitized;
}

function inferExtension(asset: FeishuAsset, contentType: string | undefined): string | undefined {
  if (asset.name?.includes(".")) {
    return asset.name.split(".").pop();
  }

  const mime = contentType || asset.mimeType || "";
  if (mime.includes("png")) {
    return "png";
  }
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return "jpg";
  }
  if (mime.includes("gif")) {
    return "gif";
  }
  if (mime.includes("webp")) {
    return "webp";
  }
  if (mime.includes("pdf")) {
    return "pdf";
  }
  if (mime.includes("zip")) {
    return "zip";
  }
  return asset.type === "image" ? "png" : undefined;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder);
  if (!normalized || normalized === ".") {
    return;
  }

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current);
    }
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

function emptyAssetSyncResult(): DocumentAssetSyncResult {
  return { byToken: {}, downloadedCount: 0 };
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}
