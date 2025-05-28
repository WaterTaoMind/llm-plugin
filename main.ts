import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, Notice, ItemView, MarkdownView } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SendIcon, CopyClipboardIcon, SaveAsNoteIcon, UserIcon, ChatbotIcon, PlusIcon, GetCidIcon, PrependNoteIcon, InsertNoteIcon } from './Icons';
import MarkdownIt from 'markdown-it';

const execAsync = promisify(exec);
const SCREENSHOT_FOLDER = "llm_screenshots";

interface FileWithPath extends File {
    path?: string;
}

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
        
        // Configure MarkdownIt to add copy buttons to code blocks, diagrams, and SVG content
        this.configureCopyableBlocks();

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
        
        // Add CSS for copyable blocks
        this.addCopyableBlocksStyles();
        
        // Add CSS for image previews
        this.addImagePreviewStyles();
        
        // Set up the click event handler for the action buttons
        this.registerDomEvent(document, 'click', this.handleBlockButtonClick.bind(this));
    }

    private handleBlockButtonClick(event: MouseEvent) {
        // Use event delegation to handle clicks
        const target = event.target as HTMLElement;
        const button = target.closest('.llm-block-action') as HTMLElement;
        
        if (!button) return;
        
        // Prevent the event from bubbling to avoid multiple triggers
        event.stopPropagation();
        event.preventDefault();
        
        // Check if this button is currently being processed
        if (button.hasAttribute('data-processing')) return;
        
        // Mark button as processing
        button.setAttribute('data-processing', 'true');
        
        // Get the action and content
        const action = button.getAttribute('data-action');
        const content = button.getAttribute('data-content');
        
        if (!action || !content) {
            button.removeAttribute('data-processing');
            return;
        }
        
        // Add visual feedback
        button.classList.add('copied');
        
        // Get the plugin view
        const activeLeaves = this.app.workspace.getLeavesOfType('llm-view');
        const view = activeLeaves.length > 0 ? activeLeaves[0].view as LLMView : null;
        
        // Execute the appropriate action
        const cleanup = () => {
            setTimeout(() => {
                button.classList.remove('copied');
                button.removeAttribute('data-processing');
            }, 1000);
        };
        
        try {
            switch (action) {
                case 'copy':
                    navigator.clipboard.writeText(content)
                        .then(() => {
                            new Notice('Copied to clipboard');
                            cleanup();
                        })
                        .catch(err => {
                            console.error('Failed to copy:', err);
                            new Notice('Failed to copy to clipboard');
                            cleanup();
                        });
                    break;
                    
                case 'insert':
                    if (view) {
                        view.insertAtCursor(content)
                            .then(() => cleanup())
                            .catch(() => {
                                new Notice('Failed to insert at cursor');
                                cleanup();
                            });
                    } else {
                        new Notice('LLM view not found');
                        cleanup();
                    }
                    break;
                    
                case 'prepend':
                    if (view) {
                        view.prependToCurrentNote(content)
                            .then(() => cleanup())
                            .catch(() => {
                                new Notice('Failed to prepend to note');
                                cleanup();
                            });
                    } else {
                        new Notice('LLM view not found');
                        cleanup();
                    }
                    break;
                    
                case 'append':
                    if (view) {
                        view.appendToCurrentNote(content)
                            .then(() => cleanup())
                            .catch(() => {
                                new Notice('Failed to append to note');
                                cleanup();
                            });
                    } else {
                        new Notice('LLM view not found');
                        cleanup();
                    }
                    break;
                    
                default:
                    console.warn('Unknown action:', action);
                    cleanup();
                    break;
            }
        } catch (error) {
            console.error('Error handling button click:', error);
            new Notice('An error occurred');
            cleanup();
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

    private configureCopyableBlocks() {
        // Store the original fence renderer
        const originalFenceRenderer = this.md.renderer.rules.fence;
        
        // Replace the fence renderer with our custom one
        this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const content = token.content;
            const langName = token.info.trim() || '';
            
            // Generate the original HTML for the code block
            let originalHtml = '';
            if (originalFenceRenderer) {
                originalHtml = originalFenceRenderer(tokens, idx, options, env, self);
            } else {
                originalHtml = self.renderToken(tokens, idx, options);
            }
            
            // Determine the block type based on the language
            let blockType = 'code';
            if (langName.match(/^(plantuml|mermaid|graph)$/i)) {
                blockType = 'diagram';
            } else if (langName.match(/^svg$/i) || content.trim().startsWith('<svg')) {
                blockType = 'svg';
            }
            
            // Create a wrapper with buttons that use data attributes instead of onclick
            return `
                <div class="llm-copyable-block llm-${blockType}-block">
                    ${originalHtml}
                    <div class="llm-block-toolbar">
                        <button class="llm-block-action" data-action="copy" data-content="${this.escapeHtml(content)}" title="Copy to clipboard">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                        <button class="llm-block-action" data-action="insert" data-content="${this.escapeHtml(content)}" title="Insert at cursor">
                            ${InsertNoteIcon}
                        </button>
                        <button class="llm-block-action" data-action="prepend" data-content="${this.escapeHtml(content)}" title="Prepend to note">
                            ${PrependNoteIcon}
                        </button>
                        <button class="llm-block-action" data-action="append" data-content="${this.escapeHtml(content)}" title="Append to note">
                            ${SaveAsNoteIcon}
                        </button>
                    </div>
                </div>
            `;
        };
        
        // Store the original html_block renderer
        const originalHtmlBlockRenderer = this.md.renderer.rules.html_block;
        
        // Replace the html_block renderer with our custom one
        this.md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const content = token.content;
            
            // Generate the original HTML 
            let originalHtml = '';
            if (originalHtmlBlockRenderer) {
                originalHtml = originalHtmlBlockRenderer(tokens, idx, options, env, self);
            } else {
                originalHtml = content;
            }
            
            // Check if this looks like SVG content
            let blockType = 'html';
            if (content.trim().match(/<svg\s/i)) {
                blockType = 'svg';
            } else if (content.trim().match(/<(div|span)\s+class="[^"]*mermaid[^"]*"/i)) {
                blockType = 'diagram';
            }
            
            // Only add toolbar for specific HTML block types
            if (blockType === 'svg' || blockType === 'diagram') {
                return `
                    <div class="llm-copyable-block llm-${blockType}-block">
                        ${originalHtml}
                        <div class="llm-block-toolbar">
                            <button class="llm-block-action" data-action="copy" data-content="${this.escapeHtml(content)}" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                            <button class="llm-block-action" data-action="insert" data-content="${this.escapeHtml(content)}" title="Insert at cursor">
                                ${InsertNoteIcon}
                            </button>
                            <button class="llm-block-action" data-action="prepend" data-content="${this.escapeHtml(content)}" title="Prepend to note">
                                ${PrependNoteIcon}
                            </button>
                            <button class="llm-block-action" data-action="append" data-content="${this.escapeHtml(content)}" title="Append to note">
                                ${SaveAsNoteIcon}
                            </button>
                        </div>
                    </div>
                `;
            }
            
            // Return the original HTML for other HTML blocks
            return originalHtml;
        };
        
        // Add support for tables
        const originalTableRenderer = this.md.renderer.rules.table_open;
        
        this.md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
            // Find the table_close token
            let closeIdx = idx;
            while (closeIdx < tokens.length && (tokens[closeIdx].type !== 'table_close')) {
                closeIdx++;
            }
            
            // Instead of custom rendering, let markdown-it handle the table normally
            // Just collect all the tokens and ensure the token stream stays intact
            const tableTokens = tokens.slice(idx, closeIdx + 1);
            
            // Generate a copy of the table content for our toolbar actions
            let tableText = '';
            let rowContent = [];
            let inRow = false;
            
            for (let i = 0; i < tableTokens.length; i++) {
                const token = tableTokens[i];
                
                if (token.type === 'tr_open') {
                    inRow = true;
                    rowContent = [];
                } else if (token.type === 'tr_close') {
                    inRow = false;
                    tableText += rowContent.join('\t') + '\n';
                } else if ((token.type === 'th_open' || token.type === 'td_open') && i + 1 < tableTokens.length) {
                    const contentToken = tableTokens[i + 1];
                    if (contentToken.type === 'inline' && contentToken.content) {
                        rowContent.push(contentToken.content);
                    }
                }
            }
            
            // Start a wrapper div before the table
            // Note: We're only handling the table_open tag here
            return `<div class="llm-copyable-block llm-table-block">` +
                (originalTableRenderer ? originalTableRenderer(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options));
        };
        
        // Add a hook for table_close to close our wrapper and add the toolbar
        const originalTableCloseRenderer = this.md.renderer.rules.table_close;
        
        this.md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
            // Get the table text from our data we collected during table_open
            const tableTokens = tokens.slice(0, idx + 1);
            let tableText = '';
            let rowContent = [];
            let inRow = false;
            
            for (let i = 0; i < tableTokens.length; i++) {
                const token = tableTokens[i];
                
                if (token.type === 'tr_open') {
                    inRow = true;
                    rowContent = [];
                } else if (token.type === 'tr_close') {
                    inRow = false;
                    tableText += rowContent.join('\t') + '\n';
                } else if ((token.type === 'th_open' || token.type === 'td_open') && i + 1 < tableTokens.length) {
                    const contentToken = tableTokens[i + 1];
                    if (contentToken.type === 'inline' && contentToken.content) {
                        rowContent.push(contentToken.content);
                    }
                }
            }
            
            // Render the normal table close tag
            const closeTag = originalTableCloseRenderer 
                ? originalTableCloseRenderer(tokens, idx, options, env, self) 
                : self.renderToken(tokens, idx, options);
                
            // After table close, add toolbar and close wrapper div
            return closeTag + `
                <div class="llm-block-toolbar">
                    <button class="llm-block-action" data-action="copy" data-content="${this.escapeHtml(tableText)}" title="Copy table data">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    </button>
                    <button class="llm-block-action" data-action="insert" data-content="${this.escapeHtml(tableText)}" title="Insert at cursor">
                        ${InsertNoteIcon}
                    </button>
                    <button class="llm-block-action" data-action="prepend" data-content="${this.escapeHtml(tableText)}" title="Prepend to note">
                        ${PrependNoteIcon}
                    </button>
                    <button class="llm-block-action" data-action="append" data-content="${this.escapeHtml(tableText)}" title="Append to note">
                        ${SaveAsNoteIcon}
                    </button>
                </div>
            </div>`;
        };
    }
    
    private addCopyableBlocksStyles() {
        const styleEl = document.createElement('style');
        styleEl.id = 'llm-copyable-blocks-styles';
        styleEl.textContent = `
            .llm-copyable-block {
                position: relative;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin: 0.75em 0;
                overflow: auto;
                padding: 0.25em 0;
                transition: box-shadow 0.2s ease-in-out;
            }
            
            .llm-copyable-block:hover {
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
            }
            
            .llm-copyable-block pre {
                margin: 0;
                padding-right: 30px;
                padding-bottom: 35px;
            }
            
            /* Toolbar styling */
            .llm-block-toolbar {
                position: absolute;
                bottom: 6px;
                right: 6px;
                display: flex;
                flex-direction: row;
                gap: 4px;
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 2px;
                opacity: 0;
                transform: translateX(10px);
                transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
                z-index: 10;
            }
            
            .llm-copyable-block:hover .llm-block-toolbar {
                opacity: 0.9;
                transform: translateX(0);
            }
            
            /* On touch devices, always show the toolbar (no hover) */
            @media (hover: none) {
                .llm-block-toolbar {
                    opacity: 0.9;
                    transform: translateX(0);
                    background: var(--background-secondary);
                }
            }
            
            /* Individual action buttons */
            .llm-block-action {
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                border-radius: 3px;
                padding: 4px;
                cursor: pointer;
                color: var(--text-normal);
                transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
                position: relative;
            }
            
            .llm-block-action:hover {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
            }
            
            /* Add a tooltip on hover */
            .llm-block-action:hover::after {
                content: attr(title);
                position: absolute;
                top: -25px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--background-modifier-border);
                color: var(--text-normal);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 100;
            }
            
            .llm-block-action.copied {
                background-color: var(--interactive-success);
                color: var(--text-on-accent);
            }
            
            .llm-block-action svg {
                display: block;
                width: 16px;
                height: 16px;
            }
            
            /* Make buttons slightly larger on touch devices */
            @media (hover: none) {
                .llm-block-action {
                    padding: 6px;
                }
                
                .llm-block-action svg {
                    width: 18px;
                    height: 18px;
                }
            }
            
            /* Styling for the message action buttons */
            .llm-message-actions {
                display: flex;
                flex-direction: row;
                gap: 6px;
                margin-top: 8px;
                padding: 0 8px;
            }
            
            .llm-message-actions .llm-block-action {
                padding: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s ease;
            }
            
            .llm-message-actions .llm-block-action:hover {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
            }
            
            .llm-message-actions .llm-block-action.copied {
                background-color: var(--interactive-success);
                color: var(--text-on-accent);
            }
            
            .llm-code-block {
                background: var(--code-background);
                padding: 0;
            }
            
            .llm-code-block code {
                white-space: pre;
            }
            
            .llm-diagram-block {
                background: var(--background-primary-alt);
                padding: 8px;
            }
            
            .llm-svg-block {
                background: white;
                padding: 8px;
                display: flex;
                justify-content: center;
            }
            
            /* Table styling */
            .llm-table-block {
                background: var(--background-primary);
                padding: 0;
                overflow-x: auto;
            }
            
            .llm-table-block table {
                width: 100%;
                border-collapse: collapse;
                margin: 0;
                table-layout: auto;
                min-width: max-content;
            }
            
            .llm-table-block th {
                background-color: var(--background-secondary);
                padding: 6px 10px;
                text-align: left;
                font-weight: bold;
            }
            
            .llm-table-block td {
                padding: 6px 10px;
                border-top: 1px solid var(--background-modifier-border);
            }
            
            .llm-table-block tr:nth-child(2n) {
                background-color: var(--background-secondary-alt);
            }
            
            /* Ensure proper display of Mermaid diagrams */
            .llm-diagram-block .mermaid {
                display: flex;
                justify-content: center;
                padding: 8px 0;
            }
            
            /* Fix for Firefox to ensure buttons are visible */
            @-moz-document url-prefix() {
                .llm-block-toolbar {
                    position: absolute;
                    bottom: 6px;
                    right: 6px;
                }
            }
            
            /* Fix for Safari */
            @media not all and (min-resolution:.001dpcm) {
                @supports (-webkit-appearance:none) {
                    .llm-block-toolbar {
                        position: fixed;
                        position: absolute;
                        bottom: 6px;
                        right: 6px;
                    }
                }
            }
            
            /* Screenshot drag and drop styles */
            .llm-prompt-input.drag-over {
                border: 2px dashed var(--interactive-accent);
                background-color: var(--background-primary-alt);
            }
            
            /* Image input styling */
            .llm-image-input {
                border: 1px solid var(--background-modifier-border);
                transition: border-color 0.2s ease;
            }
            
            .llm-image-input.has-image {
                border-color: var(--interactive-accent);
                background-color: var(--background-primary-alt);
            }
            
            .llm-image-input.data-url-image {
                border-left: 3px solid var(--interactive-success);
            }
            
            .llm-image-input.path-image {
                border-left: 3px solid var(--interactive-accent);
            }
            
            .llm-image-input.invalid-image {
                border-color: var(--text-error);
                border-left: 3px solid var(--text-error);
            }
        `;
        document.head.appendChild(styleEl);
    }
    
    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    private decodeHtml(html: string): string {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    }

    async onunload() {
        console.log('Unloading LLM plugin');
        
        // We don't need to explicitly remove event listeners registered with registerDomEvent
        // as they get cleaned up automatically when the plugin is unloaded
        
        // Remove any added styles
        const styleEl = document.getElementById('llm-copyable-blocks-styles');
        if (styleEl) {
            styleEl.remove();
        }
    }

    // Add CSS styles for image previews
    private addImagePreviewStyles() {
        const styleEl = document.createElement('style');
        styleEl.id = 'llm-image-preview-styles';
        styleEl.textContent = `
            .llm-image-previews {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 8px;
                min-height: 0;
                transition: all 0.2s ease;
            }
            
            .llm-image-preview-wrapper {
                position: relative;
                width: 60px;
                height: 60px;
                border-radius: 4px;
                overflow: hidden;
                border: 1px solid var(--background-modifier-border);
            }
            
            .llm-image-thumbnail {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .llm-image-delete-btn {
                position: absolute;
                top: 2px;
                right: 2px;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.5);
                color: white;
                font-size: 16px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: none;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }
            
            .llm-image-delete-btn:hover {
                opacity: 1;
            }
        `;
        document.head.appendChild(styleEl);
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
    private attachedImages: string[] = []; // Array to store image paths internally
    private commands = [
        { name: '@web', description: 'Scrape content from a URL' },
        { name: '@tavily', description: 'Search using Tavily API' },
        { name: '@youtube', description: 'Get YouTube video transcript' },
        { name: '@note', description: 'Read current note content' },
        { name: '@clipboard', description: 'Read from clipboard' }
    ];
    private dropdown: HTMLElement | null = null;

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
        // Keep the input container visible to allow manual file path entry
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
            placeholder: 'Type your message here... (drop screenshots here)',
            cls: 'llm-prompt-input'
        });

        // Add drag and drop event handlers for screenshots
        this.promptInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.promptInput.classList.add('drag-over');
        });
        
        this.promptInput.addEventListener('dragleave', () => {
            this.promptInput.classList.remove('drag-over');
        });
        
        this.promptInput.addEventListener('drop', (e) => {
            e.preventDefault();
            this.promptInput.classList.remove('drag-over');
            
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                this.handleDroppedScreenshots(e.dataTransfer.files);
            }
        });

        this.promptInput.addEventListener('input', ((e: Event) => {
            this.handlePromptInput(e as InputEvent);
        }) as EventListener);
        this.promptInput.addEventListener('keydown', (e) => this.handlePromptKeydown(e));

        this.sendButton = promptInputContainer.createEl('button', {
            cls: 'llm-send-button'
        });
        this.sendButton.innerHTML = SendIcon;
        this.sendButton.addEventListener('click', () => this.sendMessage());

        this.chatHistory = chatContainer.createDiv({ cls: 'llm-chat-history' });
    }

    // Render image previews for dropped screenshots
    private renderImagePreviews() {
        // Find or create the preview container
        let previewContainer = document.querySelector('.llm-image-previews') as HTMLElement;
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.className = 'llm-image-previews';
            this.promptInput.parentElement?.insertBefore(previewContainer, this.promptInput);
        }
        
        // Clear existing previews
        previewContainer.empty();
        
        // Create preview for each image
        this.attachedImages.forEach((imagePath, index) => {
            const previewWrapper = previewContainer.createDiv({ cls: 'llm-image-preview-wrapper' });
            
            // Create image thumbnail
            const img = previewWrapper.createEl('img', { cls: 'llm-image-thumbnail' });
            
            // For data URLs, set src directly
            if (imagePath.startsWith('data:')) {
                img.src = imagePath;
            } else {
                // For file paths, create a thumbnail or placeholder
                // Note: We use a placeholder SVG for file paths as Obsidian may restrict direct access
                img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
            }
            
            // Add delete button
            const deleteButton = previewWrapper.createEl('button', { cls: 'llm-image-delete-btn' });
            deleteButton.innerHTML = '×';
            deleteButton.onclick = () => {
                this.attachedImages.splice(index, 1);
                this.renderImagePreviews();
            };
        });
        
        // Show/hide the container based on whether there are images
        if (this.attachedImages.length > 0) {
            previewContainer.style.display = 'flex';
        } else {
            previewContainer.style.display = 'none';
        }
    }

    private handleDroppedScreenshots(files: FileList) {
        // Check if adding these files would exceed the limit
        if (this.attachedImages.length + files.length > 5) {
            new Notice('Maximum of 5 images allowed');
            return;
        }
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i] as FileWithPath;
            if (file.type.startsWith('image/')) {
                // Save the file to vault and use the path
                this.saveScreenshotToVault(file).then(filePath => {
                    if (filePath) {
                        // Add to our internal array instead of input fields
                        this.attachedImages.push(filePath);
                        this.renderImagePreviews();
                        new Notice('Image added');
                    }
                }).catch(error => {
                    console.error('Failed to process screenshot:', error);
                    new Notice('Failed to process screenshot');
                    
                    // Fallback to data URL if saving fails
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const dataUrl = e.target?.result as string;
                        this.attachedImages.push(dataUrl);
                        this.renderImagePreviews();
                    };
                    reader.readAsDataURL(file);
                });
            }
        }
    }
    
    // Helper method to process image input consistently
    private processImageInput(imagePath: string, existingInput?: HTMLInputElement) {
        if (!imagePath) return;
        
        // Get all image inputs
        const imageInputs = Array.from(this.imageInput?.parentNode?.children || []) as HTMLInputElement[];
        
        let updatedInput: HTMLInputElement | null = null;
        
        if (existingInput) {
            // Use the provided empty input
            existingInput.value = imagePath;
            updatedInput = existingInput;
        } else if (imageInputs.some(input => input.value === '')) {
            // Find any empty input if not provided
            const emptyInput = imageInputs.find(input => input.value === '');
            if (emptyInput) {
                emptyInput.value = imagePath;
                updatedInput = emptyInput;
            }
        } else if (imageInputs.length < 5) {
            // Create a new input if we have less than 5
            this.addImageInput();
            
            // Get the newly created input
            const newInputs = Array.from(this.imageInput?.parentNode?.children || []) as HTMLInputElement[];
            const newInput = newInputs[newInputs.length - 1];
            
            if (newInput) {
                newInput.value = imagePath;
                updatedInput = newInput;
            }
        } else {
            new Notice('Maximum of 5 images allowed');
            return;
        }
        
        // Add a visual indicator for the image input
        if (updatedInput) {
            // Add the 'has-image' class to show it contains an image
            updatedInput.classList.add('has-image');
            
            // If it's a data URL, add a specific class
            if (imagePath.startsWith('data:image/')) {
                updatedInput.classList.add('data-url-image');
            } else {
                updatedInput.classList.add('path-image');
            }
        }
        
        // Update UI
        this.updateAddImageButtonVisibility();
        new Notice('Image added to message');
    }

    private addImageInput() {
        if (this.imageInput && this.imageInput.parentNode) {
            const imageInput = this.imageInput.parentNode.createEl('input', {
                type: 'text',
                placeholder: 'Enter image path',
                cls: 'llm-image-input'
            });
            
            // Add improved input validation without adding to attachedImages
            imageInput.addEventListener('input', () => {
                this.updateAddImageButtonVisibility();
                
                // Validate and style based on input content
                const value = imageInput.value.trim();
                
                // Remove existing classes
                imageInput.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');
                
                if (value) {
                    if (value.startsWith('data:image/')) {
                        // Valid data URL
                        imageInput.classList.add('has-image', 'data-url-image');
                    } else if (value.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
                        // Path appears to be an image file
                        imageInput.classList.add('has-image', 'path-image');
                    } else {
                        // Possibly invalid image path
                        imageInput.classList.add('invalid-image');
                    }
                }
            });
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
        let prompt = this.promptInput.value.trim();

        // Inline @-command replacement (minimal, incremental)
        // Only replace if @note or @clipboard appears anywhere in the prompt
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

        // YouTube command with optional user prompt
        const youtubeMatch = prompt.match(/^@youtube\s+(.+?)(?:\s+(.+))?$/i);
        if (youtubeMatch) {
            try {
                const url = youtubeMatch[1].trim();
                const response = await fetch(`${this.plugin.settings.llmConnectorApiUrl}/yt`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-API-Key': this.plugin.settings.llmConnectorApiKey
                    },
                    body: JSON.stringify({ 
                        url: url,
                        stream: false 
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                if (data.transcript) {
                    await this.processLLMRequest(data.transcript);
                    this.promptInput.value = '';
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
                const text = await navigator.clipboard.readText();
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
            
            // Instead of just displaying content, send it to LLM
            await this.processLLMRequest(content);
            this.promptInput.value = '';
        } catch (error) {
            console.error('Failed to scrape web content:', error);
            new Notice('Failed to scrape web content. Please check the URL and try again.');
        }
    }

    private async runLLM(prompt: string, template: string, model: string, options: string[], images: string[]): Promise<string> {
        try {
            // Process images to ensure compatibility with the API
            const processedImages = images.map(image => {
                // Keep data URLs and valid file paths as they are
                return image;
            });
            
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
                    images: processedImages
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
        
        // Add action container for user message
        const promptActionContainer = promptEl.createDiv({ cls: 'llm-message-actions' });
        
        // Add copy button for user message
        const promptCopyButton = promptActionContainer.createEl('button', { cls: 'llm-block-action' });
        promptCopyButton.setAttribute('title', 'Copy to clipboard');
        promptCopyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        promptCopyButton.onclick = () => {
            navigator.clipboard.writeText(prompt);
            promptCopyButton.classList.add('copied');
            new Notice('Copied to clipboard');
            setTimeout(() => promptCopyButton.classList.remove('copied'), 1000);
        };

        const responseEl = this.chatHistory.createDiv({ cls: 'llm-chat-message llm-chat-ai-message' });
        responseEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${ChatbotIcon}</div>
                <div class="llm-chat-text">${this.plugin.renderMarkdown(response)}</div>
            </div>
        `;
        
        const actionContainer = responseEl.createDiv({ cls: 'llm-message-actions' });
        
        // Updated copy button to match block-specific copy buttons
        const copyButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
        copyButton.setAttribute('title', 'Copy to clipboard');
        copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        copyButton.onclick = () => {
            navigator.clipboard.writeText(response);
            copyButton.classList.add('copied');
            new Notice('Copied to clipboard');
            setTimeout(() => copyButton.classList.remove('copied'), 1000);
        };

        // Updated insert button
        const insertButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
        insertButton.setAttribute('title', 'Insert at cursor');
        insertButton.innerHTML = InsertNoteIcon;
        insertButton.onclick = () => {
            this.insertAtCursor(response).then(() => {
                insertButton.classList.add('copied');
                setTimeout(() => insertButton.classList.remove('copied'), 1000);
            });
        };

        // Updated prepend button
        const prependButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
        prependButton.setAttribute('title', 'Prepend to note');
        prependButton.innerHTML = PrependNoteIcon;
        prependButton.onclick = () => {
            this.prependToCurrentNote(response).then(() => {
                prependButton.classList.add('copied');
                setTimeout(() => prependButton.classList.remove('copied'), 1000);
            });
        };

        // Updated append button
        const appendButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
        appendButton.setAttribute('title', 'Append to note');
        appendButton.innerHTML = SaveAsNoteIcon;
        appendButton.onclick = () => {
            this.appendToCurrentNote(response).then(() => {
                appendButton.classList.add('copied');
                setTimeout(() => appendButton.classList.remove('copied'), 1000);
            });
        };

        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    public async appendToCurrentNote(text: string): Promise<boolean> {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            await this.app.vault.append(activeFile, '\n\n' + text);
            new Notice('Appended to current note');
            return Promise.resolve(true);
        } else {
            new Notice('No active note to append to');
            return Promise.resolve(false);
        }
    }

    public async prependToCurrentNote(text: string): Promise<boolean> {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const currentContent = await this.app.vault.read(activeFile);
            await this.app.vault.modify(activeFile, text + '\n\n' + currentContent);
            new Notice('Prepended to current note');
            return Promise.resolve(true);
        } else {
            new Notice('No active note to prepend to');
            return Promise.resolve(false);
        }
    }

    public async insertAtCursor(text: string): Promise<boolean> {
        // Get the most recent leaf
        let leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) {
            new Notice("No active note found.");
            return Promise.resolve(false);
        }

        // Ensure we're working with a markdown view
        if (!(leaf.view instanceof MarkdownView)) {
            leaf = this.app.workspace.getLeaf(false);
            await leaf.setViewState({ 
                type: "markdown", 
                state: leaf.view.getState() 
            });
        }

        // Double check we have a markdown view
        if (!(leaf.view instanceof MarkdownView)) {
            new Notice("Failed to open a markdown view.");
            return Promise.resolve(false);
        }

        // Insert the text at cursor position
        const editor = leaf.view.editor;
        const cursor = editor.getCursor();
        editor.replaceRange(text, cursor);
        new Notice('Inserted at cursor position');
        return Promise.resolve(true);
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
        
        // Get all images from both sources - manually entered paths and screenshots
        const manualImagePaths = Array.from(this.imageInput?.parentNode?.children || [])
            .map(input => (input as HTMLInputElement).value)
            .filter(path => path.trim() !== '');
            
        // Combine with drag-dropped images
        const images = [...this.attachedImages, ...manualImagePaths];
        
        // Store screenshot paths for cleanup later
        const screenshotPaths = images.filter(path => {
            // Check for both absolute paths containing our folder name
            // and relative paths starting with our folder name
            const isAbsolutePath = path.includes(`/${SCREENSHOT_FOLDER}/`) || 
                                 path.includes(`\\${SCREENSHOT_FOLDER}\\`);
            const isRelativePath = path.startsWith(SCREENSHOT_FOLDER);
            
            return isAbsolutePath || isRelativePath;
        });

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
            
            // Clear both image sources
            this.attachedImages = [];
            this.renderImagePreviews();
            
            // Clear image inputs (manually entered paths)
            if (this.imageInput && this.imageInput.parentNode) {
                Array.from(this.imageInput.parentNode.children).forEach(input => {
                    const imgInput = input as HTMLInputElement;
                    imgInput.value = '';
                    imgInput.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');
                });
            }
            
            // Clean up temporary screenshot files
            this.cleanupScreenshots(screenshotPaths);
            
            this.updateAddImageButtonVisibility();
        } catch (error) {
            console.error('Failed to get LLM response:', error);
            new Notice('Failed to get LLM response. Please try again.');
        }
    }
    
    // Helper method to clean up temporary screenshot files
    private async cleanupScreenshots(paths: string[]) {
        for (const path of paths) {
            try {
                // First, check if this is an absolute path
                if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
                    // Extract just the filename from the absolute path
                    const filename = path.split('/').pop();
                    if (filename) {
                        const relativePath = `${SCREENSHOT_FOLDER}/${filename}`;
                        if (await this.app.vault.adapter.exists(relativePath)) {
                            await this.app.vault.adapter.remove(relativePath);
                        }
                    }
                } 
                // Handle relative path
                else if (path.startsWith(SCREENSHOT_FOLDER) && await this.app.vault.adapter.exists(path)) {
                    await this.app.vault.adapter.remove(path);
                }
            } catch (error) {
                console.error(`Failed to remove temporary screenshot: ${path}`, error);
            }
        }
    }

    private handlePromptInput(e: InputEvent) {
        const target = e.target as HTMLTextAreaElement;
        const cursorPosition = target.selectionStart;
        const textBeforeCursor = target.value.substring(0, cursorPosition);
        
        if (textBeforeCursor.endsWith('@')) {
            this.showCommandDropdown();
        } else {
            this.hideCommandDropdown();
        }
    }

    private handlePromptKeydown(e: KeyboardEvent) {
        if (!this.dropdown) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            // Handle selection
        } else if (e.key === 'Enter' && this.dropdown.style.display !== 'none') {
            e.preventDefault();
            const selected = this.dropdown.querySelector('.selected');
            if (selected) {
                this.insertCommand(selected.textContent || '');
            }
        } else if (e.key === 'Escape') {
            this.hideCommandDropdown();
        }
    }

    private showCommandDropdown() {
        if (!this.dropdown) {
            this.dropdown = document.createElement('div');
            this.dropdown.className = 'llm-command-dropdown';
            this.promptInput.parentElement?.appendChild(this.dropdown);
        }

        const dropdown = this.dropdown;
        if (dropdown) {
            dropdown.style.display = 'block';
            dropdown.style.top = `${this.promptInput.offsetTop - dropdown.offsetHeight}px`;
            dropdown.style.left = `${this.promptInput.offsetLeft}px`;
            
            dropdown.innerHTML = '';
            this.commands.forEach(cmd => {
                const option = document.createElement('div');
                option.className = 'llm-command-option';
                option.textContent = `${cmd.name} - ${cmd.description}`;
                option.onclick = () => this.insertCommand(cmd.name);
                dropdown.appendChild(option);
            });
        }
    }

    private hideCommandDropdown() {
        if (this.dropdown) {
            this.dropdown.style.display = 'none';
        }
    }

    private insertCommand(command: string) {
        const cursorPosition = this.promptInput.selectionStart;
        const textBeforeCursor = this.promptInput.value.substring(0, cursorPosition - 1); // Remove @
        const textAfterCursor = this.promptInput.value.substring(cursorPosition);
        
        this.promptInput.value = textBeforeCursor + command + ' ' + textAfterCursor;
        this.hideCommandDropdown();
        this.promptInput.focus();
    }

    // Save screenshot to vault and return the file path
    private async saveScreenshotToVault(file: FileWithPath): Promise<string | null> {
        try {
            // Create screenshot folder if it doesn't exist
            const folderPath = SCREENSHOT_FOLDER;
            const adapter = this.app.vault.adapter;
            
            // Check if the folder exists, create if not
            if (!(await adapter.exists(folderPath))) {
                await this.app.vault.createFolder(folderPath);
            }
            
            // Create a simple filename based on timestamp and extension
            const extension = file.name?.split('.').pop() || 'png';
            const timestamp = Date.now();
            const filename = `screenshot_${timestamp}.${extension}`;
            const relativePath = `${folderPath}/${filename}`;
            
            // Read file as array buffer
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const arrayBuffer = e.target?.result as ArrayBuffer;
                        // Convert array buffer to binary data
                        const binary = new Uint8Array(arrayBuffer);
                        
                        // Create binary file in vault
                        await this.app.vault.createBinary(relativePath, binary);
                        
                        // Get the absolute path - handle different adapter types safely
                        let absolutePath = relativePath;
                        try {
                            // Try to get the base path if the adapter supports it
                            // @ts-ignore - Some adapters (like in desktop Obsidian) have getBasePath
                            const basePath = this.app.vault.adapter.getBasePath?.();
                            if (basePath) {
                                absolutePath = `${basePath}/${relativePath}`;
                            }
                        } catch (error) {
                            console.warn('Could not get absolute path, using relative path instead:', error);
                        }
                        
                        // Resolve with the path (absolute if available, relative as fallback)
                        resolve(absolutePath);
                    } catch (error) {
                        console.error('Failed to save screenshot:', error);
                        reject(error);
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsArrayBuffer(file);
            });
        } catch (error) {
            console.error('Failed to save screenshot to vault:', error);
            new Notice('Failed to save screenshot to vault');
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
