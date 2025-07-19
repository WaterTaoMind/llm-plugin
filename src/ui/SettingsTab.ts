import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { LLMPlugin } from '../core/LLMPlugin';
import { MCPServerConfig, ProcessingMode, AgentModelConfig } from '../core/types';

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
            .setName('Gemini API Key')
            .setDesc('Enter your Google Gemini API key for image generation capabilities')
            .addText(text => text
                .setPlaceholder('Enter Gemini API Key')
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value;
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

        // Agent Model Configuration Section
        containerEl.createEl('h3', {text: 'Agent Model Configuration'});
        
        new Setting(containerEl)
            .setName('Agent Mode Configuration')
            .setDesc('Single model uses one model for all tasks. Dual model uses separate models for reasoning and processing.')
            .addDropdown(dropdown => {
                dropdown.addOption('single', 'Single Model');
                dropdown.addOption('dual', 'Dual Model');
                dropdown.setValue(this.getAgentConfig().configType);
                dropdown.onChange(async (value) => {
                    await this.updateAgentConfig('configType', value as 'single' | 'dual');
                    this.display(); // Refresh the settings display
                });
            });

        // Conditional settings based on config type
        if (this.getAgentConfig().configType === 'single') {
            new Setting(containerEl)
                .setName('Agent Model')
                .setDesc('Model used for all agent operations')
                .addDropdown(dropdown => {
                    this.populateAgentModelDropdown(dropdown);
                    dropdown.setValue(this.getAgentConfig().singleModel);
                    dropdown.onChange(async (value) => {
                        await this.updateAgentConfig('singleModel', value);
                    });
                });
        } else {
            new Setting(containerEl)
                .setName('Reasoning Model')
                .setDesc('Fast model for reasoning and decision-making')
                .addDropdown(dropdown => {
                    this.populateAgentModelDropdown(dropdown);
                    dropdown.setValue(this.getAgentConfig().dualModel.reasoningModel);
                    dropdown.onChange(async (value) => {
                        await this.updateAgentConfig('dualModel.reasoningModel', value);
                    });
                });
            
            new Setting(containerEl)
                .setName('Processing Model')
                .setDesc('Quality model for processing and summarization')
                .addDropdown(dropdown => {
                    this.populateAgentModelDropdown(dropdown);
                    dropdown.setValue(this.getAgentConfig().dualModel.processingModel);
                    dropdown.onChange(async (value) => {
                        await this.updateAgentConfig('dualModel.processingModel', value);
                    });
                });
        }

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

        // Processing Mode Settings Section
        containerEl.createEl('h3', {text: 'Processing Mode Settings'});

        new Setting(containerEl)
            .setName('Default Processing Mode')
            .setDesc('Choose the default processing mode for new conversations')
            .addDropdown(dropdown => dropdown
                .addOption(ProcessingMode.CHAT, '💬 Chat Mode - Direct LLM processing (fast)')
                .addOption(ProcessingMode.AGENT, '🤖 Agent Mode - ReAct workflow with tools (comprehensive)')
                .setValue(this.plugin.settings.defaultMode)
                .onChange(async (value) => {
                    this.plugin.settings.defaultMode = value as ProcessingMode;
                    await this.plugin.saveSettings();
                    // Note: LLMService will pick up the new default mode on next initialization
                }));

        new Setting(containerEl)
            .setName('Show Mode Selector')
            .setDesc('Display mode selector in chat interface header')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showModeSelector)
                .onChange(async (value) => {
                    this.plugin.settings.showModeSelector = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to update UI
                }));

        new Setting(containerEl)
            .setName('Agent Maximum Steps')
            .setDesc('Maximum number of reasoning steps for Agent mode (default: 20)')
            .addText(text => text
                .setPlaceholder('20')
                .setValue(String(this.plugin.settings.agentMaxSteps))
                .onChange(async (value) => {
                    const steps = parseInt(value) || 20;
                    this.plugin.settings.agentMaxSteps = steps;
                    await this.plugin.saveSettings();
                }));

        // Command Help
        if (this.plugin.settings.showModeSelector) {
            const helpDiv = containerEl.createDiv({cls: 'setting-item-description'});
            helpDiv.style.cssText = `
                margin-top: -10px;
                margin-bottom: 15px;
                padding: 8px 12px;
                background: var(--background-secondary);
                border-radius: 4px;
                font-size: 12px;
                color: var(--text-muted);
            `;
            helpDiv.innerHTML = `
                <strong>Command Overrides:</strong><br>
                • <code>/chat &lt;message&gt;</code> - Force Chat Mode for this message<br>
                • <code>/agent &lt;message&gt;</code> - Force Agent Mode for this message
            `;
        }

        // MCP Settings Section
        containerEl.createEl('h3', {text: 'Model Context Protocol (MCP) Settings'});

        new Setting(containerEl)
            .setName('Enable MCP')
            .setDesc('Enable Model Context Protocol client functionality')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.mcpEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.mcpEnabled = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide MCP settings
                }));


        if (this.plugin.settings.mcpEnabled) {
            new Setting(containerEl)
                .setName('Auto Connect')
                .setDesc('Automatically connect to MCP servers on startup')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.mcpAutoConnect)
                    .onChange(async (value) => {
                        this.plugin.settings.mcpAutoConnect = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Tool Timeout (ms)')
                .setDesc('Timeout for MCP tool execution in milliseconds')
                .addText(text => text
                    .setPlaceholder('30000')
                    .setValue(String(this.plugin.settings.mcpToolTimeout))
                    .onChange(async (value) => {
                        const timeout = parseInt(value) || 30000;
                        this.plugin.settings.mcpToolTimeout = timeout;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Show Tool Execution')
                .setDesc('Show notifications when MCP tools are being executed')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.mcpShowToolExecution)
                    .onChange(async (value) => {
                        this.plugin.settings.mcpShowToolExecution = value;
                        await this.plugin.saveSettings();
                    }));

            // MCP Servers Section
            this.displayMCPServers(containerEl);
        }
    }

    private displayMCPServers(containerEl: HTMLElement): void {
        containerEl.createEl('h4', {text: 'MCP Servers'});

        // Server list
        const serverListContainer = containerEl.createDiv({cls: 'mcp-server-list'});
        this.refreshServerList(serverListContainer);

        // Configuration file info
        new Setting(containerEl)
            .setName('Configuration File')
            .setDesc('MCP servers can also be configured via settings.json file in the plugin directory')
            .addButton(button => button
                .setButtonText('Create Sample File')
                .onClick(async () => {
                    try {
                        await this.plugin.mcpClientService.createSampleConfiguration();
                    } catch (error) {
                        new Notice(`Failed to create sample configuration: ${error}`, 5000);
                    }
                }))
            .addButton(button => button
                .setButtonText('Reload from File')
                .onClick(async () => {
                    try {
                        // Reinitialize MCP client to reload configurations
                        await this.plugin.mcpClientService.cleanup();
                        await this.plugin.mcpClientService.initialize();
                        this.display(); // Refresh settings display
                        new Notice('MCP configuration reloaded from file');
                    } catch (error) {
                        new Notice(`Failed to reload configuration: ${error}`, 5000);
                    }
                }));

        // Add server button
        new Setting(containerEl)
            .setName('Add MCP Server')
            .setDesc('Add a new MCP server configuration manually')
            .addButton(button => button
                .setButtonText('Add Server')
                .onClick(() => {
                    this.addNewServer();
                }));
    }

    private refreshServerList(container: HTMLElement): void {
        container.empty();

        this.plugin.settings.mcpServers.forEach((server, index) => {
            const serverContainer = container.createDiv({cls: 'mcp-server-item'});

            // Server header with real-time status
            const headerEl = serverContainer.createDiv({cls: 'mcp-server-header'});
            headerEl.createEl('strong', {text: server.name || `Server ${index + 1}`});

            // Get real-time connection status
            const mcpClient = this.plugin.getMCPClientService();
            const connection = mcpClient?.getServerConnections().find(conn => conn.id === server.id);

            if (server.enabled) {
                if (connection) {
                    switch (connection.status) {
                        case 'connected':
                            headerEl.createEl('span', {text: ' (Connected)', cls: 'mcp-server-status-connected'});
                            break;
                        case 'connecting':
                            headerEl.createEl('span', {text: ' (Connecting...)', cls: 'mcp-server-status-connecting'});
                            break;
                        case 'error':
                            headerEl.createEl('span', {text: ` (Error: ${connection.error})`, cls: 'mcp-server-status-error'});
                            break;
                        default:
                            headerEl.createEl('span', {text: ' (Disconnected)', cls: 'mcp-server-status-disconnected'});
                    }
                } else {
                    headerEl.createEl('span', {text: ' (Enabled)', cls: 'mcp-server-status-enabled'});
                }
            } else {
                headerEl.createEl('span', {text: ' (Disabled)', cls: 'mcp-server-status-disabled'});
            }

            // Show tools count if connected
            if (connection && connection.status === 'connected' && connection.tools.length > 0) {
                headerEl.createEl('span', {text: ` - ${connection.tools.length} tools`, cls: 'mcp-tools-count'});
            }

            // Server settings
            new Setting(serverContainer)
                .setName('Server Name')
                .addText(text => text
                    .setValue(server.name)
                    .onChange(async (value) => {
                        server.name = value;
                        await this.plugin.saveSettings();
                        this.refreshServerList(container);
                    }));

            new Setting(serverContainer)
                .setName('Command')
                .addText(text => text
                    .setValue(server.command)
                    .onChange(async (value) => {
                        server.command = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(serverContainer)
                .setName('Arguments')
                .setDesc('Space-separated command arguments')
                .addText(text => text
                    .setValue(server.args.join(' '))
                    .onChange(async (value) => {
                        server.args = value.split(' ').filter(arg => arg.trim());
                        await this.plugin.saveSettings();
                    }));

            new Setting(serverContainer)
                .setName('Enabled')
                .addToggle(toggle => toggle
                    .setValue(server.enabled)
                    .onChange(async (value) => {
                        server.enabled = value;
                        await this.plugin.saveSettings();
                        this.refreshServerList(container);
                    }));

            new Setting(serverContainer)
                .setName('Auto Reconnect')
                .addToggle(toggle => toggle
                    .setValue(server.autoReconnect)
                    .onChange(async (value) => {
                        server.autoReconnect = value;
                        await this.plugin.saveSettings();
                    }));

            // Action buttons
            const actionsContainer = serverContainer.createDiv({cls: 'mcp-server-actions'});

            // Reconnect button (only show if server is enabled)
            if (server.enabled) {
                const reconnectBtn = actionsContainer.createEl('button', {
                    text: 'Reconnect',
                    cls: 'mod-cta'
                });
                reconnectBtn.onclick = async () => {
                    try {
                        reconnectBtn.disabled = true;
                        reconnectBtn.textContent = 'Reconnecting...';

                        const mcpClient = this.plugin.getMCPClientService();
                        if (mcpClient) {
                            await mcpClient.reconnectToServer(server.id);
                            this.refreshServerList(container);
                        }
                    } catch (error) {
                        new Notice(`Failed to reconnect: ${error}`, 5000);
                    } finally {
                        reconnectBtn.disabled = false;
                        reconnectBtn.textContent = 'Reconnect';
                    }
                };
            }

            // Remove server button
            const removeBtn = actionsContainer.createEl('button', {
                text: 'Remove Server',
                cls: 'mod-warning'
            });
            removeBtn.onclick = async () => {
                this.plugin.settings.mcpServers.splice(index, 1);
                await this.plugin.saveSettings();
                this.refreshServerList(container);
                new Notice('MCP server removed');
            };

            serverContainer.createEl('hr');
        });
    }

    private addNewServer(): void {
        const newServer: MCPServerConfig = {
            id: `server_${Date.now()}`,
            name: 'New MCP Server',
            command: '',
            args: [],
            enabled: false,
            autoReconnect: true,
            description: ''
        };

        this.plugin.settings.mcpServers.push(newServer);
        this.plugin.saveSettings();
        this.display(); // Refresh the entire settings display
        new Notice('New MCP server added. Configure the command and enable it.');
    }

    private getAgentConfig(): AgentModelConfig {
        return this.plugin.settings.agentModelConfig || {
            configType: 'single',
            singleModel: this.plugin.settings.defaultModel || 'g25fp',
            dualModel: {
                reasoningModel: 'g25fp',
                processingModel: 'g25p'
            }
        };
    }

    private async updateAgentConfig(path: string, value: any): Promise<void> {
        if (!this.plugin.settings.agentModelConfig) {
            this.plugin.settings.agentModelConfig = this.getAgentConfig();
        }

        const parts = path.split('.');
        let target = this.plugin.settings.agentModelConfig as any;
        
        for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]];
        }
        
        target[parts[parts.length - 1]] = value;
        await this.plugin.saveSettings();
    }

    private populateAgentModelDropdown(dropdown: any): void {
        // Use agentModels from settings if available, otherwise fall back to hardcoded list
        const agentModels = this.plugin.settings.agentModels || [
            { id: 'g25fp', label: 'Gemini-2.5-Flash Preview' },
            { id: 'g25fl', label: 'G2.5 Flash Lite Preview' },
            { id: 'g25f', label: 'Gemini-2.5-Flash' },
            { id: 'g25p', label: 'Gemini-2.5-Pro' }
        ];
        
        agentModels.forEach(model => {
            dropdown.addOption(model.id, model.label);
        });
    }
}
