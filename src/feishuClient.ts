import type { FeishuAsset, FeishuBlock, FeishuDocumentMeta, FeishuTextRun } from "./types";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  throw?: boolean;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
  arrayBuffer?: ArrayBuffer;
}

export type HttpRequester = (request: HttpRequest) => Promise<HttpResponse>;

interface FeishuApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

interface RawTextElement {
  text_run?: { content?: string; text_element_style?: RawTextStyle; link?: { url?: string } };
  mention_user?: { name?: string };
  mention_doc?: { title?: string; url?: string };
  mention_sheet?: { title?: string; url?: string };
  mention_bitable?: { title?: string; url?: string };
  mention_file?: { title?: string; url?: string };
  reminder?: { text?: string };
  equation?: { content?: string };
  docs_link?: { url?: string; title?: string };
  link?: { url?: string; title?: string };
  person?: { name?: string };
  emoji?: { text?: string; unicode?: string };
}

interface RawTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
}

interface RawFeishuBlock {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
  heading1?: { elements?: RawTextElement[] };
  heading2?: { elements?: RawTextElement[] };
  heading3?: { elements?: RawTextElement[] };
  heading4?: { elements?: RawTextElement[] };
  heading5?: { elements?: RawTextElement[] };
  heading6?: { elements?: RawTextElement[] };
  heading7?: { elements?: RawTextElement[] };
  heading8?: { elements?: RawTextElement[] };
  heading9?: { elements?: RawTextElement[] };
  text?: { elements?: RawTextElement[] };
  bullet?: { elements?: RawTextElement[] };
  ordered?: { elements?: RawTextElement[] };
  todo?: { elements?: RawTextElement[]; style?: { done?: boolean } };
  quote?: { elements?: RawTextElement[] };
  code?: { elements?: RawTextElement[]; language?: string };
  callout?: { elements?: RawTextElement[]; background_color?: number; emoji_id?: string };
  divider?: Record<string, never>;
  image?: Record<string, any>;
  file?: Record<string, any>;
  sheet?: Record<string, any>;
  bitable?: Record<string, any>;
  iframe?: Record<string, any>;
  table?: { cells?: string[]; row_size?: number; column_size?: number };
  table_cell?: { elements?: RawTextElement[] };
}

interface BlocksPage {
  items: RawFeishuBlock[];
  page_token?: string;
  has_more?: boolean;
}

interface DocumentMetaResponse {
  document: {
    document_id: string;
    title: string;
    revision_id?: number;
  };
}

export interface FeishuClientOptions {
  baseUrl: string;
  userAccessToken?: string;
  requester: HttpRequester;
}

export class FeishuClient {
  private readonly accessToken: string | null;

  constructor(private readonly options: FeishuClientOptions) {
    this.accessToken = options.userAccessToken?.trim() || null;
  }

  async fetchDocumentMeta(documentToken: string): Promise<FeishuDocumentMeta> {
    const json = await this.get<DocumentMetaResponse>(`/open-apis/docx/v1/documents/${documentToken}`);
    return {
      documentId: json.document.document_id,
      title: json.document.title,
      revisionId: json.document.revision_id,
    };
  }

  async fetchDocumentBlocks(documentToken: string): Promise<FeishuBlock[]> {
    const rawBlocks = await this.fetchAllBlocks(documentToken);
    return buildBlockTree(rawBlocks);
  }

  async downloadMedia(fileToken: string): Promise<{ data: ArrayBuffer; fileName?: string; contentType?: string }> {
    const response = await this.request({
      url: `${this.options.baseUrl}/open-apis/drive/v1/medias/${fileToken}/download`,
      method: "GET",
      throw: false,
      headers: {
        Authorization: `Bearer ${this.requireAccessToken()}`,
      },
    });

    if (response.status >= 400) {
      const message = enrichMediaDownloadError(extractErrorMessage(response) || `HTTP ${response.status}`, response);
      throw new Error(`Failed to download Feishu media ${fileToken}: ${message}`);
    }

    if (!response.arrayBuffer) {
      throw new Error(`Feishu media download returned no binary data for ${fileToken}.`);
    }

    return {
      data: response.arrayBuffer,
      fileName: extractFileName(response.headers["content-disposition"]),
      contentType: response.headers["content-type"],
    };
  }

