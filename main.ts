import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, Notice, ItemView } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SendIcon, CopyClipboardIcon, SaveAsNoteIcon, UserIcon, ChatbotIcon, PlusIcon, GetCidIcon } from './Icons';
import MarkdownIt from 'markdown-it';

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
    protected md: MarkdownIt;

    async onload() {
        await this.loadSettings();
        this.md = new MarkdownIt();

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

    // Add this new public method
    public renderMarkdown(content: string): string {
        return this.md.render(content);
    }
}

class LLMView extends ItemView {
    private plugin: LLMPlugin;
    private chatHistory: HTMLElement;
    private conversationIdInput: HTMLInputElement;
    private promptInput: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private patternInput: HTMLInputElement;
    private modelInput: HTMLInputElement;
    private imageInput: HTMLInputElement;
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

        const cidContainer = chatContainer.createDiv({ cls: 'llm-cid-container' });
        
        // Create the CID button
        const getCidButton = cidContainer.createEl('button', {
            cls: 'llm-get-cid-button'
        });
        getCidButton.innerHTML = GetCidIcon;
        getCidButton.addEventListener('click', () => this.getConversationIdFromCurrentNote());

        // Create the input box
        this.conversationIdInput = cidContainer.createEl('input', {
            type: 'text',
            placeholder: 'Conversation ID (optional)',
            cls: 'llm-conversation-id-input'
        });

        // Add a clear button
        const clearCidButton = cidContainer.createEl('button', {
            cls: 'llm-clear-cid-button'
        });
        clearCidButton.innerHTML = 'Clear'; // You might want to use an icon here instead
        clearCidButton.addEventListener('click', () => this.clearConversationId());

