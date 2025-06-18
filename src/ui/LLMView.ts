import { ItemView, WorkspaceLeaf, Notice, MarkdownView } from 'obsidian';
import { LLMPlugin } from '../core/LLMPlugin';
import { ChatMessage, LLMRequest, RequestState } from '../core/types';
import { LLMService } from '../services/LLMService';
import { CommandService } from '../services/CommandService';
import { ImageService } from '../services/ImageService';
import { ConfigurationService } from '../services/ConfigurationService';
import { ChatHistory } from './components/ChatHistory';
import { UnifiedInputBox } from './components/UnifiedInputBox';

export class LLMView extends ItemView {
    private plugin: LLMPlugin;
    private llmService: LLMService;
    private commandService: CommandService;
    private imageService: ImageService;
    private configurationService: ConfigurationService;
    private chatHistory: ChatHistory;
    private inputArea: UnifiedInputBox;
    private requestState: RequestState = {
        isLoading: false,
        error: null,
        lastRequest: null
    };

    constructor(leaf: WorkspaceLeaf, plugin: LLMPlugin) {
        super(leaf);
        this.plugin = plugin;

        // Initialize services
        this.llmService = new LLMService(plugin.settings);
        this.commandService = new CommandService(this.app, this.llmService);
        this.imageService = new ImageService(this.app);
        this.configurationService = new ConfigurationService(this.app);
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

        await this.createChatInterface(containerEl);
    }

    private async createChatInterface(container: HTMLElement) {
        const chatContainer = container.createDiv({ cls: 'llm-chat-container' });

        // Initialize chat history
        const historyContainer = chatContainer.createDiv();
        this.chatHistory = new ChatHistory(historyContainer);

        // Initialize unified input area
        const inputContainer = chatContainer.createDiv();
        this.inputArea = new UnifiedInputBox(inputContainer);

        // Setup event handlers
        this.setupEventHandlers();

        // Load configuration and set up input area
        await this.loadConfiguration();
    }

    private async loadConfiguration() {
        try {
            const config = await this.configurationService.loadConfiguration();

            // Set available commands
            this.inputArea.setCommands(this.commandService.getCommands());

            // Set models and templates from data.json
            this.inputArea.setModels(config.models);
            this.inputArea.setTemplates(config.templates);

            // Set default model if available
            if (this.plugin.settings.defaultModel) {
                const defaultModel = config.models.find(m => m.id === this.plugin.settings.defaultModel);
                if (defaultModel) {
                    // The UnifiedInputBox will automatically select the first model
                }
            }
        } catch (error) {
            console.error('Failed to load configuration:', error);
            new Notice('Failed to load model/template configuration');
        }
    }

    private setupEventHandlers() {
        // Handle send message
        this.inputArea.onSendMessage = async () => {
            await this.sendMessage();
        };

        // Handle conversation ID actions
        this.inputArea.onGetConversationId = async () => {
            await this.getConversationIdFromCurrentNote();
        };

        this.inputArea.onClearConversationId = () => {
            this.inputArea.clearConversationId();
        };

        // Handle chat actions (copy, insert, etc.)
        this.chatHistory.container.addEventListener('llm-action', (event: CustomEvent) => {
            const { action, content } = event.detail;
            this.handleChatAction(action, content);
        });

        // Handle file drops
        this.inputArea.container.addEventListener('llm-files-dropped', async (event: CustomEvent) => {
            const { files } = event.detail;
            await this.handleDroppedFiles(files);
        });
    }

