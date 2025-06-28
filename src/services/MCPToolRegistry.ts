import { MCPTool, MCPServerConnection } from '../core/types';

/**
 * Registry for managing MCP tools across all connected servers
 * Handles tool discovery, schema translation, and conflict resolution
 */
export class MCPToolRegistry {
    private tools: Map<string, MCPTool> = new Map();
    private toolsByServer: Map<string, MCPTool[]> = new Map();
    private conflictedTools: Set<string> = new Set();

    /**
     * Register tools from a server connection
     */
    registerServerTools(serverConnection: MCPServerConnection): void {
        const serverId = serverConnection.id;
        const serverTools = serverConnection.tools;

        // Clear existing tools for this server
        this.clearServerTools(serverId);

        // Register new tools
        this.toolsByServer.set(serverId, serverTools);

        for (const tool of serverTools) {
            const toolKey = tool.name;
            const serverToolKey = `${serverId}:${tool.name}`;

            // Always register with server prefix
            this.tools.set(serverToolKey, tool);

            // Check for conflicts with simple name
            if (this.tools.has(toolKey)) {
                // Mark as conflicted - requires explicit server prefix
                this.conflictedTools.add(toolKey);
            } else {
                // Register without prefix if no conflict
                this.tools.set(toolKey, tool);
            }
        }
    }

    /**
     * Clear tools for a specific server
     */
    clearServerTools(serverId: string): void {
        const existingTools = this.toolsByServer.get(serverId) || [];
        
        // Remove tools from main registry
        for (const tool of existingTools) {
            this.tools.delete(tool.name);
            this.tools.delete(`${serverId}:${tool.name}`);
            this.conflictedTools.delete(tool.name);
        }

        this.toolsByServer.delete(serverId);
        
        // Recheck conflicts after removal
        this.recheckConflicts();
    }

    /**
     * Get tool by name (handles both simple and server:tool syntax)
     */
    getTool(toolName: string): MCPTool | null {
        return this.tools.get(toolName) || null;
    }

    /**
     * Get all available tools
     */
    getAllTools(): MCPTool[] {
        const allTools: MCPTool[] = [];
        
        for (const serverTools of this.toolsByServer.values()) {
            allTools.push(...serverTools);
        }
        
        return allTools;
    }

    /**
     * Get tools for LLM function calling (formatted for LLM API)
     */
    getToolsForLLM(): any[] {
        return this.getAllTools().map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            // Add server context for disambiguation
            server: tool.serverName
        }));
    }

    /**
     * Get tools by server
     */
    getToolsByServer(serverId: string): MCPTool[] {
        return this.toolsByServer.get(serverId) || [];
    }

    /**
     * Check if a tool name is conflicted
     */
    isConflicted(toolName: string): boolean {
        return this.conflictedTools.has(toolName);
    }

    /**
     * Get similar tool names for suggestions
     */
    getSimilarTools(toolName: string): string[] {
        const allToolNames = Array.from(this.tools.keys());
        const similar: string[] = [];

        for (const name of allToolNames) {
            if (name.toLowerCase().includes(toolName.toLowerCase()) ||
                toolName.toLowerCase().includes(name.toLowerCase())) {
                similar.push(name);
            }
        }

        return similar.slice(0, 5); // Limit to 5 suggestions
    }

    /**
     * Get conflict resolution suggestions
     */
    getConflictResolution(toolName: string): string[] {
        const suggestions: string[] = [];
        
        for (const [key, tool] of this.tools.entries()) {
            if (key.includes(':') && key.endsWith(`:${toolName}`)) {
                suggestions.push(key);
            }
        }
        
        return suggestions;
    }

    /**
     * Get registry statistics
     */
    getStats(): {
        totalTools: number;
        serverCount: number;
        conflictedTools: number;
    } {
        return {
            totalTools: this.getAllTools().length,
            serverCount: this.toolsByServer.size,
            conflictedTools: this.conflictedTools.size
        };
    }

    /**
     * Recheck conflicts after server disconnection
     */
    private recheckConflicts(): void {
        this.conflictedTools.clear();
        const toolCounts = new Map<string, number>();

        // Count occurrences of each tool name
        for (const serverTools of this.toolsByServer.values()) {
            for (const tool of serverTools) {
                const count = toolCounts.get(tool.name) || 0;
                toolCounts.set(tool.name, count + 1);
            }
        }

        // Mark tools with count > 1 as conflicted
        for (const [toolName, count] of toolCounts.entries()) {
            if (count > 1) {
                this.conflictedTools.add(toolName);
            }
        }
    }

    /**
     * Clear all tools
     */
    clear(): void {
        this.tools.clear();
        this.toolsByServer.clear();
        this.conflictedTools.clear();
    }
}
