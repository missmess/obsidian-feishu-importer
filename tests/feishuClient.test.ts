import test from "node:test";
import assert from "node:assert/strict";
import { FeishuClient } from "../src/feishuClient";

test("FeishuClient uses provided user access token directly", async () => {
  const requests: Array<{ url: string; method: string; headers?: Record<string, string>; body?: string }> = [];
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async (request) => {
      requests.push(request);
      return {
        json: {
          code: 0,
          msg: "ok",
          data: {
            document: {
              document_id: "doc-1",
              title: "Demo",
            },
          },
        },
      };
    },
  });

  const meta = await client.fetchDocumentMeta("token-1");
  assert.equal(meta.title, "Demo");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.headers?.Authorization, "Bearer user-token");
});

test("FeishuClient prefers user access token over tenant access token", async () => {
  const requests: Array<{ headers?: Record<string, string> }> = [];
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    tenantAccessToken: "tenant-token",
    requester: async (request) => {
      requests.push(request);
      return {
        json: {
          code: 0,
          msg: "ok",
          data: {
            document: {
              document_id: "doc-1",
              title: "Demo",
            },
          },
        },
      };
    },
  });

  await client.fetchDocumentMeta("token-1");
  assert.equal(requests[0]?.headers?.Authorization, "Bearer user-token");
});

test("FeishuClient fetches tenant access token from appId and appSecret when needed", async () => {
  const requests: Array<{ url: string; method: string; headers?: Record<string, string>; body?: string }> = [];
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    requester: async (request) => {
      requests.push(request);
      if (request.url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
        return {
          json: {
            code: 0,
            msg: "ok",
            tenant_access_token: "generated-token",
            expire: 7200,
          },
        };
      }

      return {
        json: {
          code: 0,
          msg: "ok",
          data: {
            document: {
              document_id: "doc-2",
              title: "From app credentials",
            },
          },
        },
      };
    },
  });

  const meta = await client.fetchDocumentMeta("token-2");
  assert.equal(meta.title, "From app credentials");
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.url, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal");
  assert.match(requests[0]?.body ?? "", /cli_xxx/);
  assert.equal(requests[1]?.headers?.Authorization, "Bearer generated-token");
});

test("FeishuClient reuses fetched tenant access token for subsequent requests", async () => {
  let authCalls = 0;
  let docCalls = 0;
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    requester: async (request) => {
      if (request.url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
        authCalls += 1;
        return {
          json: {
            code: 0,
            msg: "ok",
            tenant_access_token: "generated-token",
            expire: 7200,
          },
        };
      }

      docCalls += 1;
      return {
        json: {
          code: 0,
          msg: "ok",
          data: {
            items: [],
          },
        },
      };
    },
  });

  await client.fetchDocumentBlocks("token-2");
  await client.fetchDocumentBlocks("token-2");
  assert.equal(authCalls, 1);
  assert.equal(docCalls, 2);
});