    private async sendMessage() {
        let prompt = this.inputArea.getPromptValue().trim();

        // Inline @-command replacement (matching original logic)
        if (/@note\b/i.test(prompt) || /@clipboard\b/i.test(prompt)) {
            // Replace @note
            if (/@note\b/i.test(prompt)) {
                const noteContent = await this.readCurrentNote();
                if (noteContent !== null) {
                    prompt = prompt.replace(/@note\b/gi, noteContent);
                } else {
                    new Notice('No active note found for @note');
                    return;
                }
            }
            // Replace @clipboard
            if (/@clipboard\b/i.test(prompt)) {
                const clipboardContent = await this.readClipboard();
                if (clipboardContent !== null) {
                    prompt = prompt.replace(/@clipboard\b/gi, clipboardContent);
                } else {
                    new Notice('No text found in clipboard for @clipboard');
                    return;
                }
            }
        }

        // YouTube command
        const youtubeMatch = prompt.match(/^@youtube\s+(.+?)(?:\s+(.+))?$/i);
        if (youtubeMatch) {
            try {
                const url = youtubeMatch[1].trim();
                const transcript = await this.llmService.getYouTubeTranscript(url);
                if (transcript) {
                    await this.processLLMRequest(transcript);
                    this.inputArea.setPromptValue('');
                }
                return;
            } catch (error) {
                console.error('Failed to get YouTube transcript:', error);
                new Notice('Failed to get YouTube transcript. Please check the URL and try again.');
                return;
            }
        }

        // Tavily search command
        const tavilyMatch = prompt.match(/^@tavily\s+(.+)$/i);
        if (tavilyMatch) {
            await this.performTavilySearch(tavilyMatch[1].trim());
            return;
        }

        // Web scraping command
        const webMatch = prompt.match(/^@web\s+(.+)$/i);
        if (webMatch) {
            await this.performWebScrape(webMatch[1].trim());
            return;
        }

        // Note reading command
        const noteMatch = prompt.match(/^@note\s*(.*?)$/i);
        if (noteMatch) {
            try {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const content = await this.app.vault.read(activeFile);
                    await this.processLLMRequest(content);
                } else {
                    new Notice('No active note found');
                }
                return;
            } catch (error) {
                console.error('Failed to read note:', error);
                new Notice('Failed to read note content');
                return;
            }
        }

        // Clipboard command
        const clipboardMatch = prompt.match(/^@clipboard\s*(.*?)$/i);
        if (clipboardMatch) {
            try {
                const text = await this.readClipboard();
                if (text) {
                    await this.processLLMRequest(text);
                } else {
                    new Notice('No text found in clipboard');
                }
                return;
            } catch (error) {
                console.error('Failed to read clipboard:', error);
                new Notice('Failed to read clipboard. Please check clipboard permissions.');
                return;
            }
        }

