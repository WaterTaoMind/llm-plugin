import { Plugin, Notice } from 'obsidian';
import { LLMPluginSettings, DEFAULT_SETTINGS } from './types';
import { LLMView } from '../ui/LLMView';
import { LLMSettingTab } from '../ui/SettingsTab';
import { MarkdownProcessor } from '../utils/markdown';
import { StyleManager } from '../ui/styles/StyleManager';
import { MCPClientService } from '../services/MCPClientService';

export class LLMPlugin extends Plugin {
    settings: LLMPluginSettings;
    private markdownProcessor: MarkdownProcessor;
    private styleManager: StyleManager;
    mcpClientService: MCPClientService; // Made public for settings access

    async onload() {
        await this.loadSettings();

        // Initialize core services
        this.markdownProcessor = new MarkdownProcessor();
        this.styleManager = new StyleManager();
        this.mcpClientService = new MCPClientService(this.settings, this.app);

        // Initialize MCP client
        try {
            await this.mcpClientService.initialize();
        } catch (error) {
            console.error('Failed to initialize MCP client:', error);
            new Notice('Failed to initialize MCP client. Check console for details.', 5000);
        }

        // Setup UI components
        this.setupUI();

        // Apply styles
        this.styleManager.applyStyles();

        // Set up the global click event handler for block action buttons
        this.registerDomEvent(document, 'click', this.handleBlockButtonClick.bind(this));
    }

    async onunload() {
        console.log('Unloading LLM plugin');

        // Cleanup MCP client
        if (this.mcpClientService) {
            await this.mcpClientService.cleanup();
        }

        this.styleManager.removeStyles();
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

    private setupUI() {
        this.addSettingTab(new LLMSettingTab(this.app, this));

        this.registerView('llm-view', (leaf) => new LLMView(leaf, this));

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

        // Update MCP client settings
        if (this.mcpClientService) {
            this.mcpClientService.updateSettings(this.settings);
        }
    }

    public renderMarkdown(content: string): string {
        return this.markdownProcessor.render(content);
    }

    public getMCPClientService(): MCPClientService {
        return this.mcpClientService;
    }

    private initLeaf(): void {
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
