# Feishu Importer for Obsidian

MVP plugin skeleton that imports a Feishu/Lark cloud document into an Obsidian vault folder.

## Recommended auth mode

For a public Obsidian community plugin, the safest default is user-scoped auth:

- connect in browser and let the plugin store a refreshable `User Access Token`
- use `Tenant Access Token` only for advanced enterprise setups
- use `App ID + App Secret` without browser login only as a legacy fallback for self-built internal apps

This avoids shipping one enterprise app credential flow as the default for every user while still supporting enterprise installs.

## Browser OAuth setup

1. Create or open your Feishu or Lark app in the developer console.
2. Enable user authorization for the app and grant the document read permissions your importer needs.
3. Add the plugin callback URL as a redirect URI.
   Default callback: `http://127.0.0.1:27124/callback`
4. Paste the app's `App ID` and `App Secret` into the plugin settings.
5. Run `Feishu Importer: Connect Feishu account` or click `Connect` in settings.
6. Complete the browser login and return to Obsidian.

After that, the plugin will refresh the stored user token automatically before imports whenever a refresh token is available.

## MVP scope

- Configure Feishu base URL, OAuth credentials, and target vault folder
- Paste a Feishu doc URL into a command modal
- Fetch metadata + block content from Feishu Docx APIs
- Convert a subset of block types to Markdown
- Save the note to the local vault with source metadata frontmatter

## Commands

- `Feishu Importer: Import Feishu document`
- `Feishu Importer: Connect Feishu account`
- `Feishu Importer: Refresh Feishu login`
- `Feishu Importer: Disconnect Feishu account`
- `Feishu Importer: Sync last imported document`

## Notes

- The plugin now supports four auth paths, in this order:
  - browser OAuth login with auto-refreshing user token
  - paste a user access token directly
  - paste a tenant access token directly
  - leave both token fields blank and let the plugin fetch a tenant token from App ID + App Secret
- This is still a skeleton, not a full production sync engine.
- Current block conversion handles headings, paragraphs, bullets, numbered lists, to-dos, quotes, and code blocks.
