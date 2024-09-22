import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, Notice, ItemView } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface LLMPluginSettings {
    llmConnectorApiUrl: string;
    llmConnectorApiKey: string;
    outputFolder: string;
    customPatternsFolder: string;
    youtubeAutodetectEnabled: boolean;
    audioFileAutodetectEnabled: boolean;
    defaultModel: string;
    defaultPostProcessingPattern: string;
    debug: boolean;
    tavilyApiKey: string;
}

const DEFAULT_SETTINGS: LLMPluginSettings = {
    llmConnectorApiUrl: '',
    llmConnectorApiKey: '',
    outputFolder: '',
    customPatternsFolder: '',
    youtubeAutodetectEnabled: true,
    audioFileAutodetectEnabled: true,
    defaultModel: 'gpt-4o',
    defaultPostProcessingPattern: '',
    debug: false,
    tavilyApiKey: ''
};

export default class LLMPlugin extends Plugin {
    settings: LLMPluginSettings;
    private view: LLMView;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new LLMSettingTab(this.app, this));

        this.registerView(
            'llm-view',
            (leaf) => new LLMView(leaf, this)
        );

        this.addRibbonIcon('message-square', 'LLM Chat', () => {
            this.activateView();
        });

        if (this.app.workspace.layoutReady) {
            this.initLeaf();
        } else {
            this.app.workspace.onLayoutReady(this.initLeaf.bind(this));
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    initLeaf(): void {
        if (this.app.workspace.getLeavesOfType('llm-view').length) {
            return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            leaf.setViewState({
                type: 'llm-view',
                active: true,
            });
        }
    }

    async activateView() {
        this.app.workspace.detachLeavesOfType('llm-view');

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: 'llm-view',
                active: true,
            });

            this.app.workspace.revealLeaf(
                this.app.workspace.getLeavesOfType('llm-view')[0]
            );
        }
    }
}

class LLMView extends ItemView {
    plugin: LLMPlugin;
    private chatHistory: HTMLElement;
    private conversationIdInput: HTMLInputElement;
    private promptInput: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private patternInput: HTMLInputElement;
    private modelInput: HTMLInputElement;
    private imageInputContainer: HTMLElement;
    private imageInputs: HTMLInputElement[] = [];
    private addImageButton: HTMLButtonElement;

    constructor(leaf: WorkspaceLeaf, plugin: LLMPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return 'llm-view';
    }

    getDisplayText(): string {
        return 'LLM Chat';
    }

    async onOpen() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('llm-chat-view');

        this.createChatInterface(containerEl);
    }

    private createChatInterface(container: HTMLElement) {
        const chatContainer = container.createDiv({ cls: 'llm-chat-container' });

        this.conversationIdInput = chatContainer.createEl('input', {
            type: 'text',
            placeholder: 'Conversation ID (optional)',
            cls: 'llm-conversation-id-input'
        });

        this.modelInput = chatContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter model name',
            cls: 'llm-model-input'
        });

        this.patternInput = chatContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter LLM template',
            cls: 'llm-pattern-input'
        });

        this.imageInputContainer = chatContainer.createDiv({ cls: 'llm-image-input-container' });
        this.addImageInput();

        this.addImageButton = chatContainer.createEl('button', {
            text: 'Add Image',
            cls: 'llm-add-image-button'
        });
        this.addImageButton.addEventListener('click', () => this.addImageInput());

        this.chatHistory = chatContainer.createDiv({ cls: 'llm-chat-history' });

        this.promptInput = chatContainer.createEl('textarea', {
            placeholder: 'Enter your message...',
            cls: 'llm-prompt-input'
        });

        this.sendButton = chatContainer.createEl('button', {
            text: 'Send',
            cls: 'llm-send-button'
        });
        this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    private addImageInput() {
        const imageInput = this.imageInputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter image path',
            cls: 'llm-image-input'
        });
        this.imageInputs.push(imageInput);
    }

    private async sendMessage() {
        const conversationId = this.conversationIdInput.value;
        const model = this.modelInput.value;
        const template = this.patternInput.value;
        const prompt = this.promptInput.value;
        const images = this.imageInputs.map(input => input.value).filter(path => path.trim() !== '');

        if (!model) {
            new Notice('Please enter a model ID before sending.');
            return;
        }

        try {
            const options = conversationId ? ["-c", "--cid", conversationId] : [];
            const response = await this.runLLM(prompt, template, model, options, images);
            this.appendToChatHistory(prompt, response);
            this.promptInput.value = '';
            this.imageInputs.forEach(input => input.value = '');
        } catch (error) {
            console.error('Failed to get LLM response:', error);
            new Notice('Failed to get LLM response. Please try again.');
        }
    }

    private async runLLM(prompt: string, template: string, model: string, options: string[], images: string[]): Promise<string> {
        try {
            const response = await fetch(`${this.plugin.settings.llmConnectorApiUrl}/llm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Key': this.plugin.settings.llmConnectorApiKey
                },
                body: JSON.stringify({
                    prompt,
                    template,
                    model,
                    options,
                    json_mode: false,
                    images
                })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const responseData = await response.json();
            return responseData.result;
        } catch (error) {
            console.error('Failed to run LLM:', error);
            throw error;
        }
    }

    private appendToChatHistory(prompt: string, response: string) {
        const promptEl = this.chatHistory.createDiv({ cls: 'llm-chat-prompt', text: prompt });
        const responseEl = this.chatHistory.createDiv({ cls: 'llm-chat-response', text: response });
        
        const appendButton = responseEl.createEl('button', {
            text: 'Append to Note',
            cls: 'llm-append-button'
        });
        appendButton.onclick = () => this.appendToCurrentNote(response);

        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    private async appendToCurrentNote(text: string) {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            await this.app.vault.append(activeFile, '\n\n' + text);
            new Notice('Appended to current note');
        } else {
            new Notice('No active note to append to');
        }
    }
}

class LLMSettingTab extends PluginSettingTab {
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
    }
}