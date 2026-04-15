import { App, Notice, PluginSettingTab } from "obsidian";
import type FeishuImporterPlugin from "./main";
import type { FeishuImporterSettings } from "./types";
import {
  buildRedirectUri,
  describeOAuthStatus,
  FEISHU_APP_CONSOLE_URL,
  FEISHU_PERMISSION_GUIDE_URL,
  isOAuthBackedSession,
  RECOMMENDED_OAUTH_SCOPE,
  REQUIRED_PERMISSION_JSON,
} from "./oauth";

const { shell } = require("electron") as { shell: { openExternal: (url: string) => Promise<void> } };

export const DEFAULT_SETTINGS: FeishuImporterSettings = {
  baseUrl: "https://open.feishu.cn",
  userAccessToken: "",
  appId: "",
  appSecret: "",
  oauthRefreshToken: "",
  oauthTokenExpiresAt: 0,
  oauthRefreshTokenExpiresAt: 0,
  oauthUserName: "",
  oauthUserOpenId: "",
  importFolder: "Feishu",
  assetsFolder: "Feishu/assets",
  downloadAssets: true,
  lastImportedDocUrl: "",
  importedDocuments: {},
};

export class FeishuImporterSettingTab extends PluginSettingTab {
  plugin: FeishuImporterPlugin;

  constructor(app: App, plugin: FeishuImporterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("feishu-importer-settings");

    const shellEl = containerEl.createDiv({ cls: "fi-shell" });
    this.renderHero(shellEl);
    this.renderFirstRunPrompt(shellEl);
    this.renderSetupGuide(shellEl);
    this.renderCredentials(shellEl);
    this.renderAccount(shellEl);
    this.renderImportOptions(shellEl);
  }

  private renderHero(parent: HTMLElement): void {
    const hero = parent.createDiv({ cls: "fi-hero" });
    const copy = hero.createDiv({ cls: "fi-hero-copy" });
    copy.createDiv({ cls: "fi-kicker", text: "Feishu Importer" });
    copy.createEl("h2", { text: "先连接飞书，再把云文档变成本地 Markdown" });
    copy.createEl("p", {
      text: "按下面 4 步完成首次配置。之后只需要在命令面板粘贴文档链接，就可以导入并增量同步。",
    });

    const progress = hero.createDiv({ cls: "fi-progress", attr: { "aria-label": "Setup progress" } });
    const state = this.getSetupState();
    this.createProgressPill(progress, "1", "开放平台", state.hasAppCredentials || state.isConnected);
    this.createProgressPill(progress, "2", "应用凭证", state.hasAppCredentials);
    this.createProgressPill(progress, "3", "账号授权", state.isConnected);
    this.createProgressPill(progress, "4", "导入位置", state.hasImportFolders);
  }

  private renderFirstRunPrompt(parent: HTMLElement): void {
    const state = this.getSetupState();
    const prompt = parent.createDiv({ cls: `fi-next-step ${state.isReady ? "is-ready" : ""}` });
    prompt.createSpan({ cls: "fi-next-step-icon", text: state.isReady ? "✓" : "→" });
    const copy = prompt.createDiv();
    copy.createDiv({ cls: "fi-next-step-label", text: state.isReady ? "已经可以导入" : "下一步" });
    copy.createEl("p", { text: this.getNextStepText(state) });
  }

  private renderSetupGuide(parent: HTMLElement): void {
    const complete = this.getSetupState().hasAppCredentials || this.getSetupState().isConnected;
    const card = this.createCard(parent, "1", "准备飞书开放平台应用", "在开放平台创建或打开一个企业自建应用，把回调地址和权限范围填进去。完成后记得发布或重新授权应用。", complete ? "已准备" : "先做这里");

    const actions = card.createDiv({ cls: "fi-actions" });
    this.createButton(actions, "打开开放平台", async () => shell.openExternal(FEISHU_APP_CONSOLE_URL));
    this.createButton(actions, "复制回调地址", async () => this.copyToClipboard(buildRedirectUri(), "已复制飞书回调地址。"));
    this.createButton(actions, "复制权限配置", async () => this.copyToClipboard(REQUIRED_PERMISSION_JSON, "已复制推荐权限配置。"), true);
    this.createButton(actions, "权限帮助", async () => shell.openExternal(FEISHU_PERMISSION_GUIDE_URL));

    const grid = card.createDiv({ cls: "fi-copy-grid" });
    this.createCopyPanel(grid, "回调地址", buildRedirectUri(), "粘贴到「安全设置」里的 Redirect URLs。");
    this.createCopyPanel(grid, "权限范围", RECOMMENDED_OAUTH_SCOPE, "添加到「权限管理」中；权限变更后需要重新授权。");
  }

