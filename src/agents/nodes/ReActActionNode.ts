import { Node } from "pocketflow";
import { AgentSharedState, MCPClient, ActionResult } from '../types';

/**
 * Node for executing ReAct actions (tool calls)
 * Following PocketFlow TypeScript SDK patterns with built-in retry logic
 */
export class ReActActionNode extends Node<AgentSharedState> {
    constructor(
        private mcpClient: MCPClient,
        maxRetries: number = 3,
        waitTime: number = 1
    ) {
        super(maxRetries, waitTime);
    }

    async prep(shared: AgentSharedState): Promise<{ action: any; currentStep: number } | null> {
        const action = shared.nextAction;
        const currentStep = shared.currentStep || 1;
        
        if (!action) {
            console.log('⏭️ No action to execute, continuing...');
            return null;
        }
        
        console.log(`🛠️ Executing Action - Step ${currentStep}`);
        console.log(`   Tool: ${action.tool} (${action.server})`);
        console.log(`   Parameters:`, JSON.stringify(action.parameters, null, 2));
        console.log(`   Justification: ${action.justification}`);
        
        return { action, currentStep };
    }

    async exec(prepData: { action: any; currentStep: number } | null): Promise<string | null> {
        if (!prepData) {
            return null; // No action to execute
        }
        
        const { action } = prepData;
        
        // Determine timeout based on tool type
        const isYouTubeOperation = action.tool.includes('youtube') || 
                                 action.tool.includes('transcript') || 
                                 action.tool.includes('video');
        const timeout = isYouTubeOperation ? 360000 : 30000; // 6 min for YouTube, 30s for others
        
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Tool execution timeout after ${timeout/1000}s`)), timeout);
        });
        
        // Execute the tool via MCP client with timeout
        const toolPromise = this.mcpClient.callTool(
            action.server,
            action.tool,
            action.parameters
        );
        
        const result = await Promise.race([toolPromise, timeoutPromise]);
        
        // Validate result
        if (typeof result !== 'string' || result.trim().length === 0) {
            throw new Error('Tool returned empty or invalid result');
        }
        
        // Check for error indicators in result
        if (result.toLowerCase().includes('error:') || 
            result.toLowerCase().includes('failed:') ||
            result.toLowerCase().includes('unable to')) {
            console.warn(`⚠️ Tool result contains error indicators: ${result.substring(0, 100)}`);
            // Don't throw here - let the reasoning node decide how to handle
        }
        
        console.log(`✅ Action completed successfully`);
        console.log(`📄 Result (${result.length} chars):`, result.substring(0, 300) + (result.length > 300 ? '...' : ''));
        
        return result;
    }

    async post(
        shared: AgentSharedState,
        prepData: { action: any; currentStep: number } | null,
        execResult: string | null
    ): Promise<string | undefined> {
        if (!prepData) {
            return "default"; // No action was executed
        }
        
        const { action, currentStep } = prepData;
        
        // Handle both successful and failed executions
        const isError = execResult?.startsWith('Error:') || execResult === null;
        
        const actionResult: ActionResult = {
            step: currentStep,
            server: action.server,
            tool: action.tool,
            parameters: action.parameters,
            result: execResult || `Failed execution: ${action.tool}`,
            justification: action.justification,
            success: !isError
        };
        
        // Add to action history
        const actionHistory = [...(shared.actionHistory || []), actionResult];
        
        // Update shared state
        Object.assign(shared, {
            actionHistory,
            nextAction: undefined // Clear the action after execution
        });
        
        return "default";
    }

    /**
     * Fallback method when all retries fail
     * Following PocketFlow execFallback pattern
     */
    async execFallback(prepData: { action: any; currentStep: number } | null, error: Error): Promise<string | null> {
        if (!prepData) {
            return null;
        }
        
        console.log('🔄 Using action execution fallback...');
        return `Error: ${error.message}`;
    }

    /**
     * Check if an error is non-retryable
     */
    private isNonRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();
        
        // Configuration or permission errors that won't be fixed by retrying
        const nonRetryablePatterns = [
            'not found',
            'unauthorized',
            'forbidden',
            'invalid api key',
            'permission denied',
            'quota exceeded',
            'rate limit exceeded',
            'invalid parameters',
            'malformed request'
        ];
        
        return nonRetryablePatterns.some(pattern => message.includes(pattern));
    }
}