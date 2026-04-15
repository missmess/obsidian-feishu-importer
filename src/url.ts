const FEISHU_DOC_PATTERNS = [
  /\/docx\/([A-Za-z0-9]+)/,
  /\/docs\/([A-Za-z0-9]+)/,
  /\/wiki\/([A-Za-z0-9]+)/,
];
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function parseFeishuDocUrl(input: string): { token: string; normalizedUrl: string } {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Feishu document URL is required.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid Feishu document URL.");
  }

  const match = FEISHU_DOC_PATTERNS.map((pattern) => url.pathname.match(pattern)).find(Boolean);
  const token = match?.[1];

  if (!token) {
    throw new Error("Could not extract a Feishu document token from the URL.");
  }

  return {
    token,
    normalizedUrl: `${url.origin}${url.pathname}`,
  };
}

export function sanitizeNoteTitle(title: string): string {
  const trimmed = title.trim() || "Untitled Feishu Document";
  const sanitized = trimmed
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  const safeTitle = sanitized || "Untitled Feishu Document";
  return WINDOWS_RESERVED_NAMES.test(safeTitle) ? `${safeTitle}-` : safeTitle;
}
