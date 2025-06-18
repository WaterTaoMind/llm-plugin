import { Plugin, Notice } from 'obsidian';
import { LLMPluginSettings, DEFAULT_SETTINGS } from './types';
import { LLMView } from '../ui/LLMView';
import { LLMSettingTab } from '../ui/SettingsTab';
import { MarkdownProcessor } from '../utils/markdown';
import { StyleManager } from '../ui/styles/StyleManager';

export class LLMPlugin extends Plugin {
    settings: LLMPluginSettings;
    private markdownProcessor: MarkdownProcessor;
    private styleManager: StyleManager;

    async onload() {
        await this.loadSettings();
        await this.ensureDataFile();

        // Initialize core services
        this.markdownProcessor = new MarkdownProcessor();
        this.styleManager = new StyleManager();

        // Setup UI components
        this.setupUI();

        // Apply styles
        this.styleManager.applyStyles();

        // Set up the global click event handler for block action buttons
        this.registerDomEvent(document, 'click', this.handleBlockButtonClick.bind(this));
    }

    private async ensureDataFile() {
        try {
            // Use a simpler approach for file path
            const dataPath = 'data.json';

            // Check if data.json exists in plugin folder
            const exists = await this.app.vault.adapter.exists(dataPath);
            if (!exists) {
                // Create default data.json
                const defaultData = {
                    models: [
                        { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', description: 'Most capable GPT-4 model' },
                        { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', description: 'Faster, cost-effective GPT-4 model' },
                        { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: 'Most intelligent Claude model' },
                        { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'Anthropic', description: 'Fastest Claude model' },
                        { id: 'custom', label: 'Custom Model', provider: 'Custom', description: 'Enter your own model ID' }
                    ],
                    templates: [
                        { id: '', label: 'No Template', description: 'Use without any template' },
                        { id: 'summarize', label: 'Summarize', description: 'Summarize the content concisely' },
                        { id: 'explain', label: 'Explain', description: 'Explain the concept in detail' },
                        { id: 'analyze', label: 'Analyze', description: 'Provide detailed analysis' },
                        { id: 'custom', label: 'Custom Template', description: 'Enter your own template' }
                    ]
                };

                await this.app.vault.adapter.write(dataPath, JSON.stringify(defaultData, null, 2));
                console.log('Created default data.json for LLM plugin');
            }
        } catch (error) {
            console.warn('Could not create data.json file:', error);
        }
    }

    async onunload() {
        console.log('Unloading LLM plugin');
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
    }

    public renderMarkdown(content: string): string {
        return this.markdownProcessor.render(content);
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