        // If no command matches, process as regular prompt
        await this.processLLMRequest(prompt);
    }

    private async processLLMRequest(prompt: string) {
        const conversationId = this.inputArea.getConversationId();
        let model = this.inputArea.getModelValue();
        const template = this.inputArea.getPatternValue();

        // Use default model if none provided
        if (!model && this.plugin.settings.defaultModel) {
            model = this.plugin.settings.defaultModel;
        }

        if (!model) {
            new Notice('Please enter a model ID before sending.');
            return;
        }

        // Get images
        const images = this.inputArea.getImages();

        try {
            this.setLoading(true);

            const options = conversationId ? ["-c", "--cid", conversationId] : [];
            const response = await this.llmService.sendRequest({
                prompt,
                template,
                model,
                options,
                images,
                conversationId
            });

            if (response.error) {
                throw new Error(response.error);
            }

            this.appendToChatHistory(prompt, response.result);

            // Clear inputs (matching original behavior)
            this.inputArea.setPromptValue('');
            this.inputArea.setPatternValue('');
            this.inputArea.clearImages();

            // Clean up temporary screenshot files
            const screenshotPaths = this.imageService.getScreenshotPaths(images);
            await this.imageService.cleanupScreenshots(screenshotPaths);

        } catch (error) {
            console.error('Failed to get LLM response:', error);
            new Notice('Failed to get LLM response. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    private async getConversationIdFromCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const content = await this.app.vault.read(activeFile);
            const match = content.match(/Conversation ID:\s*(\S+)/);
            if (match && match[1]) {
                this.inputArea.setConversationId(match[1]);
            } else {
                // Try to get conversation ID from backend
                try {
                    const lastCid = await this.llmService.getLastConversationId();
                    this.inputArea.setConversationId(lastCid || '');
                } catch (error) {
                    console.error('Failed to get conversation ID from backend:', error);
                    this.inputArea.setConversationId('');
                }
            }
        }
    }

    private async handleChatAction(action: string, content: string) {
        switch (action) {
            case 'insert':
                await this.insertAtCursor(content);
                break;
            case 'prepend':
                await this.prependToCurrentNote(content);
                break;
            case 'append':
                await this.appendToCurrentNote(content);
                break;
        }
    }

    private async handleDroppedFiles(files: FileList) {
        try {
            const processedImages = await this.imageService.processDroppedFiles(files);

            // Add images to input area
            processedImages.forEach(imagePath => {
                this.inputArea.addImage(imagePath);
            });

            new Notice(`Added ${processedImages.length} image(s)`);
        } catch (error) {
            console.error('Failed to process dropped files:', error);
            new Notice('Failed to process dropped files');
        }
    }

    public async insertAtCursor(text: string): Promise<boolean> {
        let leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) {
            new Notice("No active note found.");
            return false;
        }

        if (!(leaf.view instanceof MarkdownView)) {
            leaf = this.app.workspace.getLeaf(false);
            await leaf.setViewState({
                type: "markdown",
                state: leaf.view.getState()
            });
        }

        if (!(leaf.view instanceof MarkdownView)) {
            new Notice("Failed to open a markdown view.");
            return false;
        }

        const editor = leaf.view.editor;
        const cursor = editor.getCursor();
        editor.replaceRange(text, cursor);
        new Notice('Inserted at cursor position');
        return true;
    }

    public async prependToCurrentNote(text: string): Promise<boolean> {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const currentContent = await this.app.vault.read(activeFile);
            await this.app.vault.modify(activeFile, text + '\n\n' + currentContent);
            new Notice('Prepended to current note');
            return true;
        } else {
            new Notice('No active note to prepend to');
            return false;
        }
    }

    public async appendToCurrentNote(text: string): Promise<boolean> {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            await this.app.vault.append(activeFile, '\n\n' + text);
            new Notice('Appended to current note');
            return true;
        } else {
            new Notice('No active note to append to');
            return false;
        }
    }

    private setLoading(loading: boolean) {
        this.requestState.isLoading = loading;
        this.inputArea.setLoading(loading);
    }

    private async getImagesFromInputArea(): Promise<string[]> {
        return this.inputArea.getImages();
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

    private async performTavilySearch(query: string) {
        try {
            const results = await this.llmService.performTavilySearch(query);
            const searchResult = JSON.stringify(results, null, 2);

            // Display search query and results in chat
            this.appendToChatHistory(`@tavily ${query}`, searchResult);
            this.inputArea.setPromptValue('');
        } catch (error) {
            console.error('Failed to perform Tavily search:', error);
            new Notice('Failed to perform Tavily search. Please check your API key and try again.');
        }
    }

    private async performWebScrape(url: string) {
        try {
            const content = await this.llmService.scrapeWebContent(url);

            // Instead of just displaying content, send it to LLM
            await this.processLLMRequest(content);
            this.inputArea.setPromptValue('');
        } catch (error) {
            console.error('Failed to scrape web content:', error);
            new Notice('Failed to scrape web content. Please check the URL and try again.');
        }
    }

    private appendToChatHistory(prompt: string, response: string) {
        // Add user message
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'user',
            content: prompt,
            timestamp: new Date()
        };

        // Add assistant message
        const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            type: 'assistant',
            content: response,
            timestamp: new Date()
        };

        this.chatHistory.addMessage(userMessage, (content) => content);
        this.chatHistory.addMessage(assistantMessage, (content) => this.plugin.renderMarkdown(content));
    }
}
