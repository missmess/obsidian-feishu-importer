export interface FeishuImporterSettings {
  baseUrl: string;
  userAccessToken: string;
  appId: string;
  appSecret: string;
  tenantAccessToken: string;
  oauthRedirectPort: string;
  oauthScope: string;
  oauthRefreshToken: string;
  oauthTokenExpiresAt: number;
  oauthRefreshTokenExpiresAt: number;
  oauthUserName: string;
  oauthUserOpenId: string;
  importFolder: string;
  assetsFolder: string;
  downloadAssets: boolean;
  lastImportedDocUrl: string;
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
  inlineCode?: boolean;
};

export interface FeishuTextRun {
  text: string;
  style?: FeishuTextStyle;
}

export type FeishuBlockType =
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "bullet"
  | "ordered"
  | "todo"
  | "quote"
  | "code";

export interface FeishuBlock {
  id: string;
  type: FeishuBlockType;
  text?: FeishuTextRun[];
  checked?: boolean;
  language?: string;
}

export interface ImportResult {
  filePath: string;
  markdown: string;
  document: FeishuDocumentMeta;
}
