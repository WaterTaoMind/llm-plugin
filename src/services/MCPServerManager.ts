import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPServerConfig, MCPServerConnection, MCPTool, MCPResource } from '../core/types';
import { Notice } from 'obsidian';

/**
 * Manages individual MCP server connections
 * Handles connection lifecycle, health monitoring, and tool discovery
 */
export class MCPServerManager {
    private connections: Map<string, {
        client: Client;
        transport: StdioClientTransport | StreamableHTTPClientTransport;
        config: MCPServerConfig;
        status: MCPServerConnection;
    }> = new Map();

    private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private reconnectAttempts: Map<string, number> = new Map();
    private failureCount: Map<string, number> = new Map();
    private readonly maxReconnectAttempts = 5;
    private readonly baseReconnectDelay = 2000; // 2 seconds base delay
    private readonly maxReconnectDelay = 30000; // 30 seconds max delay
    private readonly maxFailuresBeforeDisable = 10; // Disable after 10 consecutive failures

    /**
     * Connect to an MCP server
     */
    async connectToServer(config: MCPServerConfig): Promise<MCPServerConnection> {
        const serverId = config.id;

        try {
            // Disconnect existing connection if any
            await this.disconnectServer(serverId);

            // Check if server should be temporarily disabled due to repeated failures
            if (this.shouldSkipServer(serverId)) {
                console.warn(`⏭️ Skipping server ${config.name} - temporarily disabled due to repeated failures`);
                throw new Error(`Server ${config.name} temporarily disabled due to repeated failures`);
            }

            // Create transport with enhanced environment and stdio filtering
            const enhancedEnv = {
                ...process.env,
                ...config.env,
                // Ensure Python path and conda environment
                PATH: `/opt/homebrew/Caskroom/miniconda/base/envs/llm/bin:${process.env.PATH}`,
                CONDA_DEFAULT_ENV: 'llm',
                CONDA_PREFIX: '/opt/homebrew/Caskroom/miniconda/base/envs/llm',
                PYTHONPATH: '/Users/zhonghaoning1/Work/tools',
                // Add working directory as environment variable
                PWD: '/Users/zhonghaoning1/Work/tools',
                // Disable verbose output from MCP server to reduce non-JSON noise
                PYTHONUNBUFFERED: '1',
                // Suppress debug output that might interfere with JSON parsing
                LOG_LEVEL: 'ERROR',
                // Explicitly pass API keys to ensure they're available
                YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || 'AIzaSyBTecaDmWIOsbs93tLutJu2XnsdNq7gL6Y',
                Assemblyai_api_key: process.env.Assemblyai_api_key || 'b09222ebbc344e1ebc659a90c89f4cda',
                Groq_api_key: process.env.Groq_api_key || '[REMOVED_GROQ_API_KEY]'
            };
            
            console.log(`🔧 MCP Server ${config.name}: Enhanced environment prepared`);
            console.log(`🔧 Python path: ${enhancedEnv.PATH?.split(':')[0]}`);
            console.log(`🔧 Working directory: ${enhancedEnv.PWD}`);
            
            // Choose transport type based on configuration
            let transport: StdioClientTransport | StreamableHTTPClientTransport;
            
            if (config.httpUrl) {
                console.log(`🌐 Using HTTP transport: ${config.httpUrl}`);
                
                // If both httpUrl and command are configured, check if server is already running
                if (config.command && config.args) {
                    const url = new URL(config.httpUrl);
                    const isServerRunning = await this.checkServerRunning(url.hostname, parseInt(url.port) || 80);
                    
                    if (!isServerRunning) {
                        console.log(`🚀 Starting HTTP server process: ${config.command} ${config.args.join(' ')}`);
                        
                        // Start the server process in the background
                        const { spawn } = require('child_process');
                        const serverProcess = spawn(config.command, config.args, {
                            env: enhancedEnv,
                            stdio: ['ignore', 'pipe', 'pipe'],
                            detached: true,
                            cwd: enhancedEnv.PWD
                        });
                        
                        // Don't wait for the process to exit
                        serverProcess.unref();
                        
                        // Log server output for debugging
                        serverProcess.stdout?.on('data', (data: Buffer) => {
                            console.log(`🔧 ${config.name} server:`, data.toString().trim());
                        });
                        
                        serverProcess.stderr?.on('data', (data: Buffer) => {
                            console.error(`🔧 ${config.name} server error:`, data.toString().trim());
                        });
                        
                        console.log(`⏳ Waiting for HTTP server to start...`);
                        // Wait for HTTP server to start
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        console.log(`✅ HTTP server already running on ${config.httpUrl}`);
                    }
                }
                
                // MCP servers expect the endpoint at /mcp/
                const mcpUrl = new URL(config.httpUrl);
                mcpUrl.pathname = '/mcp/';
                console.log(`🔗 MCP endpoint: ${mcpUrl.toString()}`);
                transport = new StreamableHTTPClientTransport(mcpUrl);
                
            } else {
                console.log(`📡 Using stdio transport`);
                // Use stdio transport with enhanced environment
                transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args,
                    env: enhancedEnv
                });
            }

