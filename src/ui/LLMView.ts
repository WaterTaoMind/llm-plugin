import { ItemView, WorkspaceLeaf, Notice, MarkdownView } from 'obsidian';
import { LLMPlugin } from '../core/LLMPlugin';
import { ChatMessage, LLMRequest, RequestState, ProcessingMode } from '../core/types';
import { LLMService } from '../services/LLMService';
import { CommandService } from '../services/CommandService';
import { ImageService } from '../services/ImageService';
import { ChatHistory } from './components/ChatHistory';
import { InputArea } from './components/InputArea';
import { joinPath, normalizePath } from '../utils/pathUtils';
import { AgentProgressEvent } from '../agents/types';

export class LLMView extends ItemView {
    private plugin: LLMPlugin;
    private llmService: LLMService;
    private commandService: CommandService;
    private imageService: ImageService;
    private chatHistory: ChatHistory;
    private inputArea: InputArea;
    private requestState: RequestState = {
        isLoading: false,
        error: null,
        lastRequest: null
    };
    private currentProgressMessage?: HTMLElement;
    private currentAbortController?: AbortController;

    constructor(leaf: WorkspaceLeaf, plugin: LLMPlugin) {
        super(leaf);
        this.plugin = plugin;

        // Initialize services
        this.llmService = new LLMService(plugin.settings);
        this.commandService = new CommandService(this.app, this.llmService);
        this.imageService = new ImageService(this.app);

        // Connect MCP client service to LLM service and CommandService
        const mcpClientService = plugin.getMCPClientService();
        if (mcpClientService) {
            this.llmService.setMCPClientService(mcpClientService);
            this.commandService.setMCPClientService(mcpClientService);
        }
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

        // Initialize chat history
        const historyContainer = chatContainer.createDiv();
        this.chatHistory = new ChatHistory(historyContainer);

        // Initialize input area (now includes mode selector)
        const inputContainer = chatContainer.createDiv();
        // Get plugin directory path (normalize for cross-platform compatibility)
        const basePath = (this.app.vault.adapter as any).basePath;
        const pluginDir = joinPath(normalizePath(basePath), '.obsidian', 'plugins', this.plugin.manifest.id);
        this.inputArea = new InputArea(inputContainer, this.app, pluginDir);

        // Connect mode selector to LLM service
        this.inputArea.setCurrentMode(this.llmService.getCurrentMode());
        this.inputArea.onModeChange = (mode: ProcessingMode) => {
            this.llmService.setCurrentMode(mode);
        };

        // Setup event handlers
        this.setupEventHandlers();

        // Set available commands
        this.inputArea.setCommands(this.commandService.getCommands());

        // Connect MCP client service to InputArea for status display
        const mcpClientService = this.plugin.getMCPClientService();
        if (mcpClientService) {
            this.inputArea.setMCPClientService(mcpClientService);
        }

        // Set default model if available
        if (this.plugin.settings.defaultModel) {
            this.inputArea.setDefaultModel(this.plugin.settings.defaultModel);
        }
    }

