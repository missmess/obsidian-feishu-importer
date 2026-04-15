import { Notice, requestUrl } from "obsidian";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import type { FeishuImporterSettings } from "./types";

const { shell } = require("electron") as { shell: { openExternal: (url: string) => Promise<void> } };

const DEFAULT_OAUTH_CALLBACK_PATH = "/callback";
export const DEFAULT_OAUTH_REDIRECT_PORT = 27124;
const OAUTH_TIMEOUT_MS = 2 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;
export const RECOMMENDED_OAUTH_SCOPES = [
  "docx:document:readonly",
  "docs:document.media:download",
  "contact:user.basic_profile:readonly",
  "offline_access",
];
export const RECOMMENDED_OAUTH_SCOPE = RECOMMENDED_OAUTH_SCOPES.join(" ");
export const FEISHU_APP_CONSOLE_URL = "https://open.feishu.cn/app";
export const FEISHU_PERMISSION_GUIDE_URL = "https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-resolve-error-99991679";

type OAuthTokenPayload = {
  access_token?: string;
  user_access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
};

type OAuthUserInfoPayload = {
  name?: string;
  open_id?: string;
};

export function buildRedirectUri(): string {
  return `http://127.0.0.1:${DEFAULT_OAUTH_REDIRECT_PORT}${DEFAULT_OAUTH_CALLBACK_PATH}`;
}

export const REQUIRED_PERMISSION_JSON = JSON.stringify(
  {
    scopes: {
      tenant: [],
      user: RECOMMENDED_OAUTH_SCOPES,
    },
  },
  null,
  2,
);

export function isOAuthBackedSession(settings: FeishuImporterSettings): boolean {
  return Boolean(settings.userAccessToken && settings.oauthRefreshToken);
}

export function describeOAuthStatus(settings: FeishuImporterSettings): string {
  if (settings.oauthUserName) {
    const expiresText = settings.oauthTokenExpiresAt ? new Date(settings.oauthTokenExpiresAt).toLocaleString() : "unknown";
    return `Connected as ${settings.oauthUserName}. Access token refreshes automatically. Current token expiry: ${expiresText}.`;
  }

  if (settings.userAccessToken) {
    return "A user access token is present. If you pasted it manually, automatic refresh is not available.";
  }

  return "Not connected. Fill App ID and App Secret, make sure the Feishu app redirect URI matches the callback below, then connect in browser.";
}

export async function startOAuthLogin(
  settings: FeishuImporterSettings,
  persistSettings: () => Promise<void>,
): Promise<void> {
  const appId = settings.appId.trim();
  const appSecret = settings.appSecret.trim();
  if (!appId || !appSecret) {
    throw new Error("OAuth login requires both App ID and App Secret.");
  }

  const state = randomUUID();
  const redirectUri = buildRedirectUri();
  const authUrl = buildAuthorizationUrl(settings, redirectUri, state);
  const code = await waitForAuthorizationCode(redirectUri, state, authUrl);
  const tokenPayload = await fetchOAuthToken(settings, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  await applyOAuthTokenPayload(settings, tokenPayload);
  await hydrateOAuthUserInfo(settings);
  await persistSettings();
  new Notice(`Connected Feishu account${settings.oauthUserName ? `: ${settings.oauthUserName}` : ""}`);
}

export async function refreshOAuthTokenIfNeeded(
  settings: FeishuImporterSettings,
  persistSettings: () => Promise<void>,
): Promise<void> {
  if (!settings.userAccessToken || !settings.oauthRefreshToken) {
    return;
  }

  const expiresAt = settings.oauthTokenExpiresAt || 0;
  if (expiresAt > Date.now() + REFRESH_SKEW_MS) {
    return;
  }

  await refreshOAuthToken(settings, persistSettings);
}

export async function refreshOAuthToken(
  settings: FeishuImporterSettings,
  persistSettings: () => Promise<void>,
): Promise<void> {
  const appId = settings.appId.trim();
  const appSecret = settings.appSecret.trim();
  const refreshToken = settings.oauthRefreshToken.trim();
  if (!appId || !appSecret || !refreshToken) {
    throw new Error("Refreshing Feishu OAuth requires App ID, App Secret, and a refresh token.");
  }

  const tokenPayload = await fetchOAuthToken(settings, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  await applyOAuthTokenPayload(settings, tokenPayload);
  await hydrateOAuthUserInfo(settings);
  await persistSettings();
}

export async function clearOAuthSession(
  settings: FeishuImporterSettings,
  persistSettings: () => Promise<void>,
): Promise<void> {
  settings.userAccessToken = "";
  settings.oauthRefreshToken = "";
  settings.oauthTokenExpiresAt = 0;
  settings.oauthRefreshTokenExpiresAt = 0;
  settings.oauthUserName = "";
  settings.oauthUserOpenId = "";
  await persistSettings();
}

async function waitForAuthorizationCode(redirectUri: string, expectedState: string, authUrl: string): Promise<string> {
  const url = new URL(redirectUri);
  const port = Number(url.port);
  const pathname = url.pathname;

  let server: Server | null = null;

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void closeServer(server);
      reject(new Error("Timed out waiting for the Feishu OAuth callback."));
    }, OAUTH_TIMEOUT_MS);

    server = createServer((req, res) => {
      const requestUrl = new URL(req.url || "/", redirectUri);
      if (requestUrl.pathname !== pathname) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error") || requestUrl.searchParams.get("error_description");
      if (error) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderCallbackPage("Feishu authorization failed", "You can close this tab and return to Obsidian."));
        clearTimeout(timeout);
        void closeServer(server);
        reject(new Error(`Feishu OAuth failed: ${error}`));
        return;
      }

      const state = requestUrl.searchParams.get("state");
      const codeParam = requestUrl.searchParams.get("code");
      if (!codeParam || state !== expectedState) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderCallbackPage("Invalid Feishu callback", "State verification failed. Please try connecting again."));
        clearTimeout(timeout);
        void closeServer(server);
        reject(new Error("Invalid Feishu OAuth callback. State verification failed."));
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderCallbackPage("Feishu account connected", "You can close this tab and return to Obsidian."));
      clearTimeout(timeout);
      void closeServer(server);
      resolve(codeParam);
    });

    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.listen(port, "127.0.0.1", async () => {
      try {
        await shell.openExternal(authUrl);
      } catch (error) {
        clearTimeout(timeout);
        void closeServer(server);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

  return code;
}

async function closeServer(server: Server | null): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
}

function renderCallbackPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; background: #f6f7f9; color: #18222d; }
      main { max-width: 560px; margin: 10vh auto; background: white; border-radius: 16px; padding: 28px; box-shadow: 0 12px 30px rgba(24,34,45,.08); }
      h1 { margin: 0 0 12px; font-size: 26px; }
      p { margin: 0; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAuthorizationUrl(settings: FeishuImporterSettings, redirectUri: string, state: string): string {
  const authUrl = new URL(getAuthorizationBaseUrl(settings.baseUrl));
  authUrl.searchParams.set("app_id", settings.appId.trim());
  authUrl.searchParams.set("client_id", settings.appId.trim());
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", RECOMMENDED_OAUTH_SCOPE);
  return authUrl.toString();
}

async function fetchOAuthToken(
  settings: FeishuImporterSettings,
  payload: Record<string, string>,
): Promise<OAuthTokenPayload> {
  const response = await requestUrl({
    url: `${settings.baseUrl}/open-apis/authen/v2/oauth/token`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: settings.appId.trim(),
      client_secret: settings.appSecret.trim(),
      ...payload,
    }),
  });

  const normalized = normalizeOAuthPayload(response.json);
  const accessToken = normalized.access_token || normalized.user_access_token;
  if (!accessToken) {
    throw new Error("Feishu OAuth did not return a user access token.");
  }

  return normalized;
}

