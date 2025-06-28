import { MCPServerManager } from './MCPServerManager';
import { MCPToolRegistry } from './MCPToolRegistry';
import { MCPConfigLoader } from './MCPConfigLoader';
import {
    LLMPluginSettings,
    MCPServerConfig,
    MCPServerConnection,
    MCPTool,
    MCPToolCall,
    MCPToolResult,
    MCPResource
} from '../core/types';
import { Notice, App } from 'obsidian';

/**
 * Main MCP Client Service
 * Orchestrates MCP server connections, tool discovery, and execution
 */
export class MCPClientService {
    private serverManager: MCPServerManager;
    private toolRegistry: MCPToolRegistry;
    private configLoader: MCPConfigLoader;
    private settings: LLMPluginSettings;
    private healthCheckInterval?: NodeJS.Timeout;
    private app: App;

    constructor(settings: LLMPluginSettings, app: App) {
        this.settings = settings;
        this.app = app;
        this.serverManager = new MCPServerManager();
        this.toolRegistry = new MCPToolRegistry();

        // Initialize config loader with plugin data path only
        const pluginDataPath = this.getPluginDataPath();
        this.configLoader = new MCPConfigLoader(pluginDataPath, this.app);

        // Listen for configuration changes
        this.configLoader.onConfigChange(this.handleConfigChange.bind(this));
    }

    /**
     * Initialize MCP client and connect to configured servers
     */
    async initialize(): Promise<void> {
        if (!this.settings.mcpEnabled) {
            console.log('MCP is disabled in settings');
            return;
        }

        console.log('Initializing MCP Client Service...');

        // Load configurations from files
        await this.loadConfigurationsFromFiles();

        // Connect to all enabled servers
        if (this.settings.mcpAutoConnect) {
            await this.connectToAllServers();
        }

        // Start health monitoring
        this.startHealthMonitoring();

        console.log('MCP Client Service initialized');
    }

    /**
     * Connect to all configured servers
     */
    async connectToAllServers(): Promise<void> {
        const enabledServers = this.settings.mcpServers.filter(server => server.enabled);
        
        if (enabledServers.length === 0) {
            console.log('No MCP servers configured');
            return;
        }

        console.log(`Connecting to ${enabledServers.length} MCP servers...`);

        const connectionPromises = enabledServers.map(async (serverConfig) => {
            try {
                const connection = await this.serverManager.connectToServer(serverConfig);
                this.toolRegistry.registerServerTools(connection);
                
                if (connection.status === 'connected') {
                    new Notice(`Connected to MCP server: ${connection.name}`);
                } else {
                    new Notice(`Failed to connect to MCP server: ${connection.name}`, 5000);
                }
                
                return connection;
            } catch (error) {
                console.error(`Failed to connect to server ${serverConfig.name}:`, error);
                new Notice(`Error connecting to ${serverConfig.name}: ${error}`, 5000);
                return null;
            }
        });

        await Promise.all(connectionPromises);
        
        const stats = this.getStats();
        console.log(`MCP initialization complete: ${stats.connectedServers}/${stats.totalServers} servers connected, ${stats.totalTools} tools available`);
    }

    /**
     * Get all available tools for LLM function calling
     */
    getAvailableTools(): MCPTool[] {
        return this.toolRegistry.getAllTools();
    }

    /**
     * Get tools formatted for LLM API
     */
    getToolsForLLM(): any[] {
        return this.toolRegistry.getToolsForLLM();
    }

