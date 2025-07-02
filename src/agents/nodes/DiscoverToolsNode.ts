import { AgentSharedState, MCPClient, MCPTool } from '../types';

/**
 * Node for discovering available MCP tools
 * Following PocketFlow TypeScript SDK patterns
 */
export class DiscoverToolsNode {
    constructor(private mcpClient: MCPClient) {}

    async execute(state: AgentSharedState): Promise<AgentSharedState> {
        console.log('🔍 Discovering available tools...');
        
        try {
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
            
            return {
                ...state,
                availableTools,
                toolsByServer,
                toolServerMap
            };
            
        } catch (error) {
            console.error('❌ Tool discovery failed:', error);
            
            // Continue with empty tools - agent can still reason and respond
            return {
                ...state,
                availableTools: [],
                toolsByServer: {},
                toolServerMap: {}
            };
        }
    }
}