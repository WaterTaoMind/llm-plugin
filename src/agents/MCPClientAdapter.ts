import { MCPClient, MCPTool } from './types';
import { MCPClientService } from '../services/MCPClientService';

/**
 * Adapter to make MCPClientService compatible with the agent's MCPClient interface
 * Provides dependency injection for the ReAct agent
 */
export class MCPClientAdapter implements MCPClient {
    constructor(private mcpClientService: MCPClientService) {}

    /**
     * Get all tools from all MCP servers
     */
    async getAllTools(): Promise<Record<string, MCPTool[]>> {
        try {
            // Get all available tools from the tool registry
            const allTools = this.mcpClientService.getAvailableTools();
            
            // Group tools by server
            const toolsByServer: Record<string, MCPTool[]> = {};
            
            for (const tool of allTools) {
                const serverName = tool.serverId || 'unknown';
                if (!toolsByServer[serverName]) {
                    toolsByServer[serverName] = [];
                }
                
                toolsByServer[serverName].push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    server: serverName
                });
            }
            
            return toolsByServer;
        } catch (error) {
            console.error('Failed to get all tools:', error);
            return {};
        }
    }

    /**
     * Call a specific tool on a specific server
     */
    async callTool(serverName: string, toolName: string, parameters: Record<string, any>, signal?: AbortSignal): Promise<string> {
        try {
            // Check for cancellation before making the call
            if (signal?.aborted) {
                throw new DOMException('Operation was cancelled', 'AbortError');
            }
            
            // Create a tool call in the format expected by MCPClientService
            const toolCall = {
                id: `tool_${Date.now()}`,
                toolName: toolName,
                serverId: serverName,
                arguments: parameters,
                signal: signal
            };
            
            const results = await this.mcpClientService.executeToolCalls([toolCall]);
            
            if (results.length === 0) {
                throw new Error('No result returned from tool execution');
            }
            
            const result = results[0];
            
            if (!result.success) {
                throw new Error(result.error || 'Tool execution failed');
            }
            
            // Convert result content to string
            const content = result.content;
            if (typeof content === 'string') {
                return content;
            } else if (Array.isArray(content)) {
                return JSON.stringify(content, null, 2);
            } else {
                return String(content);
            }
        } catch (error) {
            // Handle cancellation gracefully
            if (error instanceof DOMException && error.name === 'AbortError') {
                console.log(`🛑 Tool ${toolName} on server ${serverName} was cancelled`);
                throw error; // Re-throw cancellation to bubble up
            }
            throw new Error(`Failed to call tool ${toolName} on server ${serverName}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}