            // Create client 
            const client = new Client({
                name: "obsidian-llm-plugin",
                version: "1.0.0"
            }, {
                capabilities: {}
            });

            // Apply transport-specific patches
            if (config.httpUrl) {
                // HTTP transport - no patching needed, works with standard MCP protocol
                console.log(`🌐 HTTP transport ready for connection`);
            } else {
                // Stdio transport - apply patches to handle non-JSON stdio output
                const originalSend = transport.send.bind(transport);
                const originalClose = transport.close.bind(transport);
                
                // Override transport to add better error handling
                (transport as any)._originalProcessMessage = (transport as any).processMessage;
                (transport as any).processMessage = function(line: string) {
                    try {
                        line = line.trim();
                        if (!line) return;
                        
                        // Skip non-JSON lines (debug output from server)
                        if (!line.startsWith('{') && !line.startsWith('[')) {
                            console.debug(`🔧 MCP Server ${config.name}: Skipping non-JSON output:`, line);
                            return;
                        }
                        
                        // Try to parse JSON
                        JSON.parse(line);
                        
                        // If successful, call original handler
                        return this._originalProcessMessage(line);
                    } catch (error) {
                        console.debug(`🔧 MCP Server ${config.name}: Skipping malformed JSON:`, line, error);
                        return;
                    }
                };
            }

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
            this.recordSuccess(serverId); // Reset failure count on successful connection
            return connection;

        } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error(`Failed to connect to MCP server ${config.name}:`, errorMessage);

            this.recordFailure(serverId); // Track failure for potential disabling

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

            // Only schedule reconnection if server isn't disabled and auto-reconnect is enabled
            if (config.autoReconnect && !this.shouldSkipServer(serverId)) {
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

            // Close transport if it exists
            if (connection.transport) {
                await connection.transport.close();
            }
            
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
            console.log(`🔧 Executing tool ${toolName} on server ${serverId} with parameters:`, JSON.stringify(arguments_, null, 2));
            const startTime = Date.now();
            
            const result = await connection.client.callTool({
                name: toolName,
                arguments: arguments_
            });
            
            const executionTime = Date.now() - startTime;
            console.log(`✅ Tool ${toolName} completed in ${executionTime}ms`);
            
            // Enhanced logging for YouTube transcript debugging
            const resultString = JSON.stringify(result);
            const resultSize = resultString.length;
            console.log(`📄 Result size: ${resultSize} characters`);
            console.log(`📄 Result structure:`, Object.keys(result));
            console.log(`📄 Full result:`, result);
            
            if (toolName.includes('transcript') && result.content) {
                const content = Array.isArray(result.content) ? result.content[0] : result.content;
                if (content && content.text) {
                    const textLength = content.text.length;
                    console.log(`📄 Transcript text length: ${textLength} characters`);
                    console.log(`📄 Transcript preview:`, content.text.substring(0, 500) + '...');
                    
                    // Check if this is actually an error response
                    if (content.text.includes('Unable to generate transcript')) {
                        console.log(`❌ Server returned error instead of transcript`);
                        console.log(`❌ This suggests the MCP server failed to process the request properly`);
                    }
                }
            }
            
            console.log(`📄 Result preview:`, resultString.substring(0, 200) + '...');

            return result;
        } catch (error) {
            console.error(`❌ Failed to execute tool ${toolName} on server ${serverId}:`, error);
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

            // Skip health check for YouTube server to avoid interference with long-running operations
            if (serverId === 'youtube-transcript') {
                console.debug(`Skipping health check for ${serverId} - long-running operations server`);
                return;
            }

            try {
                // Only check if we have a valid client
                if (!connection.client) {
                    throw new Error('No client connection');
                }

                // Try to list tools as a health check with timeout
                const timeoutMs = 5000; // 5s for regular servers
                
                const healthCheckPromise = connection.client.listTools();
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Health check timeout')), timeoutMs);
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

    /**
     * Check if server should be skipped due to repeated failures
     */
    private shouldSkipServer(serverId: string): boolean {
        const failures = this.failureCount.get(serverId) || 0;
        return failures >= this.maxFailuresBeforeDisable;
    }

    /**
     * Record connection failure for a server
     */
    private recordFailure(serverId: string): void {
        const current = this.failureCount.get(serverId) || 0;
        this.failureCount.set(serverId, current + 1);
        
        if (current + 1 >= this.maxFailuresBeforeDisable) {
            console.warn(`🚨 Server ${serverId} disabled after ${this.maxFailuresBeforeDisable} consecutive failures`);
        }
    }

    /**
     * Record successful connection for a server (resets failure count)
     */
    private recordSuccess(serverId: string): void {
        this.failureCount.delete(serverId);
    }

    /**
     * Re-enable a temporarily disabled server
     */
    enableServer(serverId: string): void {
        this.failureCount.delete(serverId);
        console.log(`✅ Server ${serverId} re-enabled`);
    }

    /**
     * Check if a server is already running on the specified host and port
     */
    private async checkServerRunning(hostname: string, port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();
            
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, 1000); // 1 second timeout
            
            socket.connect(port, hostname, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve(true);
            });
            
            socket.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }
}
