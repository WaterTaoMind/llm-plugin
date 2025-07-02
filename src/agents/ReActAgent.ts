import { AgentSharedState, LLMProvider, MCPClient, ModelConfig } from './types';
import { DiscoverToolsNode } from './nodes/DiscoverToolsNode';
import { ReActReasoningNode } from './nodes/ReActReasoningNode';
import { ReActActionNode } from './nodes/ReActActionNode';
import { SummarizeResultsNode } from './nodes/SummarizeResultsNode';

/**
 * TypeScript ReAct Agent implementation
 * Following PocketFlow TypeScript SDK patterns for Node-based workflows
 * 
 * Replaces the Python subprocess approach with native TypeScript integration
 */
export class ReActAgent {
    private discoverToolsNode: DiscoverToolsNode;
    private reasoningNode: ReActReasoningNode;
    private actionNode: ReActActionNode;
    private summarizeNode: SummarizeResultsNode;

    constructor(
        private llmProvider: LLMProvider,
        private mcpClient: MCPClient,
        private modelConfig: ModelConfig
    ) {
        // Initialize nodes following PocketFlow patterns
        this.discoverToolsNode = new DiscoverToolsNode(mcpClient);
        this.reasoningNode = new ReActReasoningNode(llmProvider);
        this.actionNode = new ReActActionNode(mcpClient);
        this.summarizeNode = new SummarizeResultsNode(llmProvider);
    }

    /**
     * Execute the ReAct agent workflow
     * 
     * @param userRequest The user's request to process
     * @param maxSteps Maximum number of reasoning steps (default: 10)
     * @returns Final response from the agent
     */
    async execute(userRequest: string, maxSteps: number = 10): Promise<string> {
        console.log('🚀 TypeScript ReAct Agent - Starting execution');
        console.log(`📝 User Request: ${userRequest}`);
        console.log(`🔢 Max Steps: ${maxSteps}`);
        
        // Initialize shared state
        let state: AgentSharedState = {
            userRequest,
            maxSteps,
            currentStep: 0,
            actionHistory: [],
            modelConfig: this.modelConfig
        };

        try {
            // Step 1: Discover available tools
            console.log('\n🔍 Phase 1: Tool Discovery');
            state = await this.discoverToolsNode.execute(state);
            
            // Step 2: ReAct loop (Reasoning + Acting)
            console.log('\n🤔 Phase 2: ReAct Loop');
            state = await this.executeReActLoop(state);
            
            // Step 3: Summarize results
            console.log('\n📋 Phase 3: Result Summarization');
            state = await this.summarizeNode.execute(state);
            
            const finalResult = state.finalResult || 'Agent completed but no result was generated.';
            const actionCount = state.actionHistory?.length || 0;
            const stepCount = state.currentStep || 0;
            
            console.log(`\n🎉 TypeScript ReAct Agent - Execution Complete`);
            console.log(`📊 Actions taken: ${actionCount}/${maxSteps}`);
            console.log(`⚡ Steps completed: ${stepCount}`);
            console.log(`📄 Result length: ${finalResult.length} characters`);
            
            return finalResult;
            
        } catch (error) {
            console.error('❌ Agent execution failed:', error);
            
            // Return whatever partial results we have
            const partialResult = state.finalResult || this.generateErrorResponse(userRequest, error);
            return partialResult;
        }
    }

    /**
     * Execute the ReAct reasoning and action loop
     */
    private async executeReActLoop(state: AgentSharedState): Promise<AgentSharedState> {
        const maxSteps = state.maxSteps || 10;
        
        while ((state.currentStep || 0) < maxSteps) {
            // Reasoning step
            console.log(`\n🤔 Reasoning Step ${(state.currentStep || 0) + 1}/${maxSteps}`);
            state = await this.reasoningNode.execute(state);
            
            // Check if agent decided to complete
            if (!state.nextAction) {
                console.log('✅ Agent decided to complete - no more actions needed');
                break;
            }
            
            // Action step
            console.log(`🛠️ Action Step ${state.currentStep}/${maxSteps}`);
            state = await this.actionNode.execute(state);
            
            // Brief pause to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if ((state.currentStep || 0) >= maxSteps) {
            console.log('⏰ Reached maximum steps - completing with current results');
            state.goalStatus = `Completed after reaching maximum ${maxSteps} steps`;
        }
        
        return state;
    }

    /**
     * Generate error response when agent execution fails
     */
    private generateErrorResponse(userRequest: string, error: any): string {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return `I encountered an error while processing your request: "${userRequest}"\n\n` +
               `Error: ${errorMessage}\n\n` +
               `I apologize for the inconvenience. Please try rephrasing your request or contact support if the issue persists.`;
    }

    /**
     * Get agent status and metrics
     */
    getMetrics(state: AgentSharedState): any {
        return {
            userRequest: state.userRequest,
            currentStep: state.currentStep || 0,
            maxSteps: state.maxSteps || 10,
            toolsAvailable: state.availableTools?.length || 0,
            actionsExecuted: state.actionHistory?.length || 0,
            successfulActions: state.actionHistory?.filter(a => a.success).length || 0,
            failedActions: state.actionHistory?.filter(a => !a.success).length || 0,
            goalStatus: state.goalStatus || 'Unknown',
            hasResult: !!state.finalResult
        };
    }
}