        const modelTemplateContainer = chatContainer.createDiv({ cls: 'llm-model-template-container' });
        this.modelInput = modelTemplateContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter model name',
            cls: 'llm-model-input'
        });
        this.patternInput = modelTemplateContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter LLM template',
            cls: 'llm-pattern-input'
        });

        const imageInputContainer = chatContainer.createDiv({ cls: 'llm-image-input-container' });
        this.imageInput = imageInputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter image path',
            cls: 'llm-image-input'
        });
        this.addImageButton = imageInputContainer.createEl('button', {
            cls: 'llm-add-image-button'
        });
        this.addImageButton.innerHTML = PlusIcon;
        this.addImageButton.addEventListener('click', () => this.addImageInput());

        const promptInputContainer = chatContainer.createDiv({ cls: 'llm-prompt-input-container' });
        this.promptInput = promptInputContainer.createEl('textarea', {
            placeholder: 'Type your message here...',
            cls: 'llm-prompt-input'
        });

        this.sendButton = promptInputContainer.createEl('button', {
            cls: 'llm-send-button'
        });
        this.sendButton.innerHTML = SendIcon;
        this.sendButton.addEventListener('click', () => this.sendMessage());

        this.chatHistory = chatContainer.createDiv({ cls: 'llm-chat-history' });
    }

    private addImageInput() {
        if (this.imageInput && this.imageInput.parentNode) {
            const imageInput = this.imageInput.parentNode.createEl('input', {
                type: 'text',
                placeholder: 'Enter image path',
                cls: 'llm-image-input'
            });
            imageInput.addEventListener('input', () => this.updateAddImageButtonVisibility());
        }
        this.updateAddImageButtonVisibility();
    }

    private updateAddImageButtonVisibility() {
        const images = Array.from(this.imageInput?.parentNode?.children || [])
            .map(input => (input as HTMLInputElement).value)
            .filter(path => path.trim() !== '');
        
        if (this.addImageButton) {
            this.addImageButton.style.display = images.length < 5 ? 'block' : 'none';
        }
    }

    private async sendMessage() {
        const prompt = this.promptInput.value;
        
        // Check for Tavily search command
        const tavilyMatch = prompt.match(/^@tavily\s+(.+)$/);
        if (tavilyMatch) {
            await this.performTavilySearch(tavilyMatch[1]);
            return;
        }

        // Check for Web scraping command
        const webMatch = prompt.match(/^@web\s+(.+)$/);
        if (webMatch) {
            await this.performWebScrape(webMatch[1]);
            return;
        }

        // Check for Note reading command
        const noteMatch = prompt.match(/^@note(?:\s+(.+))?$/);
        if (noteMatch) {
            const noteContent = await this.readCurrentNote();
            if (noteContent) {
                const userPrompt = noteMatch[1];
                const combinedPrompt = userPrompt 
                    ? `${noteContent}\n\n${userPrompt}`
                    : noteContent;
                await this.processLLMRequest(combinedPrompt);
            }
            return;
        }

        // Check for Clipboard reading command
        const clipboardMatch = prompt.match(/^@clipboard(?:\s+(.+))?$/);
        if (clipboardMatch) {
            const clipboardContent = await this.readClipboard();
            if (clipboardContent) {
                const userPrompt = clipboardMatch[1];
                const combinedPrompt = userPrompt 
                    ? `${clipboardContent}\n\n${userPrompt}`
                    : clipboardContent;
                await this.processLLMRequest(combinedPrompt);
            }
            return;
        }

        // Regular LLM processing
        await this.processLLMRequest(prompt);
    }

    private async performTavilySearch(query: string) {
        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    include_answer: true,
                    max_results: 5,
                    include_images: true,
                    search_depth: "basic",
                    api_key: this.plugin.settings.tavilyApiKey
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const searchResult = JSON.stringify(data, null, 2);
            
            // Display search query and results in chat
            this.appendToChatHistory(`@tavily ${query}`, searchResult);
            this.promptInput.value = '';
        } catch (error) {
            console.error('Failed to perform Tavily search:', error);
            new Notice('Failed to perform Tavily search. Please check your API key and try again.');
        }
    }

    private async performWebScrape(url: string) {
        try {
            // Ensure URL starts with http:// or https://
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            const jinaUrl = `https://r.jina.ai/${url}`;
            const response = await fetch(jinaUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const content = await response.text();
            
            // Display URL and scraped content in chat
            this.appendToChatHistory(`@web ${url}`, content);
            this.promptInput.value = '';
        } catch (error) {
            console.error('Failed to scrape web content:', error);
            new Notice('Failed to scrape web content. Please check the URL and try again.');
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
        const promptEl = this.chatHistory.createDiv({ cls: 'llm-chat-message llm-chat-user-message' });
        promptEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${UserIcon}</div>
                <div class="llm-chat-text">${prompt}</div>
            </div>
        `;

        const responseEl = this.chatHistory.createDiv({ cls: 'llm-chat-message llm-chat-ai-message' });
        responseEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${ChatbotIcon}</div>
                <div class="llm-chat-text">${this.plugin.renderMarkdown(response)}</div>
            </div>
        `;
        
        const actionContainer = responseEl.createDiv({ cls: 'llm-message-actions' });
        
        const copyButton = actionContainer.createEl('button', { cls: 'llm-action-button' });
        copyButton.innerHTML = CopyClipboardIcon;
        copyButton.onclick = () => {
            navigator.clipboard.writeText(response);
            new Notice('Copied to clipboard');
        };

        const appendButton = actionContainer.createEl('button', { cls: 'llm-action-button' });
        appendButton.innerHTML = SaveAsNoteIcon;
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

    private async getConversationIdFromCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const content = await this.app.vault.read(activeFile);
            const match = content.match(/Conversation ID:\s*(\S+)/);
            if (match && match[1]) {
                this.conversationIdInput.value = match[1];
            } else {
                // Try to get conversation ID from backend
                try {
                    const lastCid = await this.queryLastConversationId();
                    this.conversationIdInput.value = lastCid || '';
                } catch (error) {
                    console.error('Failed to get conversation ID from backend:', error);
                    this.conversationIdInput.value = '';
                }
            }
        }
    }

    private async queryLastConversationId(): Promise<string | null> {
        try {
            const response = await fetch(`${this.plugin.settings.llmConnectorApiUrl}/latest_cid`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': this.plugin.settings.llmConnectorApiKey
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.conversation_id || null;

        } catch (error) {
            console.error('Failed to query last conversation ID:', error);
            return null;
        }
    }

    private clearConversationId() {
        if (this.conversationIdInput) {
            this.conversationIdInput.value = '';
        }
    }

    private async readCurrentNote(): Promise<string | null> {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                throw new Error('No active note found');
            }
            return await this.app.vault.read(activeFile);
        } catch (error) {
            console.error('Failed to read current note:', error);
            new Notice('Failed to read current note. Please make sure a note is open.');
            return null;
        }
    }

    private async processLLMRequest(prompt: string) {
        const conversationId = this.conversationIdInput.value;
        const model = this.modelInput.value;
        const template = this.patternInput.value;
        const images = Array.from(this.imageInput?.parentNode?.children || [])
            .map(input => (input as HTMLInputElement).value)
            .filter(path => path.trim() !== '');

        if (!model) {
            new Notice('Please enter a model ID before sending.');
            return;
        }

        try {
            const options = conversationId ? ["-c", "--cid", conversationId] : [];
            const response = await this.runLLM(prompt, template, model, options, images);
            this.appendToChatHistory(prompt, response);
            this.promptInput.value = '';
            this.patternInput.value = '';
            if (this.imageInput && this.imageInput.parentNode) {
                Array.from(this.imageInput.parentNode.children).forEach(input => (input as HTMLInputElement).value = '');
            }
            this.updateAddImageButtonVisibility();
        } catch (error) {
            console.error('Failed to get LLM response:', error);
            new Notice('Failed to get LLM response. Please try again.');
        }
    }

    private async readClipboard(): Promise<string | null> {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                throw new Error('Clipboard is empty');
            }
            return text;
        } catch (error) {
            console.error('Failed to read clipboard:', error);
            new Notice('Failed to read clipboard. Please check clipboard permissions.');
            return null;
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
