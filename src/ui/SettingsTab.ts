import { App, PluginSettingTab, Setting } from 'obsidian';
import { LLMPlugin } from '../core/LLMPlugin';
import { ModelConfig, TemplateConfig } from '../core/types';

export class LLMSettingTab extends PluginSettingTab {
    plugin: LLMPlugin;

    constructor(app: App, plugin: LLMPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'LLM Settings'});

        new Setting(containerEl)
            .setName('LLM Connector API URL')
            .setDesc('Enter the URL for the LLM Connector API')
            .addText(text => text
                .setPlaceholder('Enter URL')
                .setValue(this.plugin.settings.llmConnectorApiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.llmConnectorApiUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('LLM Connector API Key')
            .setDesc('Enter your LLM Connector API Key')
            .addText(text => text
                .setPlaceholder('Enter API Key')
                .setValue(this.plugin.settings.llmConnectorApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.llmConnectorApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Tavily API Key')
            .setDesc('Enter your Tavily API key')
            .addText(text => text
                .setPlaceholder('Enter API Key')
                .setValue(this.plugin.settings.tavilyApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.tavilyApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Output Folder')
            .setDesc('Folder to save output files')
            .addText(text => text
                .setPlaceholder('Enter folder path')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Custom Patterns Folder')
            .setDesc('Folder to store custom patterns')
            .addText(text => text
                .setPlaceholder('Enter folder path')
                .setValue(this.plugin.settings.customPatternsFolder)
                .onChange(async (value) => {
                    this.plugin.settings.customPatternsFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Model')
            .setDesc('The default model to use when running LLM')
            .addText(text => text
                .setPlaceholder('Enter default model')
                .setValue(this.plugin.settings.defaultModel)
                .onChange(async (value) => {
                    this.plugin.settings.defaultModel = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Post Processing Pattern')
            .setDesc('This pattern will be appended to selected patterns when running LLM')
            .addText(text => text
                .setPlaceholder('Enter pattern name')
                .setValue(this.plugin.settings.defaultPostProcessingPattern)
                .onChange(async (value) => {
                    this.plugin.settings.defaultPostProcessingPattern = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('Enable debug logging')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debug)
                .onChange(async (value) => {
                    this.plugin.settings.debug = value;
                    await this.plugin.saveSettings();
                }));

        // Model Configuration Section
        containerEl.createEl('h3', {text: 'Model Configuration'});

        new Setting(containerEl)
            .setName('Model List')
            .setDesc('Configure available models (JSON format: [{"id": "model-id", "label": "Display Name"}])')
            .addTextArea(text => text
                .setPlaceholder('[{"id": "gpt-4o", "label": "GPT-4o"}]')
                .setValue(JSON.stringify(this.plugin.settings.modelList, null, 2))
                .onChange(async (value) => {
                    try {
                        const modelList = JSON.parse(value) as ModelConfig[];
                        this.plugin.settings.modelList = modelList;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error('Invalid JSON for model list:', error);
                    }
                }));

        // Template Configuration Section
        containerEl.createEl('h3', {text: 'Template Configuration'});

        new Setting(containerEl)
            .setName('Template List')
            .setDesc('Configure available templates (JSON format: [{"id": "template-id", "label": "Display Name"}])')
            .addTextArea(text => text
                .setPlaceholder('[{"id": "summarize", "label": "Summarize"}]')
                .setValue(JSON.stringify(this.plugin.settings.templateList, null, 2))
                .onChange(async (value) => {
                    try {
                        const templateList = JSON.parse(value) as TemplateConfig[];
                        this.plugin.settings.templateList = templateList;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error('Invalid JSON for template list:', error);
                    }
                }));
    }
}
