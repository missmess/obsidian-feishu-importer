import test from "node:test";
import assert from "node:assert/strict";
import { FeishuClient } from "../src/feishuClient";

function httpOk(json: unknown) {
  return {
    status: 200,
    headers: {},
    text: "",
    json,
  };
}

test("FeishuClient uses provided user access token directly", async () => {
  const requests: Array<{ url: string; method: string; headers?: Record<string, string> }> = [];
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async (request) => {
      requests.push(request);
      return httpOk({
        code: 0,
        msg: "ok",
        data: {
          document: {
            document_id: "doc-1",
            title: "Demo",
          },
        },
      });
    },
  });

  const meta = await client.fetchDocumentMeta("token-1");
  assert.equal(meta.title, "Demo");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.headers?.Authorization, "Bearer user-token");
});

test("FeishuClient paginates block fetches and builds a parent-child tree", async () => {
  const requests: string[] = [];
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async (request) => {
      requests.push(request.url);
      if (request.url.includes("page_token=next-page")) {
        return httpOk({
          code: 0,
          msg: "ok",
          data: {
            items: [
              {
                block_id: "child-1",
                parent_id: "callout-1",
                block_type: 2,
                text: { elements: [{ text_run: { content: "Nested text" } }] },
              },
            ],
            has_more: false,
          },
        });
      }

      return httpOk({
        code: 0,
        msg: "ok",
        data: {
          items: [
            {
              block_id: "callout-1",
              block_type: 19,
              children: ["child-1"],
              callout: { elements: [{ text_run: { content: "Heads up" } }] },
            },
          ],
          has_more: true,
          page_token: "next-page",
        },
      });
    },
  });

  const blocks = await client.fetchDocumentBlocks("token-2");
  assert.equal(requests.length, 2);
  assert.equal(blocks[0]?.type, "callout");
  assert.equal(blocks[0]?.children?.[0]?.type, "paragraph");
  assert.equal(blocks[0]?.children?.[0]?.text?.[0]?.text, "Nested text");
});

test("FeishuClient downloads media binary", async () => {
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async () => ({
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-disposition": `attachment; filename="demo.png"`,
      },
      text: "",
      json: {},
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    }),
  });

  const media = await client.downloadMedia("file-token");
  assert.equal(media.fileName, "demo.png");
  assert.equal(media.contentType, "image/png");
  assert.equal(new Uint8Array(media.data)[2], 3);
});

test("FeishuClient downloads media when response has no JSON payload", async () => {
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async () => ({
      status: 200,
      headers: {
        "content-type": "image/png",
      },
      text: "\uFFFDPNG",
      json: undefined,
      arrayBuffer: new Uint8Array([137, 80, 78, 71]).buffer,
    }),
  });

  const media = await client.downloadMedia("image-token");
  assert.equal(media.contentType, "image/png");
  assert.equal(new Uint8Array(media.data)[1], 80);
});


test("FeishuClient maps table cells with row and column metadata", async () => {
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async () => httpOk({
      code: 0,
      msg: "ok",
      data: {
        items: [
          {
            block_id: "table-1",
            block_type: 31,
            table: { row_size: 1, column_size: 2, cells: ["cell-1", "cell-2"] },
          },
          {
            block_id: "cell-1",
            parent_id: "table-1",
            block_type: 32,
            table_cell: { elements: [{ text_run: { content: "A" } }] },
          },
          {
            block_id: "cell-2",
            parent_id: "table-1",
            block_type: 32,
            table_cell: { elements: [{ text_run: { content: "B" } }] },
          },
        ],
        has_more: false,
      },
    }),
  });

  const blocks = await client.fetchDocumentBlocks("token-3");
  assert.equal(blocks[0]?.type, "table");
  assert.equal(blocks[0]?.children?.[0]?.metadata?.row, 0);
  assert.equal(blocks[0]?.children?.[1]?.metadata?.column, 1);
});

test("FeishuClient maps table cells from table property and child ids", async () => {
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async () => httpOk({
      code: 0,
      msg: "ok",
      data: {
        items: [
          {
            block_id: "table-1",
            block_type: 31,
            children: ["cell-1", "cell-2"],
            table: { property: { row_size: 1, column_size: 2 }, cells: ["cell-1", "cell-2"] },
          },
          {
            block_id: "cell-1",
            block_type: 32,
            table_cell: { elements: [{ text_run: { content: "Key" } }] },
          },
          {
            block_id: "cell-2",
            block_type: 32,
            table_cell: { elements: [{ text_run: { content: "Value" } }] },
          },
        ],
        has_more: false,
      },
    }),
  });

  const blocks = await client.fetchDocumentBlocks("token-4");
  assert.equal(blocks[0]?.type, "table");
  assert.equal(blocks[0]?.metadata?.rows, 1);
  assert.equal(blocks[0]?.metadata?.columns, 2);
  assert.equal(blocks[0]?.children?.[0]?.text?.[0]?.text, "Key");
  assert.equal(blocks[0]?.children?.[1]?.metadata?.column, 1);
});

test("FeishuClient maps quote_container blocks", async () => {
  const client = new FeishuClient({
    baseUrl: "https://open.feishu.cn",
    userAccessToken: "user-token",
    requester: async () => httpOk({
      code: 0,
      msg: "ok",
      data: {
        items: [
          {
            block_id: "quote-1",
            block_type: 34,
            children: ["text-1"],
            quote_container: { elements: [{ text_run: { content: "Quote intro" } }] },
          },
          {
            block_id: "text-1",
            block_type: 2,
            text: { elements: [{ text_run: { content: "Quoted body" } }] },
          },
        ],
        has_more: false,
      },
    }),
  });

  const blocks = await client.fetchDocumentBlocks("token-5");
  assert.equal(blocks[0]?.type, "quoteContainer");
  assert.equal(blocks[0]?.text?.[0]?.text, "Quote intro");
  assert.equal(blocks[0]?.children?.[0]?.type, "paragraph");
});
