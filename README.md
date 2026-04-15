# Feishu Importer for Obsidian

Import Feishu or Lark cloud documents into your Obsidian vault as local Markdown, with browser OAuth login, incremental sync, and optional image and attachment downloads.

## Highlights

- Browser-based Feishu OAuth login with automatic token refresh
- Import a single Feishu or Lark document from a pasted URL
- Incremental sync for the last imported document or all tracked documents
- Optional download of images and file attachments into your vault
- Frontmatter with source URL, document token, revision ID, and import time
- Broader block support for headings, lists, quotes, callouts, code, images, files, embeds, sheets, bitables, dividers, and Markdown tables

## Installation

### Build from source

```bash
npm install
npm run build
```

Build output is written to:

- `dist/feishu-importer/main.js`
- `dist/feishu-importer/manifest.json`
- `dist/feishu-importer/versions.json`

Copy those files into your Obsidian plugin folder:

```text
<vault>/.obsidian/plugins/feishu-importer/
```

## Feishu App Setup

This plugin uses user OAuth, which is the right fit for a public community plugin because imports run with the signed-in user's permissions.

### 1. Create an app

Open the Feishu or Lark developer console:

- Feishu app console: [https://open.feishu.cn/app](https://open.feishu.cn/app)

### 2. Copy credentials

From the app's credentials page, copy:

- `App ID`
- `App Secret`

### 3. Add the redirect URI

In the plugin settings, click `Copy Redirect URI`, then paste it into:

```text
Feishu Open Platform -> Your App -> Security Settings -> Redirect URLs
```

Default value:

```text
http://127.0.0.1:27124/callback
```

### 4. Grant permissions

In the plugin settings, click `Copy Permission JSON`. Use it as a checklist for:

```text
Feishu Open Platform -> Your App -> Permissions & Scopes
```

Required scopes:

- `docx:document:readonly`
- `offline_access`

If you want local image and attachment download, you may also need the relevant drive/media read permission in your Feishu app, depending on your tenant policy.

If you hit a re-authorization error such as `99991679`, start here:

- Permission troubleshooting: [https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-resolve-error-99991679](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-resolve-error-99991679)

## Plugin Setup

Open `Settings -> Community plugins -> Feishu Importer` and configure:

- `Platform`: choose Feishu China or Lark Global
- `App ID`
- `App Secret`
- `Import folder`: where Markdown notes should be saved
- `Assets folder`: where downloaded images and attachments should be saved
- `Download images and attachments`: enable local asset sync

Then click `Connect` and complete the browser login.

## Commands

- `Feishu Importer: Import Feishu document`
- `Feishu Importer: Connect Feishu account`
- `Feishu Importer: Refresh Feishu login`
- `Feishu Importer: Disconnect Feishu account`
- `Feishu Importer: Sync last imported document incrementally`
- `Feishu Importer: Sync all imported documents incrementally`

## Usage

### Import a document

1. Run `Feishu Importer: Import Feishu document`
2. Paste a Feishu or Lark document URL
3. Confirm import

The plugin will:

- fetch the latest document revision
- convert supported blocks to Markdown
- optionally download images and attachments
- save the note into your configured import folder
- track the document for future incremental sync

### Incremental sync

Once a document has been imported, the plugin stores its latest revision ID.

- `Sync last imported document incrementally` rechecks only the most recent imported document
- `Sync all imported documents incrementally` rechecks every tracked document

If the remote revision has not changed, the plugin skips the rewrite.

## What Gets Imported

### Currently supported well

- Paragraphs
- Headings 1-9
- Bullet lists
- Ordered lists
- To-dos
- Quotes
- Code blocks
- Callouts
- Dividers
- Images
- File attachments
- Sheet and Bitable link cards
- Embed link cards

### Rendered as simplified placeholders

- Some nested or container-heavy structures
- Unknown or newly introduced Feishu block types

## Vault Output

Imported notes include frontmatter like:

```yaml
---
title: "Example Doc"
source: "https://example.feishu.cn/docx/..."
feishu_doc_token: "abc123"
feishu_revision_id: 42
imported_at: "2026-04-15T00:00:00.000Z"
---
```

When asset download is enabled:

- images are embedded as local Obsidian wiki embeds
- file attachments are linked as local vault files
- assets are grouped under `Assets folder/<Document Title>/`

## Known Limitations

- Asset download depends on the permissions granted to your Feishu app and user token
- Complex table cells with merged cells or rich nested layouts may be simplified
- Some advanced Feishu block types may still be simplified
- The plugin currently assumes a desktop environment for browser OAuth

## Development

```bash
npm install
npm run typecheck
node --test --import tsx tests/url.test.ts tests/markdown.test.ts tests/feishuClient.test.ts
npm run build
```

## Roadmap

### Near term

- Richer nested list handling
- More Feishu embed and smart block coverage
- Clearer permission diagnostics for asset download failures

### Mid term

- Better conflict handling when a local note was edited after import
- Bidirectional metadata for document tracking
- Selective sync UI for tracked documents
- Smarter naming and deduplication for downloaded assets

### Longer term

- Optional service-backed OAuth flow that removes the need to expose `App Secret` to the local plugin
- More complete export fidelity for complex blocks and collaborative content
- Optional publish workflow and release automation
