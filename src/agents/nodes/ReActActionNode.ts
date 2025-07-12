import { Node } from "pocketflow";
import { AgentSharedState, MCPClient, ActionResult, AgentProgressEvent } from '../types';

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
        
        // Emit action start progress
        this.emitProgress(shared, 'action_start', {
            tool: action.tool,
            server: action.server,
            justification: action.justification,
            parameters: Object.keys(action.parameters)
        }, currentStep);
        
        return { action, currentStep };
    }

    async exec(prepData: { action: any; currentStep: number } | null): Promise<string | null> {
        if (!prepData) {
            return null; // No action to execute
        }
        
        const { action } = prepData;
        
        // Execute the tool via MCP client
        const result = await this.mcpClient.callTool(
            action.server,
            action.tool,
            action.parameters
        );
        
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
        
        // Generate unique history ID for this action step
        const historyId = `action-${currentStep}-${Date.now()}`;
        
        const actionResult: ActionResult = {
            step: currentStep,
            stepType: 'action',  // Mark as external action
            server: action.server,
            tool: action.tool,
            parameters: action.parameters,
            result: execResult || `Failed execution: ${action.tool}`,
            justification: action.justification,
            success: !isError,
            historyId: historyId  // Add unique identifier
        };
        
        // Add to action history
        const actionHistory = [...(shared.actionHistory || []), actionResult];
        
        // Emit action completion progress
        this.emitProgress(shared, 'action_complete', {
            tool: action.tool,
            server: action.server,
            success: !isError,
            result: this.formatResultSummary(execResult || 'Failed execution'),
            historyId: historyId
        }, currentStep);
        
        // Update shared state
        Object.assign(shared, {
            actionHistory,
            nextAction: undefined // Clear the action after execution
            // Note: currentStep increment handled by ReasoningNode
        });
        
        console.log(`📋 Action result added to history with ID: ${historyId} (${isError ? 'FAILED' : 'SUCCESS'})`);
        
        return "default";
    }

    /**
     * Emit progress event to callback if available
     */
    private emitProgress(state: AgentSharedState, type: AgentProgressEvent['type'], data: any, step: number) {
        if (state.progressCallback) {
            state.progressCallback({
                type,
                step,
                data,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Format result summary for progress display
     */
    private formatResultSummary(result: string): string {
        if (result.length <= 150) return result;
        
        // For long results, provide a smart summary
        const lines = result.split('\n');
        const firstLine = lines[0] || '';
        
        if (firstLine.length > 100) {
            return firstLine.substring(0, 100) + '...';
        }
        
        // Try to include a few meaningful lines
        let summary = firstLine;
        for (let i = 1; i < lines.length && summary.length < 120; i++) {
            const line = lines[i].trim();
            if (line) {
                summary += '\n' + line;
            }
        }
        
        if (summary.length < result.length) {
            summary += '\n...';
        }
        
        return summary;
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