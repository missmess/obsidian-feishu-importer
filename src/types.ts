export interface FeishuImporterSettings {
  baseUrl: string;
  userAccessToken: string;
  appId: string;
  appSecret: string;
  oauthRefreshToken: string;
  oauthTokenExpiresAt: number;
  oauthRefreshTokenExpiresAt: number;
  oauthUserName: string;
  oauthUserOpenId: string;
  importFolder: string;
  assetsFolder: string;
  downloadAssets: boolean;
  lastImportedDocUrl: string;
  importedDocuments: Record<string, ImportedDocumentRecord>;
}

export interface FeishuDocumentMeta {
  documentId: string;
  title: string;
  url?: string;
  revisionId?: number;
}

export type FeishuTextStyle = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  inlineCode?: boolean;
  href?: string;
};

export interface FeishuTextRun {
  text: string;
  style?: FeishuTextStyle;
}

export type FeishuBlockType =
  | "page"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "heading7"
  | "heading8"
  | "heading9"
  | "paragraph"
  | "bullet"
  | "ordered"
  | "todo"
  | "quote"
  | "quoteContainer"
  | "code"
  | "callout"
  | "divider"
  | "image"
  | "file"
  | "sheet"
  | "bitable"
  | "embed"
  | "table"
  | "tableCell"
  | "unsupported";

export type FeishuAssetType = "image" | "file";

export interface FeishuAsset {
  token?: string;
  type: FeishuAssetType;
  name?: string;
  caption?: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface FeishuBlockLink {
  title?: string;
  url?: string;
}

export interface FeishuBlock {
  id: string;
  type: FeishuBlockType;
  text?: FeishuTextRun[];
  checked?: boolean;
  language?: string;
  level?: number;
  asset?: FeishuAsset;
  link?: FeishuBlockLink;
  children?: FeishuBlock[];
  parentId?: string;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

export interface ImportResult {
  filePath: string;
  markdown: string;
  document: FeishuDocumentMeta;
  skipped?: boolean;
}

export interface ImportedDocumentRecord {
  token: string;
  url: string;
  filePath: string;
  title: string;
  revisionId?: number;
  lastImportedAt: string;
}

export interface SyncedAsset {
  token?: string;
  vaultPath: string;
  type: FeishuAssetType;
  name: string;
}

export interface DocumentAssetSyncResult {
  byToken: Record<string, SyncedAsset>;
  downloadedCount: number;
}
