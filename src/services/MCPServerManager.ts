import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPServerConfig, MCPServerConnection, MCPTool, MCPResource } from '../core/types';
import { Notice } from 'obsidian';

/**
 * Manages individual MCP server connections
 * Handles connection lifecycle, health monitoring, and tool discovery
 */
export class MCPServerManager {
    private connections: Map<string, {
        client: Client;
        transport: StdioClientTransport;
        config: MCPServerConfig;
        status: MCPServerConnection;
    }> = new Map();

    private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private reconnectAttempts: Map<string, number> = new Map();
    private readonly maxReconnectAttempts = 5;
    private readonly baseReconnectDelay = 2000; // 2 seconds base delay
    private readonly maxReconnectDelay = 30000; // 30 seconds max delay

    /**
     * Connect to an MCP server
     */
    async connectToServer(config: MCPServerConfig): Promise<MCPServerConnection> {
        const serverId = config.id;

        try {
            // Disconnect existing connection if any
            await this.disconnectServer(serverId);

            // Create transport
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: config.env
            });

            // Create client
            const client = new Client({
                name: "obsidian-llm-plugin",
                version: "1.0.0"
            }, {
                capabilities: {}
            });

            // Connect
            await client.connect(transport);

            // Discover tools
            const tools = await this.discoverTools(client, serverId, config.name);

            // Create connection status
            const connection: MCPServerConnection = {
                id: serverId,
                name: config.name,
                status: 'connected',
                lastConnected: new Date(),
                tools: tools
            };

            // Store connection
            this.connections.set(serverId, {
                client,
                transport,
                config,
                status: connection
            });