    private setupEventHandlers() {
        // Handle send message
        this.inputArea.onSendMessage = async () => {
            await this.sendMessage();
        };

        // Handle cancel request
        this.inputArea.onCancelRequest = () => {
            this.cancelCurrentRequest();
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
                const transcript = await this.llmService.getYouTubeTranscript(url, this.currentAbortController?.signal);
                if (transcript) {
                    await this.processLLMRequest(transcript);
                    this.inputArea.setPromptValue('');
                }
                return;
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('YouTube transcript was cancelled by user');
                    this.inputArea.showCancelled();
                    new Notice('YouTube transcript cancelled');
                } else {
                    console.error('Failed to get YouTube transcript:', error);
                    new Notice('Failed to get YouTube transcript. Please check the URL and try again.');
                }
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
            // Create new AbortController for this request
            this.currentAbortController = new AbortController();
            
            this.setLoading(true);

            // Set up progress callback for agent mode
            const effectiveMode = this.llmService.getCurrentMode();
            console.log('🔍 Mode check:', { effectiveMode, isAgent: effectiveMode === ProcessingMode.AGENT, hasAgentPrefix: prompt.startsWith('/agent') });
            if (effectiveMode === ProcessingMode.AGENT || prompt.startsWith('/agent')) {
                console.log('🚀 Setting up progress streaming for agent mode');
                this.setupProgressStreaming(prompt);
            }

            const options = conversationId ? ["-c", "--cid", conversationId] : [];
            const response = await this.llmService.sendRequest({
                prompt,
                template,
                model,
                options,
                images,
                conversationId,
                signal: this.currentAbortController.signal
            });

            if (response.error) {
                throw new Error(response.error);
            }

            // For agent mode, the response.result includes the formatted result
            // For chat mode, just append normally
            if (effectiveMode === ProcessingMode.AGENT || prompt.startsWith('/agent')) {
                this.finalizeProgressStreaming(prompt, response.result, response.images);
            } else {
                this.appendToChatHistory(prompt, response.result, response.images);
            }

            // Clear inputs (matching original behavior)
            this.inputArea.setPromptValue('');
            this.inputArea.setPatternValue('');
            this.inputArea.clearImages();

            // Clean up temporary screenshot files
            const screenshotPaths = this.imageService.getScreenshotPaths(images);
            await this.imageService.cleanupScreenshots(screenshotPaths);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request was cancelled by user');
                this.inputArea.showCancelled();
                new Notice('Request cancelled');
            } else {
                console.error('Failed to get LLM response:', error);
                new Notice('Failed to get LLM response. Please try again.');
            }
        } finally {
            this.currentAbortController = undefined;
            this.setLoading(false);
        }
    }

    /**
     * Set up progress streaming for agent mode
     */
    private setupProgressStreaming(prompt: string) {
        console.log('🚀 setupProgressStreaming called with prompt:', prompt.substring(0, 50) + '...');
        
        // Add the user message immediately
        this.chatHistory.addMessage({
            id: `user-${Date.now()}`,
            type: 'user',
            content: prompt,
            timestamp: new Date()
        });
        console.log('✅ User message added to chat history');

        // Create and add initial progress message
        this.currentProgressMessage = this.chatHistory.addProgressMessage('🚀 **Agent Started**\nAnalyzing request and planning approach...\n\n');
        console.log('✅ Progress message created:', !!this.currentProgressMessage);
        

        // Set up progress callback
        this.llmService.setProgressCallback((event: AgentProgressEvent) => {
            console.log('📝 Progress event received:', event.type, event.step);
            this.handleProgressUpdate(event);
        });
        console.log('✅ Progress callback set on LLM service');
    }

    /**
     * Handle progress updates during agent execution
     */
    private handleProgressUpdate(event: AgentProgressEvent) {
        console.log('🔄 handleProgressUpdate called:', event.type, event.step, !!this.currentProgressMessage);
        
        if (!this.currentProgressMessage) {
            console.error('❌ No currentProgressMessage found for progress update');
            return;
        }

        let progressText = '';

        switch (event.type) {
            case 'step_start':
                progressText += `🤔 **Step ${event.step}${event.data.progress ? ` - ${event.data.progress}` : ''}**\n`;
                progressText += `${event.data.description}\n\n`;
                break;
            
            case 'reasoning_complete':
                progressText += `💭 **Reasoning**: ${event.data.reasoning}\n`;
                progressText += `📊 **Goal Status**: ${event.data.goalStatus}\n`;
                progressText += `🎯 **Decision**: ${event.data.decision}\n`;
                if (event.data.nextAction !== 'None') {
                    progressText += `🛠️ **Next Action**: ${event.data.nextAction}\n`;
                }
                progressText += '\n';
                break;
            
            case 'action_start':
                progressText += `🔧 **Executing**: ${event.data.tool} (${event.data.server})\n`;
                progressText += `📝 **Purpose**: ${event.data.justification}\n\n`;
                break;
            
            case 'action_complete':
                const status = event.data.success ? '✅' : '❌';
                progressText += `${status} **${event.data.tool}** - `;
                if (event.data.result.length > 100) {
                    progressText += `${event.data.result.substring(0, 100)}...\n`;
                    progressText += `<details><summary>📄 Full Result (${event.data.result.length} chars)</summary>\n\n${event.data.result}\n</details>\n\n`;
                } else {
                    progressText += `${event.data.result}\n\n`;
                }
                break;
        }

        console.log('📝 Progress text generated:', progressText.length > 0 ? progressText.substring(0, 100) + '...' : '(empty)');

        if (progressText) {
            this.updateProgress(progressText);
        } else {
            console.log('⚠️ No progress text generated for event type:', event.type);
        }
    }

    /**
     * Update progress message immediately
     */
    private updateProgress(progressText: string) {
        // Ensure the progress message element still exists and is visible
        if (!this.currentProgressMessage || !this.currentProgressMessage.isConnected) {
            console.log('⚠️ Progress message element not found or disconnected from DOM');
            return;
        }

        try {
            this.chatHistory.appendToProgressMessage(this.currentProgressMessage!, progressText);
        } catch (error) {
            console.error('❌ Failed to update progress message:', error);
        }
    }

    /**
     * Finalize progress streaming with final result
     */
    private finalizeProgressStreaming(prompt: string, result: string, images?: string[]) {
        if (this.currentProgressMessage) {
            // Add completion indicator only (final result will be in dedicated section)
            const completionText = `\n---\n\n✅ **Task Completed Successfully**`;
            this.chatHistory.appendToProgressMessage(this.currentProgressMessage, completionText);
            
            // Add integrated action buttons to the progress message
            this.chatHistory.addProgressMessageActions(this.currentProgressMessage, result, images);
            
            this.currentProgressMessage = undefined;
        } else {
            // Fallback to normal chat history
            this.appendToChatHistory(prompt, result, images);
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
            const results = await this.llmService.performTavilySearch(query, this.currentAbortController?.signal);
            const searchResult = JSON.stringify(results, null, 2);

            // Display search query and results in chat
            this.appendToChatHistory(`@tavily ${query}`, searchResult);
            this.inputArea.setPromptValue('');
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Tavily search was cancelled by user');
                this.inputArea.showCancelled();
                new Notice('Tavily search cancelled');
            } else {
                console.error('Failed to perform Tavily search:', error);
                new Notice('Failed to perform Tavily search. Please check your API key and try again.');
            }
        }
    }

    private async performWebScrape(url: string) {
        try {
            const content = await this.llmService.scrapeWebContent(url, this.currentAbortController?.signal);

            // Instead of just displaying content, send it to LLM
            await this.processLLMRequest(content);
            this.inputArea.setPromptValue('');
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Web scrape was cancelled by user');
                this.inputArea.showCancelled();
                new Notice('Web scrape cancelled');
            } else {
                console.error('Failed to scrape web content:', error);
                new Notice('Failed to scrape web content. Please check the URL and try again.');
            }
        }
    }

    /**
     * Cancel the current request
     */
    private cancelCurrentRequest() {
        if (this.currentAbortController) {
            console.log('Cancelling current request...');
            this.currentAbortController.abort();
        }
    }

    private appendToChatHistory(prompt: string, response: string, images?: string[]) {
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
            timestamp: new Date(),
            images: images
        };

        this.chatHistory.addMessage(userMessage, (content) => content);
        this.chatHistory.addMessage(assistantMessage, (content) => this.plugin.renderMarkdown(content));
    }
}