async function hydrateOAuthUserInfo(settings: FeishuImporterSettings): Promise<void> {
  if (!settings.userAccessToken) {
    return;
  }

  try {
    const response = await requestUrl({
      url: `${settings.baseUrl}/open-apis/authen/v1/user_info`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${settings.userAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    const normalized = normalizeUserInfoPayload(response.json);
    settings.oauthUserName = normalized.name || settings.oauthUserName;
    settings.oauthUserOpenId = normalized.open_id || settings.oauthUserOpenId;
  } catch {
    // Leave user metadata empty if the user info endpoint is unavailable to this app.
  }
}

async function applyOAuthTokenPayload(settings: FeishuImporterSettings, payload: OAuthTokenPayload): Promise<void> {
  const accessToken = payload.access_token || payload.user_access_token;
  if (!accessToken) {
    throw new Error("Feishu OAuth did not return a usable access token.");
  }

  settings.userAccessToken = accessToken;
  settings.oauthRefreshToken = payload.refresh_token || settings.oauthRefreshToken;
  settings.oauthTokenExpiresAt = payload.expires_in ? Date.now() + payload.expires_in * 1000 : 0;
  settings.oauthRefreshTokenExpiresAt = payload.refresh_expires_in ? Date.now() + payload.refresh_expires_in * 1000 : 0;
}

function normalizeOAuthPayload(json: unknown): OAuthTokenPayload {
  const payload = unwrapPayload(json);
  if (payload.error) {
    throw new Error(String(payload.error_description || payload.error));
  }
  return payload;
}

function normalizeUserInfoPayload(json: unknown): OAuthUserInfoPayload {
  return unwrapPayload(json);
}

function unwrapPayload(json: unknown): Record<string, any> {
  if (!json || typeof json !== "object") {
    throw new Error("Feishu returned an invalid OAuth payload.");
  }

  const payload = json as Record<string, any>;
  if ("code" in payload && payload.code !== 0) {
    throw new Error(String(payload.msg || payload.message || "Feishu OAuth request failed."));
  }

  if ("data" in payload && payload.data && typeof payload.data === "object") {
    return payload.data as Record<string, any>;
  }

  return payload;
}

function getAuthorizationBaseUrl(baseUrl: string): string {
  if (baseUrl.includes("open.larksuite.com")) {
    return "https://accounts.larksuite.com/open-apis/authen/v1/index";
  }

  return "https://accounts.feishu.cn/open-apis/authen/v1/index";
}