  private renderCredentials(parent: HTMLElement): void {
    const card = this.createCard(parent, "2", "填写应用凭证", "从飞书应用的「凭证与基础信息」复制 App ID 和 App Secret。它们只会保存在当前 Obsidian 插件数据里。", this.getSetupState().hasAppCredentials ? "已填写" : "需要填写");

    const fields = card.createDiv({ cls: "fi-fields" });
    this.createSegmentedField(fields, "账号区域", "选择与你的飞书或 Lark 租户一致的开放平台。", this.plugin.settings.baseUrl, [
      { label: "飞书中国", value: "https://open.feishu.cn" },
      { label: "Lark Global", value: "https://open.larksuite.com" },
    ], async (value) => {
      this.plugin.settings.baseUrl = value;
      await this.plugin.saveSettings();
    });
    this.createTextField(fields, "App ID", "通常以 cli_ 开头。", this.plugin.settings.appId, "cli_xxx", async (value) => {
      this.plugin.settings.appId = value.trim();
      await this.plugin.saveSettings();
    });
    this.createTextField(fields, "App Secret", "用于换取用户授权，不会离开本地插件配置。", this.plugin.settings.appSecret, "app secret", async (value) => {
      this.plugin.settings.appSecret = value.trim();
      await this.plugin.saveSettings();
    }, true);
  }

  private renderAccount(parent: HTMLElement): void {
    const connected = Boolean(this.plugin.settings.userAccessToken);
    const card = this.createCard(parent, "3", "授权飞书账号", connected ? "已连接账号。导入时会使用这个用户能访问的文档权限，并在需要时自动刷新授权。" : "填好 App ID 和 App Secret 后，点击连接并在浏览器中同意授权。", connected ? "已连接" : "未连接");
    card.addClass(connected ? "is-connected" : "is-disconnected");

    const status = card.createDiv({ cls: "fi-status" });
    status.createSpan({ cls: "fi-status-dot" });
    const statusCopy = status.createDiv();
    statusCopy.createDiv({ cls: "fi-status-title", text: connected ? "连接正常" : "等待授权" });
    statusCopy.createDiv({ cls: "fi-status-desc", text: describeOAuthStatus(this.plugin.settings) });

    const actions = card.createDiv({ cls: "fi-actions" });
    this.createButton(actions, connected ? "重新连接" : "连接飞书账号", async () => {
      if (!this.getSetupState().hasAppCredentials) {
        new Notice("请先填写 App ID 和 App Secret，再连接飞书账号。");
        return;
      }

      await this.plugin.connectWithOAuth();
      this.display();
    }, true);
    this.createButton(actions, "刷新授权", async () => {
      await this.plugin.refreshOAuthSession();
      this.display();
    }, false, !isOAuthBackedSession(this.plugin.settings));
    this.createButton(actions, "断开连接", async () => {
      await this.plugin.disconnectOAuth();
      this.display();
    }, false, !connected);
  }

  private renderImportOptions(parent: HTMLElement): void {
    const card = this.createCard(parent, "4", "选择导入位置", "导入的 Markdown、图片和附件都会保存到当前 Obsidian 库中。默认目录可以直接使用，也可以按你的笔记结构调整。", this.getSetupState().hasImportFolders ? "已设置" : "使用默认值");

    const fields = card.createDiv({ cls: "fi-fields" });
    this.createTextField(fields, "笔记目录", "导入后的 Markdown 文档会写入这里。", this.plugin.settings.importFolder, DEFAULT_SETTINGS.importFolder, async (value) => {
      this.plugin.settings.importFolder = value.trim() || DEFAULT_SETTINGS.importFolder;
      await this.plugin.saveSettings();
    });
    this.createTextField(fields, "附件目录", "下载的图片和附件会集中保存到这里。", this.plugin.settings.assetsFolder, DEFAULT_SETTINGS.assetsFolder, async (value) => {
      this.plugin.settings.assetsFolder = value.trim() || DEFAULT_SETTINGS.assetsFolder;
      await this.plugin.saveSettings();
    });
    this.createToggleField(fields, "下载图片和附件", "开启后会在笔记中嵌入本地图片，并为附件生成本地链接。", this.plugin.settings.downloadAssets, async (value) => {
      this.plugin.settings.downloadAssets = value;
      await this.plugin.saveSettings();
    });

    const footer = card.createDiv({ cls: "fi-card-footer" });
    footer.createSpan({ text: "完成后，在命令面板运行「Feishu Importer: Import Feishu document」，粘贴飞书文档链接即可导入。" });
  }

  private createCard(parent: HTMLElement, step: string, title: string, description: string, badge: string): HTMLElement {
    const card = parent.createDiv({ cls: "fi-card" });
    const heading = card.createDiv({ cls: "fi-card-heading" });
    heading.createSpan({ cls: "fi-step", text: step });
    const copy = heading.createDiv();
    copy.createEl("h3", { text: title });
    copy.createEl("p", { text: description });
    heading.createSpan({ cls: "fi-badge", text: badge });
    return card;
  }

