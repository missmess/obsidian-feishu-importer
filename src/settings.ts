import { PluginSettingTab, App, Setting } from "obsidian";
import type FeishuImporterPlugin from "./main";
import type { FeishuImporterSettings } from "./types";
import { buildRedirectUri, describeOAuthStatus, getEffectiveOAuthScope, isOAuthBackedSession, RECOMMENDED_OAUTH_SCOPE } from "./oauth";

export const DEFAULT_SETTINGS: FeishuImporterSettings = {
  baseUrl: "https://open.feishu.cn",
  userAccessToken: "",
  appId: "",
  appSecret: "",
  tenantAccessToken: "",
  oauthRedirectPort: "27124",
  oauthScope: RECOMMENDED_OAUTH_SCOPE,
  oauthRefreshToken: "",
  oauthTokenExpiresAt: 0,
  oauthRefreshTokenExpiresAt: 0,
  oauthUserName: "",
  oauthUserOpenId: "",
  importFolder: "Feishu",
  assetsFolder: "Feishu/assets",
  downloadAssets: false,
  lastImportedDocUrl: "",
};

export class FeishuImporterSettingTab extends PluginSettingTab {
  plugin: FeishuImporterPlugin;

  constructor(app: App, plugin: FeishuImporterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const callbackDescription = this.getCallbackDescription();
    containerEl.empty();
    containerEl.createEl("h2", { text: "Feishu Importer settings" });

    this.addTextSetting(
      "Feishu Open Platform base URL",
      "Use open.feishu.cn for Feishu or open.larksuite.com for Lark.",
      this.plugin.settings.baseUrl,
      async (value) => {
        this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
        await this.plugin.saveSettings();
      },
    );

    this.addTextSetting(
      "User Access Token",
      "Optional manual override. Browser login will populate this automatically; manually pasted tokens will not auto-refresh.",
      this.plugin.settings.userAccessToken,
      async (value) => {
        this.plugin.settings.userAccessToken = value.trim();
        await this.plugin.saveSettings();
      },
      true,
    );

    this.addTextSetting("App ID", "Required for browser OAuth login and token refresh.", this.plugin.settings.appId, async (value) => {
      this.plugin.settings.appId = value.trim();
      await this.plugin.saveSettings();
    });

    this.addTextSetting("App Secret", "Required for browser OAuth login, refresh token exchange, and legacy tenant token fallback.", this.plugin.settings.appSecret, async (value) => {
      this.plugin.settings.appSecret = value.trim();
      await this.plugin.saveSettings();
    }, true);

    this.addTextSetting("OAuth Redirect Port", "Register this callback in your Feishu app, for example http://127.0.0.1:27124/callback.", this.plugin.settings.oauthRedirectPort, async (value) => {
      this.plugin.settings.oauthRedirectPort = value.trim() || DEFAULT_SETTINGS.oauthRedirectPort;
      await this.plugin.saveSettings();
    });

    this.addTextSetting("OAuth Scope", "Requested during browser login. Leave blank to use the recommended default for doc import.", this.plugin.settings.oauthScope, async (value) => {
      this.plugin.settings.oauthScope = value.trim();
      await this.plugin.saveSettings();
    });

    this.addTextSetting("Tenant Access Token", "Advanced or legacy option for enterprise app-based setups. User Access Token takes precedence when both are filled.", this.plugin.settings.tenantAccessToken, async (value) => {
      this.plugin.settings.tenantAccessToken = value.trim();
      await this.plugin.saveSettings();
    }, true);

    new Setting(containerEl)
      .setName("OAuth Login")
      .setDesc(`${describeOAuthStatus(this.plugin.settings)} Callback: ${callbackDescription}. Scope: ${getEffectiveOAuthScope(this.plugin.settings)}`)
      .addButton((button) => {
        button.setButtonText("Connect").setCta().onClick(async () => {
          await this.plugin.connectWithOAuth();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Refresh").setDisabled(!isOAuthBackedSession(this.plugin.settings)).onClick(async () => {
          await this.plugin.refreshOAuthSession();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Disconnect").setDisabled(!this.plugin.settings.userAccessToken).onClick(async () => {
          await this.plugin.disconnectOAuth();
          this.display();
        });
      });

    this.addTextSetting("Import folder", "Vault folder where imported Markdown files are stored.", this.plugin.settings.importFolder, async (value) => {
      this.plugin.settings.importFolder = value.trim() || DEFAULT_SETTINGS.importFolder;
      await this.plugin.saveSettings();
    });

    this.addTextSetting("Assets folder", "Vault folder for downloaded images and attachments.", this.plugin.settings.assetsFolder, async (value) => {
      this.plugin.settings.assetsFolder = value.trim() || DEFAULT_SETTINGS.assetsFolder;
      await this.plugin.saveSettings();
    });

    new Setting(containerEl)
      .setName("Download assets")
      .setDesc("Stub setting for future attachment/image download support.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.downloadAssets).onChange(async (value) => {
          this.plugin.settings.downloadAssets = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private getCallbackDescription(): string {
    try {
      return buildRedirectUri(this.plugin.settings);
    } catch {
      return "Invalid redirect port";
    }
  }

  private addTextSetting(
    name: string,
    desc: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    secret = false,
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text.setPlaceholder(name).setValue(value);
        if (secret) {
          text.inputEl.type = "password";
        }
        text.onChange(onChange);
      });
  }
}
