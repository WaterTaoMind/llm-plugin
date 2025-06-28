import { MCPServerConfig } from '../core/types';
import { Notice, App, FileSystemAdapter } from 'obsidian';
import { joinPath, normalizePath } from '../utils/pathUtils';

/**
 * Configuration loader for MCP servers
 * Supports loading from multiple sources with fallback hierarchy
 */
export class MCPConfigLoader {
    private configPaths: string[];
    private watchedFiles: Set<string> = new Set();
    private changeCallbacks: ((configs: MCPServerConfig[]) => void)[] = [];
    private app: App;

    constructor(private pluginDataPath: string, app: App) {
        this.app = app;
        // Only use plugin directory for settings.json
        this.configPaths = [joinPath(pluginDataPath, 'settings.json')];
    }

    /**
     * Load MCP server configurations from plugin directory settings.json
     */
    async loadConfigurations(): Promise<MCPServerConfig[]> {
        const configPath = this.configPaths[0]; // Only one path now

        try {
            if (await this.fileExists(configPath)) {
                console.log(`Loading MCP configuration from: ${configPath}`);
                const configs = await this.loadFromFile(configPath);

                // Watch for changes if not already watching
                if (!this.watchedFiles.has(configPath)) {
                    this.watchFile(configPath);
                }

                return configs;
            } else {
                console.log('No settings.json found in plugin directory. MCP servers can be configured manually in settings.');
                return [];
            }
        } catch (error) {
            console.error(`Failed to load MCP config from ${configPath}:`, error);
            new Notice(`Failed to load MCP config from settings.json: ${error}`, 5000);
            return [];
        }
    }

    /**
     * Load configuration from settings.json in plugin directory
     */
    private async loadFromFile(filePath: string): Promise<MCPServerConfig[]> {
        // Always use Node.js fs since we're only loading from plugin directory
        const fs = require('fs');
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        // Handle different configuration formats
        if (data.mcpServers) {
            // Format: { "mcpServers": { "server1": {...}, "server2": {...} } }
            return this.parseServerConfigs(data.mcpServers);
        } else if (data.servers) {
            // Format: { "servers": [...] }
            return data.servers.map((server: any, index: number) => this.normalizeServerConfig(server, index));
        } else {
            // Assume root level is server configurations
            return this.parseServerConfigs(data);
        }
    }

    /**
     * Parse server configurations from object format
     */
    private parseServerConfigs(serversObj: Record<string, any>): MCPServerConfig[] {
        return Object.entries(serversObj).map(([key, config], index) => {
            return this.normalizeServerConfig({
                ...config,
                name: config.name || key,
                id: config.id || key
            }, index);
        });
    }

    /**
     * Normalize server configuration to internal format
     */
    private normalizeServerConfig(config: any, index: number): MCPServerConfig {
        return {
            id: config.id || `server_${index}`,
            name: config.name || `Server ${index + 1}`,
            command: config.command || '',
            args: Array.isArray(config.args) ? config.args : [],
            env: config.env || {},
            enabled: config.enabled !== false, // Default to enabled
            autoReconnect: config.autoReconnect !== false, // Default to auto-reconnect
            description: config.description || ''
        };
    }

    /**
     * Save configurations to settings.json in plugin directory
     */
    async saveConfigurations(configs: MCPServerConfig[]): Promise<void> {
        const configPath = this.configPaths[0]; // Only one path now

        try {
            // Convert to external format
            const mcpServers: Record<string, any> = {};
            configs.forEach(config => {
                mcpServers[config.id] = {
                    command: config.command,
                    args: config.args,
                    env: config.env,
                    enabled: config.enabled,
                    autoReconnect: config.autoReconnect,
                    ...(config.description && { description: config.description })
                };
            });

            const data = { mcpServers };
            const jsonContent = JSON.stringify(data, null, 2);

            // Always use Node.js fs since we're only saving to plugin directory
            const fs = require('fs');
            const path = require('path');

            // Ensure directory exists
            const dirPath = path.dirname(configPath);
            await fs.promises.mkdir(dirPath, { recursive: true });

            await fs.promises.writeFile(configPath, jsonContent, 'utf-8');

            console.log(`MCP configuration saved to: ${configPath}`);
            new Notice(`MCP configuration saved to settings.json`);

        } catch (error) {
            console.error('Failed to save MCP configuration:', error);
            new Notice(`Failed to save MCP configuration: ${error}`, 5000);
            throw error;
        }
    }

    /**
     * Watch configuration file for changes
     * Note: File watching in Obsidian is limited, so this is a simplified implementation
     */
    private watchFile(filePath: string): void {
        try {
            // For now, we'll rely on manual reloading or periodic checks
            // Obsidian doesn't provide direct file watching APIs for plugin files
            this.watchedFiles.add(filePath);
            console.log(`Registered for watching MCP configuration file: ${filePath}`);
        } catch (error) {
            console.error(`Failed to watch configuration file ${filePath}:`, error);
        }
    }

    /**
     * Register callback for configuration changes
     */
    onConfigChange(callback: (configs: MCPServerConfig[]) => void): void {
        this.changeCallbacks.push(callback);
    }

    /**
     * Notify all callbacks of configuration changes
     */
    private notifyConfigChange(configs: MCPServerConfig[]): void {
        this.changeCallbacks.forEach(callback => {
            try {
                callback(configs);
            } catch (error) {
                console.error('Error in config change callback:', error);
            }
        });
    }

    /**
     * Stop watching all files
     */
    cleanup(): void {
        this.watchedFiles.clear();
        this.changeCallbacks = [];
    }

    /**
     * Check if settings.json exists in plugin directory
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            // Always use Node.js fs since we're only checking plugin directory
            const fs = require('fs');
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get filename from path
     */
    private getFileName(filePath: string): string {
        const parts = filePath.split('/');
        return parts[parts.length - 1] || filePath;
    }

    /**
     * Get the path of the primary configuration file
     */
    getPrimaryConfigPath(): string {
        return this.configPaths[0];
    }

    /**
     * Get all possible configuration paths
     */
    getConfigPaths(): string[] {
        return [...this.configPaths];
    }

    /**
     * Create a sample configuration file in plugin directory
     */
    async createSampleConfig(): Promise<void> {
        const sampleConfig = {
            mcpServers: {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
                    "enabled": false,
                    "autoReconnect": true,
                    "description": "Access local files and directories"
                },
                "git": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "/path/to/git/repo"],
                    "enabled": false,
                    "autoReconnect": true,
                    "description": "Git repository operations"
                }
            }
        };

        const configPath = this.configPaths[0];
        const samplePath = configPath.replace('settings.json', 'mcp-settings-sample.json');
        const jsonContent = JSON.stringify(sampleConfig, null, 2);

        // Always use Node.js fs since we're only working with plugin directory
        const fs = require('fs');
        const path = require('path');

        // Ensure directory exists
        const dirPath = path.dirname(samplePath);
        await fs.promises.mkdir(dirPath, { recursive: true });

        await fs.promises.writeFile(samplePath, jsonContent, 'utf-8');

        new Notice(`Sample MCP configuration created at ${this.getFileName(samplePath)}`);
        console.log(`Sample MCP configuration created: ${samplePath}`);
    }
}
