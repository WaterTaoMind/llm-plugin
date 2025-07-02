import { AgentSharedState, MCPClient, ActionResult } from '../types';

/**
 * Node for executing ReAct actions (tool calls)
 * Following PocketFlow TypeScript SDK patterns
 */
export class ReActActionNode {
    constructor(private mcpClient: MCPClient) {}

    async execute(state: AgentSharedState): Promise<AgentSharedState> {
        const action = state.nextAction;
        const currentStep = state.currentStep || 1;
        
        if (!action) {
            console.log('⏭️ No action to execute, continuing...');
            return state;
        }
        
        console.log(`🛠️ Executing Action - Step ${currentStep}`);
        console.log(`   Tool: ${action.tool} (${action.server})`);
        console.log(`   Parameters:`, JSON.stringify(action.parameters, null, 2));
        console.log(`   Justification: ${action.justification}`);
        
        try {
            // Execute the tool via MCP client
            const result = await this.mcpClient.callTool(
                action.server,
                action.tool,
                action.parameters
            );
            
            const actionResult: ActionResult = {
                step: currentStep,
                server: action.server,
                tool: action.tool,
                parameters: action.parameters,
                result: result,
                justification: action.justification,
                success: true
            };
            
            console.log(`✅ Action completed successfully`);
            console.log(`📄 Result (${result.length} chars):`, result.substring(0, 300) + (result.length > 300 ? '...' : ''));
            
            // Add to action history
            const actionHistory = [...(state.actionHistory || []), actionResult];
            
            return {
                ...state,
                actionHistory,
                nextAction: undefined // Clear the action after execution
            };
            
        } catch (error) {
            console.error(`❌ Action failed:`, error);
            
            const actionResult: ActionResult = {
                step: currentStep,
                server: action.server,
                tool: action.tool,
                parameters: action.parameters,
                result: `Error: ${error instanceof Error ? error.message : String(error)}`,
                justification: action.justification,
                success: false
            };
            
            // Add failed action to history
            const actionHistory = [...(state.actionHistory || []), actionResult];
            
            return {
                ...state,
                actionHistory,
                nextAction: undefined // Clear the action after execution
            };
        }
    }
}