  private async fetchAllBlocks(documentToken: string): Promise<RawFeishuBlock[]> {
    const blocks: RawFeishuBlock[] = [];
    let pageToken: string | undefined;

    do {
      const suffix = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "";
      const page = await this.get<BlocksPage>(`/open-apis/docx/v1/documents/${documentToken}/blocks?page_size=500${suffix}`);
      blocks.push(...(page.items ?? []));
      pageToken = page.has_more ? page.page_token : undefined;
    } while (pageToken);

    return blocks;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.request({
      url: `${this.options.baseUrl}${path}`,
      method: "GET",
      throw: false,
      headers: {
        Authorization: `Bearer ${this.requireAccessToken()}`,
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

  private requireAccessToken(): string {
    if (!this.accessToken) {
      throw new Error("Missing user access token. Connect your Feishu account again and retry.");
    }
    return this.accessToken;
  }

  private async request(request: HttpRequest): Promise<HttpResponse> {
    return this.options.requester(request);
  }
}

function buildBlockTree(rawBlocks: RawFeishuBlock[]): FeishuBlock[] {
  const mapped = rawBlocks.map(mapBlock);
  const byId = new Map<string, FeishuBlock>();
  const roots: FeishuBlock[] = [];

  for (const block of mapped) {
    byId.set(block.id, block);
  }

  annotateTableCells(mapped, byId);

  for (const block of mapped) {
    if (block.parentId && byId.has(block.parentId)) {
      const parent = byId.get(block.parentId)!;
      parent.children ??= [];
      parent.children.push(block);
    } else if (block.type !== "page") {
      roots.push(block);
    }
  }

  return roots;
}

function mapBlock(block: RawFeishuBlock): FeishuBlock {
  const base = { id: block.block_id, parentId: block.parent_id };

  if (block.heading1) {
    return { ...base, type: "heading1", level: 1, text: readText(block.heading1.elements) };
  }
  if (block.heading2) {
    return { ...base, type: "heading2", level: 2, text: readText(block.heading2.elements) };
  }
  if (block.heading3) {
    return { ...base, type: "heading3", level: 3, text: readText(block.heading3.elements) };
  }
  if (block.heading4) {
    return { ...base, type: "heading4", level: 4, text: readText(block.heading4.elements) };
  }
  if (block.heading5) {
    return { ...base, type: "heading5", level: 5, text: readText(block.heading5.elements) };
  }
  if (block.heading6) {
    return { ...base, type: "heading6", level: 6, text: readText(block.heading6.elements) };
  }
  if (block.heading7) {
    return { ...base, type: "heading7", level: 7, text: readText(block.heading7.elements) };
  }
  if (block.heading8) {
    return { ...base, type: "heading8", level: 8, text: readText(block.heading8.elements) };
  }
  if (block.heading9) {
    return { ...base, type: "heading9", level: 9, text: readText(block.heading9.elements) };
  }
  if (block.bullet) {
    return { ...base, type: "bullet", text: readText(block.bullet.elements) };
  }
  if (block.ordered) {
    return { ...base, type: "ordered", text: readText(block.ordered.elements) };
  }
  if (block.todo) {
    return { ...base, type: "todo", text: readText(block.todo.elements), checked: Boolean(block.todo.style?.done) };
  }
  if (block.quote) {
    return { ...base, type: block.children?.length ? "quoteContainer" : "quote", text: readText(block.quote.elements) };
  }
  if (block.code) {
    return { ...base, type: "code", text: readText(block.code.elements), language: block.code.language ?? "text" };
  }
  if (block.callout) {
    return {
      ...base,
      type: "callout",
      text: readText(block.callout.elements),
      metadata: { emoji: block.callout.emoji_id },
    };
  }
  if (block.divider) {
    return { ...base, type: "divider" };
  }
  if (block.image) {
    return {
      ...base,
      type: "image",
      asset: mapAsset("image", block.image),
      metadata: {
        width: numberOrUndefined(block.image.width),
        height: numberOrUndefined(block.image.height),
      },
    };
  }
  if (block.file) {
    return {
      ...base,
      type: "file",
      asset: mapAsset("file", block.file),
    };
  }
  if (block.sheet) {
    return {
      ...base,
      type: "sheet",
      link: mapLink(block.sheet),
      text: readText(block.sheet.elements),
    };
  }
  if (block.bitable) {
    return {
      ...base,
      type: "bitable",
      link: mapLink(block.bitable),
      text: readText(block.bitable.elements),
    };
  }
  if (block.iframe) {
    return {
      ...base,
      type: "embed",
      link: mapLink(block.iframe),
      metadata: { provider: asString(block.iframe?.component_type) },
    };
  }
  if (block.table) {
    return {
      ...base,
      type: "table",
      metadata: {
        rows: numberOrUndefined(block.table.row_size),
        columns: numberOrUndefined(block.table.column_size),
        cells: block.table.cells,
      },
    };
  }
  if (block.table_cell) {
    return { ...base, type: "tableCell", text: readText(block.table_cell.elements) };
  }
  if (block.text) {
    return { ...base, type: "paragraph", text: readText(block.text.elements) };
  }

  return { ...base, type: "unsupported" };
}

function annotateTableCells(blocks: FeishuBlock[], byId: Map<string, FeishuBlock>): void {
  for (const block of blocks) {
    if (block.type !== "table") {
      continue;
    }

    const cellIds = Array.isArray(block.metadata?.cells) ? block.metadata.cells : [];
    const columnCount = typeof block.metadata?.columns === "number" ? block.metadata.columns : undefined;
    if (!columnCount || cellIds.length === 0) {
      continue;
    }

    cellIds.forEach((cellId, index) => {
      const cell = byId.get(cellId);
      if (!cell) {
        return;
      }
      cell.metadata = {
        ...cell.metadata,
        row: Math.floor(index / columnCount),
        column: index % columnCount,
      };
    });
  }
}

function mapLink(input: Record<string, any> | undefined): FeishuBlock["link"] {
  if (!input) {
    return undefined;
  }

  return {
    title: firstString(input.title, input.name, input.display_name, input.obj_type),
    url: firstString(input.url, input.href),
  };
}

function mapAsset(type: FeishuAsset["type"], input: Record<string, any> | undefined): FeishuAsset | undefined {
  if (!input) {
    return undefined;
  }

  return {
    type,
    token: firstString(input.file_token, input.token, input.image_token, input.media_id),
    name: firstString(input.name, input.file_name, input.title),
    caption: firstString(input.caption?.plain_text, input.caption, input.alt),
    url: firstString(input.url, input.preview_url),
    mimeType: firstString(input.mime_type, input.type),
    width: numberOrUndefined(input.width),
    height: numberOrUndefined(input.height),
  };
}

function readText(elements?: RawTextElement[]): FeishuTextRun[] {
  return (elements ?? [])
    .map(readInline)
    .filter((run): run is FeishuTextRun => Boolean(run?.text));
}

function readInline(element: RawTextElement): FeishuTextRun | null {
  if (element.text_run) {
    return {
      text: element.text_run.content ?? "",
      style: {
        bold: Boolean(element.text_run.text_element_style?.bold),
        italic: Boolean(element.text_run.text_element_style?.italic),
        underline: Boolean(element.text_run.text_element_style?.underline),
        strikethrough: Boolean(element.text_run.text_element_style?.strikethrough),
        inlineCode: Boolean(element.text_run.text_element_style?.inline_code),
        href: element.text_run.link?.url,
      },
    };
  }
  if (element.docs_link) {
    return { text: element.docs_link.title || element.docs_link.url || "Link", style: { href: element.docs_link.url } };
  }
  if (element.link) {
    return { text: element.link.title || element.link.url || "Link", style: { href: element.link.url } };
  }
  if (element.mention_user) {
    return { text: `@${element.mention_user.name ?? "User"}` };
  }
  if (element.mention_doc || element.mention_sheet || element.mention_bitable || element.mention_file) {
    const mention = element.mention_doc || element.mention_sheet || element.mention_bitable || element.mention_file;
    return { text: mention?.title || mention?.url || "Mention", style: { href: mention?.url } };
  }
  if (element.person) {
    return { text: `@${element.person.name ?? "User"}` };
  }
  if (element.reminder) {
    return { text: element.reminder.text || "Reminder" };
  }
  if (element.equation) {
    return { text: `$${element.equation.content ?? ""}$` };
  }
  if (element.emoji) {
    return { text: element.emoji.unicode || element.emoji.text || "" };
  }

  return null;
}

function extractErrorMessage(response: HttpResponse): string | undefined {
  if (response.json && typeof response.json === "object" && "msg" in (response.json as Record<string, unknown>)) {
    return String((response.json as Record<string, unknown>).msg);
  }
  return response.text || undefined;
}

function enrichMediaDownloadError(message: string, response: HttpResponse): string {
  const payload = response.json as Record<string, unknown> | undefined;
  const code = typeof payload?.code === "number" ? payload.code : undefined;
  if (response.status === 403 || code === 99991679 || message.includes("permission") || message.includes("Unauthorized")) {
    return `${message}. Check that your Feishu app and OAuth token include the required Drive/Media read permission, then reconnect the account.`;
  }
  return message;
}

function extractFileName(contentDisposition: string | undefined): string | undefined {
  if (!contentDisposition) {
    return undefined;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const simpleMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return simpleMatch?.[1];
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
