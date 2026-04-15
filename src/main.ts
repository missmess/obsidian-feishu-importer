import { App, Modal, Notice, Plugin, Setting } from "obsidian";
import { DEFAULT_SETTINGS, FeishuImporterSettingTab } from "./settings";
import { importFeishuDocument, syncImportedDocuments } from "./importer";
import { clearOAuthSession, refreshOAuthToken, refreshOAuthTokenIfNeeded, startOAuthLogin } from "./oauth";
import type { FeishuImporterSettings } from "./types";

export default class FeishuImporterPlugin extends Plugin {
  settings!: FeishuImporterSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new FeishuImporterSettingTab(this.app, this));

    this.addCommand({
      id: "import-feishu-document",
      name: "Import Feishu document",
      callback: () => {
        new ImportFeishuDocModal(this.app, this, this.settings.lastImportedDocUrl).open();
      },
    });

    this.addCommand({
      id: "connect-feishu-account",
      name: "Connect Feishu account",
      callback: async () => {
        await this.connectWithOAuth();
      },
    });

    this.addCommand({
      id: "refresh-feishu-login",
      name: "Refresh Feishu login",
      callback: async () => {
        await this.refreshOAuthSession();
      },
    });

    this.addCommand({
      id: "disconnect-feishu-account",
      name: "Disconnect Feishu account",
      callback: async () => {
        await this.disconnectOAuth();
      },
    });

    this.addCommand({
      id: "sync-last-imported-document",
      name: "Sync last imported document incrementally",
      callback: async () => {
        if (!this.settings.lastImportedDocUrl) {
          new Notice("No previous Feishu document URL is stored yet.");
          return;
        }

        await this.runImport(this.settings.lastImportedDocUrl, { incremental: true });
      },
    });

    this.addCommand({
      id: "sync-all-imported-documents",
      name: "Sync all imported documents incrementally",
      callback: async () => {
        await this.syncAllImportedDocuments();
      },
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async runImport(documentUrl: string, options: { incremental?: boolean } = {}): Promise<void> {
    try {
      await refreshOAuthTokenIfNeeded(this.settings, () => this.saveSettings());
      const result = await importFeishuDocument(this.app, this.settings, documentUrl, options);
      this.settings.lastImportedDocUrl = documentUrl;
      await this.saveSettings();
      if (result.skipped) {
        new Notice(`No changes detected for ${result.document.title}.`);
        return;
      }
      new Notice(`Imported ${result.document.title} to ${result.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[feishu-importer] import failed", error);
      new Notice(`Feishu import failed: ${message}`);
    }
  }

  async syncAllImportedDocuments(): Promise<void> {
    if (Object.keys(this.settings.importedDocuments).length === 0) {
      new Notice("No imported Feishu documents are tracked yet.");
      return;
    }

    try {
      await refreshOAuthTokenIfNeeded(this.settings, () => this.saveSettings());
      const result = await syncImportedDocuments(this.app, this.settings);
      await this.saveSettings();
      const failureText = result.failed.length ? ` ${result.failed.length} failed.` : "";
      new Notice(`Feishu sync finished. ${result.updated} updated, ${result.skipped} unchanged.${failureText}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[feishu-importer] sync all failed", error);
      new Notice(`Feishu sync failed: ${message}`);
    }
  }

  async connectWithOAuth(): Promise<void> {
    try {
      await startOAuthLogin(this.settings, () => this.saveSettings());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[feishu-importer] oauth connect failed", error);
      new Notice(`Feishu login failed: ${message}`);
    }
  }

  async refreshOAuthSession(): Promise<void> {
    try {
      await refreshOAuthToken(this.settings, () => this.saveSettings());
      new Notice("Feishu login refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[feishu-importer] oauth refresh failed", error);
      new Notice(`Feishu refresh failed: ${message}`);
    }
  }

  async disconnectOAuth(): Promise<void> {
    await clearOAuthSession(this.settings, () => this.saveSettings());
    new Notice("Feishu login cleared.");
  }
}

class ImportFeishuDocModal extends Modal {
  private documentUrl: string;

  constructor(app: App, private readonly plugin: FeishuImporterPlugin, initialUrl = "") {
    super(app);
    this.documentUrl = initialUrl;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Import Feishu document" });

    new Setting(contentEl)
      .setName("Document URL")
      .setDesc("Paste a Feishu/Lark docx, docs, or wiki URL.")
      .addText((text) => {
        text.setPlaceholder("https://xxx.feishu.cn/docx/...").setValue(this.documentUrl).onChange((value) => {
          this.documentUrl = value.trim();
        });
        text.inputEl.style.width = "100%";
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Import").setCta().onClick(async () => {
          await this.plugin.runImport(this.documentUrl);
          this.close();
        });
      })
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.close());
      });
  }
}