  private createCopyPanel(parent: HTMLElement, label: string, value: string, hint: string): void {
    const panel = parent.createDiv({ cls: "fi-copy-panel" });
    const top = panel.createDiv({ cls: "fi-copy-panel-top" });
    top.createDiv({ cls: "fi-label", text: label });
    this.createButton(top, "复制", async () => this.copyToClipboard(value, `已复制${label}。`));
    const code = panel.createEl("code", { text: value });
    code.onclick = async () => this.copyToClipboard(value, `已复制${label}。`);
    code.setAttr("title", "点击复制");
    panel.createDiv({ cls: "fi-hint", text: hint });
  }

  private createTextField(parent: HTMLElement, label: string, hint: string, value: string, placeholder: string, onChange: (value: string) => Promise<void>, secret = false): void {
    const field = parent.createDiv({ cls: "fi-field" });
    field.createEl("label", { text: label });
    const control = field.createDiv({ cls: "fi-input-row" });
    const input = control.createEl("input", { attr: { type: secret ? "password" : "text", placeholder } });
    input.value = value;
    input.oninput = () => {
      void onChange(input.value);
    };
    input.onchange = async () => onChange(input.value);
    if (secret) {
      this.createButton(control, "显示", async () => {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        const button = control.querySelector("button");
        if (button) {
          button.textContent = isHidden ? "隐藏" : "显示";
        }
      });
    }
    field.createDiv({ cls: "fi-hint", text: hint });
  }

  private createSegmentedField(parent: HTMLElement, label: string, hint: string, value: string, options: Array<{ label: string; value: string }>, onChange: (value: string) => Promise<void>): void {
    const field = parent.createDiv({ cls: "fi-field" });
    field.createEl("label", { text: label });
    const group = field.createDiv({ cls: "fi-segmented", attr: { role: "group", "aria-label": label } });
    for (const option of options) {
      const button = group.createEl("button", { text: option.label });
      button.type = "button";
      button.toggleClass("is-selected", option.value === value);
      button.onclick = async () => {
        await onChange(option.value);
        this.display();
      };
    }
    field.createDiv({ cls: "fi-hint", text: hint });
  }

  private createToggleField(parent: HTMLElement, label: string, hint: string, value: boolean, onChange: (value: boolean) => Promise<void>): void {
    const field = parent.createDiv({ cls: "fi-field fi-toggle-field" });
    const labelEl = field.createEl("label", { cls: "fi-toggle-label" });
    labelEl.createSpan({ text: label });
    const switchEl = labelEl.createSpan({ cls: "fi-switch" });
    const input = switchEl.createEl("input", { attr: { type: "checkbox" } });
    switchEl.createSpan({ cls: "fi-switch-track" });
    input.checked = value;
    input.onchange = async () => onChange(input.checked);
    field.createDiv({ cls: "fi-hint", text: hint });
  }

  private createButton(parent: HTMLElement, text: string, onClick: () => Promise<void>, primary = false, disabled = false): HTMLButtonElement {
    const button = parent.createEl("button", { cls: primary ? "fi-button fi-button-primary" : "fi-button", text });
    button.disabled = disabled;
    button.onclick = async () => onClick();
    return button;
  }

  private createProgressPill(parent: HTMLElement, step: string, label: string, complete: boolean): void {
    const pill = parent.createDiv({ cls: `fi-progress-pill ${complete ? "is-complete" : ""}` });
    pill.createSpan({ text: complete ? "✓" : step });
    pill.createSpan({ text: label });
  }

  private async copyToClipboard(value: string, message: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    new Notice(message);
  }

  private getSetupState(): { hasAppCredentials: boolean; isConnected: boolean; hasImportFolders: boolean; isReady: boolean } {
    const hasAppCredentials = Boolean(this.plugin.settings.appId.trim() && this.plugin.settings.appSecret.trim());
    const isConnected = Boolean(this.plugin.settings.userAccessToken);
    const hasImportFolders = Boolean(this.plugin.settings.importFolder.trim() && this.plugin.settings.assetsFolder.trim());
    return {
      hasAppCredentials,
      isConnected,
      hasImportFolders,
      isReady: hasAppCredentials && isConnected && hasImportFolders,
    };
  }

  private getNextStepText(state: ReturnType<FeishuImporterSettingTab["getSetupState"]>): string {
    if (!state.hasAppCredentials) {
      return "先打开飞书开放平台，填好回调地址和权限范围，然后把 App ID 与 App Secret 粘贴到这里。";
    }

    if (!state.isConnected) {
      return "凭证已经就绪。现在连接飞书账号，浏览器授权完成后回到 Obsidian。";
    }

    if (!state.hasImportFolders) {
      return "账号已经连接。确认导入目录和附件目录后，就可以开始导入文档。";
    }

    return "在命令面板运行「Feishu Importer: Import Feishu document」，粘贴 docx、docs 或 wiki 链接开始导入。";
  }
}
