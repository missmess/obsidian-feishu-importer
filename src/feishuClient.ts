import type { FeishuBlock, FeishuDocumentMeta } from "./types";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  throw?: boolean;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  json: unknown;
}

export type HttpRequester = (request: HttpRequest) => Promise<HttpResponse>;

interface FeishuApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

interface FeishuAuthResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

interface RawFeishuBlock {
  block_id: string;
  block_type: number;
  heading1?: { elements?: Array<{ text_run?: { content?: string } }> };
  heading2?: { elements?: Array<{ text_run?: { content?: string } }> };
  heading3?: { elements?: Array<{ text_run?: { content?: string } }> };
  text?: { elements?: Array<{ text_run?: { content?: string } }> };
  bullet?: { elements?: Array<{ text_run?: { content?: string } }> };
  ordered?: { elements?: Array<{ text_run?: { content?: string } }> };
  todo?: { elements?: Array<{ text_run?: { content?: string } }>; style?: { done?: boolean } };
  quote?: { elements?: Array<{ text_run?: { content?: string } }> };
  code?: { elements?: Array<{ text_run?: { content?: string } }>; language?: string };
}

export interface FeishuClientOptions {
  baseUrl: string;
  userAccessToken?: string;
  tenantAccessToken?: string;
  appId?: string;
  appSecret?: string;
  requester: HttpRequester;
}

export class FeishuClient {
  private cachedAccessToken: string | null;

  constructor(private readonly options: FeishuClientOptions) {
    this.cachedAccessToken = options.userAccessToken?.trim() || options.tenantAccessToken?.trim() || null;
  }

  async fetchDocumentMeta(documentToken: string): Promise<FeishuDocumentMeta> {
    const json = await this.get<{ document: { document_id: string; title: string; revision_id?: number } }>(
      `/open-apis/docx/v1/documents/${documentToken}`,
    );

    return {
      documentId: json.document.document_id,
      title: json.document.title,
      revisionId: json.document.revision_id,
    };
  }

  async fetchDocumentBlocks(documentToken: string): Promise<FeishuBlock[]> {
    const json = await this.get<{ items: RawFeishuBlock[] }>(`/open-apis/docx/v1/documents/${documentToken}/blocks?page_size=500`);
    return json.items.map(mapBlock).filter((block): block is FeishuBlock => block !== null);
  }

  private async get<T>(path: string): Promise<T> {
    const accessToken = await this.resolveAccessToken();
    const response = await this.options.requester({
      url: `${this.options.baseUrl}${path}`,
      method: "GET",
      throw: false,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const payload = response.json as FeishuApiResponse<T> | undefined;
    if (response.status >= 400) {
      const code = typeof payload?.code === "number" ? ` (code ${payload.code})` : "";
      const details = payload?.msg || response.text || `HTTP ${response.status}`;
      throw new Error(`Feishu API request failed for ${path}: ${details}${code}`);
    }

    if (!payload || payload.code !== 0) {
      const code = typeof payload?.code === "number" ? ` (code ${payload.code})` : "";
      throw new Error(`${payload?.msg || `Feishu API request failed for ${path}`}${code}`);
    }

    return payload.data;
  }

  private async resolveAccessToken(): Promise<string> {
    if (this.cachedAccessToken) {
      return this.cachedAccessToken;
    }

    const appId = this.options.appId?.trim();
    const appSecret = this.options.appSecret?.trim();
    if (!appId || !appSecret) {
      throw new Error("Missing authentication. Provide a user access token, a tenant access token, or both App ID and App Secret.");
    }

    const response = await this.options.requester({
      url: `${this.options.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      method: "POST",
      throw: false,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    });

    const payload = response.json as FeishuAuthResponse;
    if (response.status >= 400) {
      throw new Error(payload?.msg || response.text || `Failed to fetch tenant access token from Feishu (HTTP ${response.status}).`);
    }

    if (!payload || payload.code !== 0 || !payload.tenant_access_token) {
      throw new Error(payload?.msg || "Failed to fetch tenant access token from Feishu.");
    }

    this.cachedAccessToken = payload.tenant_access_token;
    return this.cachedAccessToken;
  }
}

function readText(elements?: Array<{ text_run?: { content?: string } }>): string {
  return (elements ?? []).map((element) => element.text_run?.content ?? "").join("");
}

function mapBlock(block: RawFeishuBlock): FeishuBlock | null {
  switch (block.block_type) {
    case 3:
      return { id: block.block_id, type: "heading1", text: [{ text: readText(block.heading1?.elements) }] };
    case 4:
      return { id: block.block_id, type: "heading2", text: [{ text: readText(block.heading2?.elements) }] };
    case 5:
      return { id: block.block_id, type: "heading3", text: [{ text: readText(block.heading3?.elements) }] };
    case 6:
      return { id: block.block_id, type: "bullet", text: [{ text: readText(block.bullet?.elements) }] };
    case 7:
      return { id: block.block_id, type: "ordered", text: [{ text: readText(block.ordered?.elements) }] };
    case 8:
      return {
        id: block.block_id,
        type: "todo",
        text: [{ text: readText(block.todo?.elements) }],
        checked: Boolean(block.todo?.style?.done),
      };
    case 9:
      return { id: block.block_id, type: "quote", text: [{ text: readText(block.quote?.elements) }] };
    case 10:
      return {
        id: block.block_id,
        type: "code",
        text: [{ text: readText(block.code?.elements) }],
        language: block.code?.language ?? "text",
      };
    case 2:
    default:
      return { id: block.block_id, type: "paragraph", text: [{ text: readText(block.text?.elements) }] };
  }
}
