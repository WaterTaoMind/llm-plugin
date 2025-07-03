import { Node } from "../BaseNode";
import { AgentSharedState, MCPClient, MCPTool } from '../types';

/**
 * Node for discovering available MCP tools
 * Following PocketFlow TypeScript SDK patterns
 */
export class DiscoverToolsNode extends Node<AgentSharedState> {
    constructor(private mcpClient: MCPClient) {
        super(1, 1); // Single attempt, minimal wait time
    }

    async prep(shared: AgentSharedState): Promise<void> {
        console.log('🔍 Discovering available tools...');
    }

    async exec(_: void): Promise<{ availableTools: MCPTool[]; toolsByServer: any; toolServerMap: Record<string, string> }> {
        // Get all tools from all MCP servers
        const toolsByServer = await this.mcpClient.getAllTools();
        
        // Flatten tools into a single array with server info
        const availableTools: MCPTool[] = [];
        const toolServerMap: Record<string, string> = {};
        
        for (const [serverName, tools] of Object.entries(toolsByServer)) {
            for (const tool of tools) {
                const enrichedTool = {
                    ...tool,
                    server: serverName
                };
                availableTools.push(enrichedTool);
                toolServerMap[tool.name] = serverName;
            }
        }
        
        console.log(`✅ Discovered ${availableTools.length} tools from ${Object.keys(toolsByServer).length} servers`);
        
        // Log available tools for debugging
        if (availableTools.length > 0) {
            console.log('📋 Available tools:');
            availableTools.forEach(tool => {
                console.log(`   • ${tool.name} (${tool.server}): ${tool.description}`);
            });
        }
        
        return { availableTools, toolsByServer, toolServerMap };
    }

    async post(
        shared: AgentSharedState,
        _: void,
        toolData: { availableTools: MCPTool[]; toolsByServer: any; toolServerMap: Record<string, string> }
    ): Promise<string | undefined> {
        // Update shared state with discovered tools
        Object.assign(shared, {
            availableTools: toolData.availableTools,
            toolsByServer: toolData.toolsByServer,
            toolServerMap: toolData.toolServerMap
        });
        
        return "default";
    }

    /**
     * Fallback method when tool discovery fails
     * Following PocketFlow execFallback pattern
     */
    execFallback(_: void, error: Error): { availableTools: MCPTool[]; toolsByServer: any; toolServerMap: Record<string, string> } {
        console.error('❌ Tool discovery failed:', error);
        console.log('🔄 Using empty tools fallback - agent can still reason and respond');
        
        // Return empty tools - agent can still reason and respond
        return {
            availableTools: [],
            toolsByServer: {},
            toolServerMap: {}
        };
    }
}