            console.log(`Connected to MCP server: ${config.name}`);
            return connection;

        } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error(`Failed to connect to MCP server ${config.name}:`, errorMessage);

            const connection: MCPServerConnection = {
                id: serverId,
                name: config.name,
                status: 'error',
                error: errorMessage,
                tools: []
            };

            // Store connection for status tracking
            this.connections.set(serverId, {
                client: null as any,
                transport: null as any,
                config,
                status: connection
            });

            // Schedule reconnection if enabled
            if (config.autoReconnect) {
                this.scheduleReconnection(config);
            }

            return connection;
        }
    }

    /**
     * Disconnect from an MCP server
     */
    async disconnectServer(serverId: string): Promise<void> {
        const connection = this.connections.get(serverId);
        if (!connection) return;

        try {
            // Cancel any pending reconnection
            const timeout = this.reconnectTimeouts.get(serverId);
            if (timeout) {
                clearTimeout(timeout);
                this.reconnectTimeouts.delete(serverId);
            }

            // Close transport
            await connection.transport.close();
            
            // Update status
            connection.status.status = 'disconnected';
            
            console.log(`Disconnected from MCP server: ${connection.config.name}`);
        } catch (error) {
            console.error(`Error disconnecting from server ${serverId}:`, error);
        } finally {
            this.connections.delete(serverId);
        }
    }

    /**
     * Get connection status for a server
     */
    getServerConnection(serverId: string): MCPServerConnection | null {
        const connection = this.connections.get(serverId);
        return connection ? { ...connection.status } : null;
    }

    /**
     * Get all server connections
     */
    getAllConnections(): MCPServerConnection[] {
        return Array.from(this.connections.values()).map(conn => ({ ...conn.status }));
    }

    /**
     * Execute a tool on a specific server
     */
    async executeTool(serverId: string, toolName: string, arguments_: Record<string, any>): Promise<any> {
        const connection = this.connections.get(serverId);
        if (!connection) {
            throw new Error(`Server ${serverId} not connected`);
        }

        if (connection.status.status !== 'connected') {
            throw new Error(`Server ${serverId} is not in connected state`);
        }

        try {
            const result = await connection.client.callTool({
                name: toolName,
                arguments: arguments_
            });

            return result;
        } catch (error) {
            console.error(`Failed to execute tool ${toolName} on server ${serverId}:`, error);
            throw error;
        }
    }

    /**
     * List resources from a specific server
     */
    async listResources(serverId: string): Promise<MCPResource[]> {
        const connection = this.connections.get(serverId);
        if (!connection) {
            throw new Error(`Server ${serverId} not connected`);
        }

        if (connection.status.status !== 'connected') {
            throw new Error(`Server ${serverId} is not in connected state`);
        }

        try {
            const response = await connection.client.listResources();

            return response.resources.map(resource => ({
                uri: resource.uri,
                name: resource.name,
                description: resource.description,
                mimeType: resource.mimeType,
                serverId: serverId,
                serverName: connection.config.name
            }));
        } catch (error) {
            console.error(`Failed to list resources for server ${serverId}:`, error);
            return [];
        }
    }

    /**
     * Read resource content from a specific server
     */
    async readResource(serverId: string, uri: string): Promise<string | null> {
        const connection = this.connections.get(serverId);
        if (!connection) {
            throw new Error(`Server ${serverId} not connected`);
        }

        if (connection.status.status !== 'connected') {
            throw new Error(`Server ${serverId} is not in connected state`);
        }

        try {
            const response = await connection.client.readResource({ uri });

            if (response.contents && response.contents.length > 0) {
                const content = response.contents[0];
                if ('text' in content && typeof content.text === 'string') {
                    return content.text;
                } else if ('blob' in content) {
                    // Handle binary content if needed
                    return `[Binary content: ${content.blob}]`;
                }
            }

            return null;
        } catch (error) {
            console.error(`Failed to read resource ${uri} from server ${serverId}:`, error);
            return null;
        }
    }

    /**
     * Discover tools from a connected server
     */
    private async discoverTools(client: Client, serverId: string, serverName: string): Promise<MCPTool[]> {
        try {
            const response = await client.listTools();
            
            return response.tools.map(tool => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema,
                serverId: serverId,
                serverName: serverName
            }));
        } catch (error) {
            console.error(`Failed to discover tools for server ${serverId}:`, error);
            return [];
        }
    }

    /**
     * Schedule reconnection for a server with exponential backoff
     */
    private scheduleReconnection(config: MCPServerConfig): void {
        const currentAttempt = this.reconnectAttempts.get(config.id) || 0;
        const nextAttempt = currentAttempt + 1;

        if (nextAttempt > this.maxReconnectAttempts) {
            console.log(`Max reconnection attempts (${this.maxReconnectAttempts}) reached for server ${config.name}`);
            this.reconnectAttempts.delete(config.id);

            // Update status to indicate max attempts reached
            const connection = this.connections.get(config.id);
            if (connection) {
                connection.status.status = 'error';
                connection.status.error = `Max reconnection attempts reached (${this.maxReconnectAttempts})`;
            }
            return;
        }

        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
        const delay = Math.min(this.baseReconnectDelay * Math.pow(2, currentAttempt), this.maxReconnectDelay);
        console.log(`Scheduling reconnection for ${config.name} in ${delay}ms (attempt ${nextAttempt}/${this.maxReconnectAttempts})`);

        this.reconnectAttempts.set(config.id, nextAttempt);

        const timeout = setTimeout(async () => {
            try {
                console.log(`Attempting to reconnect to ${config.name} (attempt ${nextAttempt}/${this.maxReconnectAttempts})`);

                // Update status to connecting
                const connection = this.connections.get(config.id);
                if (connection) {
                    connection.status.status = 'connecting';
                    connection.status.error = undefined;
                }

                const result = await this.connectToServer(config);

                if (result.status === 'connected') {
                    console.log(`Successfully reconnected to ${config.name}`);
                    this.reconnectAttempts.delete(config.id); // Reset attempts on success
                    new Notice(`Reconnected to MCP server: ${config.name}`);
                } else {
                    throw new Error(result.error || 'Connection failed');
                }
            } catch (error) {
                const errorMessage = this.getErrorMessage(error);
                console.error(`Reconnection attempt ${nextAttempt} failed for ${config.name}:`, errorMessage);

                // Update connection status
                const connection = this.connections.get(config.id);
                if (connection) {
                    connection.status.status = 'error';
                    connection.status.error = `Reconnection failed: ${errorMessage}`;
                }

                // Schedule next attempt
                this.scheduleReconnection(config);
            }
        }, delay);

        this.reconnectTimeouts.set(config.id, timeout);
    }

    /**
     * Check health of all connections
     */
    async checkHealth(): Promise<void> {
        const healthCheckPromises = Array.from(this.connections.entries()).map(async ([serverId, connection]) => {
            // Skip health check for servers that are not supposed to be connected
            if (!connection.config.enabled || connection.status.status === 'connecting') {
                return;
            }

            try {
                // Only check if we have a valid client
                if (!connection.client) {
                    throw new Error('No client connection');
                }

                // Try to list tools as a health check with timeout
                const healthCheckPromise = connection.client.listTools();
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Health check timeout')), 5000);
                });

                await Promise.race([healthCheckPromise, timeoutPromise]);

                // Update status if it was previously in error
                if (connection.status.status !== 'connected') {
                    connection.status.status = 'connected';
                    connection.status.error = undefined;
                    console.log(`Health check passed for server ${connection.config.name}`);
                }
            } catch (error) {
                const errorMessage = this.getErrorMessage(error);
                console.error(`Health check failed for server ${serverId}:`, errorMessage);

                const wasConnected = connection.status.status === 'connected';
                connection.status.status = 'error';
                connection.status.error = `Health check failed: ${errorMessage}`;

                // Only schedule reconnection if it was previously connected and auto-reconnect is enabled
                if (wasConnected && connection.config.autoReconnect) {
                    console.log(`Scheduling reconnection for ${connection.config.name} due to health check failure`);
                    this.scheduleReconnection(connection.config);
                }
            }
        });

        // Wait for all health checks to complete
        await Promise.allSettled(healthCheckPromises);
    }

    /**
     * Disconnect all servers
     */
    async disconnectAll(): Promise<void> {
        const disconnectPromises = Array.from(this.connections.keys()).map(serverId => 
            this.disconnectServer(serverId)
        );
        
        await Promise.all(disconnectPromises);
    }

    /**
     * Get server statistics
     */
    getStats(): {
        totalServers: number;
        connectedServers: number;
        totalTools: number;
    } {
        const connections = this.getAllConnections();
        return {
            totalServers: connections.length,
            connectedServers: connections.filter(conn => conn.status === 'connected').length,
            totalTools: connections.reduce((sum, conn) => sum + conn.tools.length, 0)
        };
    }

    /**
     * Extract error message from various error types
     */
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error && typeof error === 'object' && 'message' in error) {
            return String((error as any).message);
        }
        return 'Unknown error';
    }

    /**
     * Reset reconnection attempts for a server (useful for manual reconnection)
     */
    resetReconnectionAttempts(serverId: string): void {
        this.reconnectAttempts.delete(serverId);

        // Cancel any pending reconnection
        const timeout = this.reconnectTimeouts.get(serverId);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(serverId);
        }
    }
}