    /**
     * Execute tool calls from LLM
     */
    async executeToolCalls(toolCalls: MCPToolCall[]): Promise<MCPToolResult[]> {
        const results: MCPToolResult[] = [];

        for (const toolCall of toolCalls) {
            try {
                const result = await this.executeSingleTool(toolCall);
                results.push(result);
            } catch (error) {
                console.error(`Failed to execute tool ${toolCall.toolName}:`, error);
                results.push({
                    toolCallId: toolCall.id,
                    success: false,
                    content: '',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }

    /**
     * Execute a single tool with comprehensive error handling
     */
    private async executeSingleTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
        const { toolName, serverId, arguments: args, id } = toolCall;

        // Show tool execution if enabled
        if (this.settings.mcpShowToolExecution) {
            new Notice(`Executing tool: ${toolName}`, 2000);
        }

        try {
            // Validate server connection
            const connection = this.serverManager.getServerConnection(serverId);
            if (!connection) {
                throw new Error(`Server ${serverId} not found`);
            }

            if (connection.status !== 'connected') {
                throw new Error(`Server ${serverId} is not connected (status: ${connection.status})`);
            }

            // Execute with timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Tool execution timeout after ${this.settings.mcpToolTimeout}ms`)), this.settings.mcpToolTimeout);
            });

            const executionPromise = this.serverManager.executeTool(serverId, toolName, args);

            const result = await Promise.race([executionPromise, timeoutPromise]);

            // Show success notification if enabled
            if (this.settings.mcpShowToolExecution) {
                new Notice(`Tool ${toolName} completed successfully`, 1000);
            }

            return {
                toolCallId: id,
                success: true,
                content: this.formatToolResult(result)
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to execute tool ${toolName}:`, errorMessage);

            // Show error notification
            if (this.settings.mcpShowToolExecution) {
                new Notice(`Tool ${toolName} failed: ${errorMessage}`, 3000);
            }

            return {
                toolCallId: id,
                success: false,
                content: '',
                error: errorMessage
            };
        }
    }

    /**
     * Format tool result for LLM consumption
     */
    private formatToolResult(result: any): string | any[] {
        if (typeof result === 'string') {
            return result;
        }

        if (result && result.content) {
            if (Array.isArray(result.content)) {
                return result.content;
            }
            return String(result.content);
        }

        return JSON.stringify(result, null, 2);
    }

    /**
     * Get tool by name (handles conflicts)
     */
    getTool(toolName: string): MCPTool | null {
        return this.toolRegistry.getTool(toolName);
    }

    /**
     * Check if tool name is conflicted
     */
    isToolConflicted(toolName: string): boolean {
        return this.toolRegistry.isConflicted(toolName);
    }

    /**
     * Get conflict resolution suggestions
     */
    getConflictResolution(toolName: string): string[] {
        return this.toolRegistry.getConflictResolution(toolName);
    }

    /**
     * Get similar tools for suggestions
     */
    getSimilarTools(toolName: string): string[] {
        return this.toolRegistry.getSimilarTools(toolName);
    }

    /**
     * Get all server connections
     */
    getServerConnections(): MCPServerConnection[] {
        return this.serverManager.getAllConnections();
    }

    /**
     * Connect to a specific server
     */
    async connectToServer(serverConfig: MCPServerConfig): Promise<MCPServerConnection> {
        const connection = await this.serverManager.connectToServer(serverConfig);
        this.toolRegistry.registerServerTools(connection);
        return connection;
    }

    /**
     * Disconnect from a specific server
     */
    async disconnectFromServer(serverId: string): Promise<void> {
        await this.serverManager.disconnectServer(serverId);
        this.toolRegistry.clearServerTools(serverId);
    }

    /**
     * Manually reconnect to a specific server
     */
    async reconnectToServer(serverId: string): Promise<MCPServerConnection> {
        const serverConfig = this.settings.mcpServers.find(s => s.id === serverId);
        if (!serverConfig) {
            throw new Error(`Server configuration not found for ${serverId}`);
        }

        // Reset reconnection attempts for fresh start
        this.serverManager.resetReconnectionAttempts(serverId);

        // Disconnect first if connected
        await this.disconnectFromServer(serverId);

        // Reconnect
        const connection = await this.connectToServer(serverConfig);

        if (connection.status === 'connected') {
            new Notice(`Successfully reconnected to ${connection.name}`);
        } else {
            new Notice(`Failed to reconnect to ${connection.name}: ${connection.error}`, 5000);
        }

        return connection;
    }

    /**
     * Update settings
     */
    updateSettings(settings: LLMPluginSettings): void {
        this.settings = settings;
    }

    /**
     * Start health monitoring
     */
    private startHealthMonitoring(): void {
        // Check health every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            await this.serverManager.checkHealth();
        }, 30000);
    }

    /**
     * Get available resources from all servers
     */
    async getAvailableResources(): Promise<MCPResource[]> {
        const resources: MCPResource[] = [];
        const connections = this.serverManager.getAllConnections();

        for (const connection of connections) {
            if (connection.status === 'connected') {
                try {
                    const serverResources = await this.serverManager.listResources(connection.id);
                    resources.push(...serverResources);
                } catch (error) {
                    console.error(`Failed to list resources for server ${connection.id}:`, error);
                }
            }
        }

        return resources;
    }

    /**
     * Read resource content
     */
    async readResource(uri: string): Promise<string> {
        const connections = this.serverManager.getAllConnections();

        for (const connection of connections) {
            if (connection.status === 'connected') {
                try {
                    const content = await this.serverManager.readResource(connection.id, uri);
                    if (content) {
                        return content;
                    }
                } catch (error) {
                    // Try next server
                    continue;
                }
            }
        }

        throw new Error(`Resource not found: ${uri}`);
    }

    /**
     * Get service statistics
     */
    getStats(): {
        totalServers: number;
        connectedServers: number;
        totalTools: number;
        conflictedTools: number;
    } {
        const serverStats = this.serverManager.getStats();
        const toolStats = this.toolRegistry.getStats();

        return {
            totalServers: serverStats.totalServers,
            connectedServers: serverStats.connectedServers,
            totalTools: toolStats.totalTools,
            conflictedTools: toolStats.conflictedTools
        };
    }

    /**
     * Load configurations from external files
     */
    private async loadConfigurationsFromFiles(): Promise<void> {
        try {
            const fileConfigs = await this.configLoader.loadConfigurations();

            if (fileConfigs.length > 0) {
                console.log(`Loaded ${fileConfigs.length} MCP server configurations from file`);

                // Merge with existing settings (file configs take precedence)
                const existingIds = new Set(this.settings.mcpServers.map(s => s.id));
                const newConfigs = fileConfigs.filter(config => !existingIds.has(config.id));

                if (newConfigs.length > 0) {
                    this.settings.mcpServers.push(...newConfigs);
                    new Notice(`Loaded ${newConfigs.length} new MCP server configurations from file`);
                }

                // Update existing configurations with file data
                fileConfigs.forEach(fileConfig => {
                    const existingIndex = this.settings.mcpServers.findIndex(s => s.id === fileConfig.id);
                    if (existingIndex >= 0) {
                        this.settings.mcpServers[existingIndex] = { ...this.settings.mcpServers[existingIndex], ...fileConfig };
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load MCP configurations from files:', error);
            new Notice('Failed to load MCP configurations from files. Using plugin settings.', 3000);
        }
    }

    /**
     * Handle configuration file changes
     */
    private async handleConfigChange(configs: MCPServerConfig[]): Promise<void> {
        console.log('MCP configuration file changed, reloading...');

        try {
            // Update settings with new configurations
            this.settings.mcpServers = configs;

            // Reconnect to servers if auto-connect is enabled
            if (this.settings.mcpAutoConnect) {
                await this.serverManager.disconnectAll();
                await this.connectToAllServers();
            }

            new Notice('MCP configuration reloaded from file');
        } catch (error) {
            console.error('Failed to handle configuration change:', error);
            new Notice(`Failed to reload MCP configuration: ${error}`, 5000);
        }
    }



    /**
     * Get plugin data directory path
     */
    private getPluginDataPath(): string {
        // @ts-ignore - Access vault adapter base path
        const adapter = this.app.vault.adapter;
        if (adapter && 'basePath' in adapter) {
            const vaultPath = (adapter as any).basePath || '';
            if (vaultPath) {
                // Construct plugin data path: vault/.obsidian/plugins/plugin-id/
                return `${vaultPath}/.obsidian/plugins/unofficial-llm-integration`;
            }
        }
        return '';
    }

    /**
     * Save current configurations to file
     */
    async saveConfigurationsToFile(): Promise<void> {
        try {
            await this.configLoader.saveConfigurations(this.settings.mcpServers);
        } catch (error) {
            console.error('Failed to save MCP configurations to file:', error);
            new Notice(`Failed to save MCP configurations: ${error}`, 5000);
            throw error;
        }
    }

    /**
     * Get configuration file paths
     */
    getConfigurationPaths(): string[] {
        return this.configLoader.getConfigPaths();
    }

    /**
     * Create sample configuration file
     */
    async createSampleConfiguration(): Promise<void> {
        try {
            await this.configLoader.createSampleConfig();
        } catch (error) {
            console.error('Failed to create sample configuration:', error);
            new Notice(`Failed to create sample configuration: ${error}`, 5000);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        console.log('Cleaning up MCP Client Service...');

        // Stop health monitoring
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Cleanup config loader
        if (this.configLoader) {
            this.configLoader.cleanup();
        }

        // Disconnect all servers
        await this.serverManager.disconnectAll();

        // Clear tool registry
        this.toolRegistry.clear();

        console.log('MCP Client Service cleanup complete');
    }
}
