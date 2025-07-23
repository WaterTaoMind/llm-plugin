import { AgentSharedState, LLMProvider, MCPClient, ModelConfig, ProgressCallback, AgentProgressEvent } from './types';
import { DiscoverToolsNode } from './nodes/DiscoverToolsNode';
import { ReActReasoningNode } from './nodes/ReActReasoningNode';
import { ReActActionNode } from './nodes/ReActActionNode';
import { SummarizeResultsNode } from './nodes/SummarizeResultsNode';

/**
 * TypeScript ReAct Agent implementation
 * Following PocketFlow TypeScript SDK patterns for Node-based workflows
 * 
 * Uses proper PocketFlow Node classes with built-in retry logic
 * Custom orchestration for ReAct loop control flow
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
        private modelConfig: ModelConfig,
        // Retry configuration options
        reasoningRetries: number = 3,
        actionRetries: number = 3,
        summarizeRetries: number = 2
    ) {
        // Initialize PocketFlow nodes with built-in retry logic
        this.discoverToolsNode = new DiscoverToolsNode(mcpClient);
        this.reasoningNode = new ReActReasoningNode(llmProvider, reasoningRetries, 2);
        this.actionNode = new ReActActionNode(mcpClient, actionRetries, 1);
        this.summarizeNode = new SummarizeResultsNode(llmProvider, summarizeRetries, 1);
    }

    /**
     * Set progress callback for real-time updates
     */
    setProgressCallback(callback: ProgressCallback) {
        // Store callback for sharing with nodes
        this.progressCallback = callback;
    }

    private progressCallback?: ProgressCallback;

    /**
     * Emit progress event to callback
     */
    private emitProgress(type: AgentProgressEvent['type'], data: any, step: number = 0) {
        if (this.progressCallback) {
            this.progressCallback({
                type,
                step,
                data,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Execute the ReAct agent workflow using PocketFlow node patterns
     * 
     * @param userRequest The user's request to process
     * @param maxSteps Maximum number of reasoning steps (default: 10)
     * @returns Final response from the agent
     */
    async execute(userRequest: string, maxSteps: number = 10): Promise<string> {
        console.log('🚀 TypeScript ReAct Agent - Starting execution');
        console.log(`📝 User Request: ${userRequest}`);
        console.log(`🔢 Max Steps: ${maxSteps}`);
        
        // Emit initial progress
        this.emitProgress('step_start', {
            description: 'Starting agent execution and analyzing request...'
        }, 0);
        
        // Initialize shared state
        const state: AgentSharedState = {
            userRequest,
            maxSteps,
            currentStep: 0,
            actionHistory: [],
            modelConfig: this.modelConfig,
            startTime: Date.now(),
            progressCallback: this.progressCallback
        };

        try {
            // Step 1: Discover available tools using PocketFlow node
            console.log('\n🔍 Phase 1: Tool Discovery');
            this.emitProgress('step_start', {
                description: 'Discovering available tools and capabilities...'
            }, 0);
            await this.runNode(this.discoverToolsNode, state);
            
            // Step 2: ReAct loop (Reasoning + Acting) using PocketFlow nodes
            console.log('\n🤔 Phase 2: ReAct Loop');
            await this.executeReActLoop(state);
            
            // Step 3: Summarize results using PocketFlow node
            console.log('\n📋 Phase 3: Result Summarization');
            this.emitProgress('step_start', {
                description: 'Generating final summary and formatting results...'
            }, (state.currentStep || 0) + 1);
            await this.runNode(this.summarizeNode, state);
            
            const finalResult = state.finalResult || 'Agent completed but no result was generated.';
            const actionCount = state.actionHistory?.length || 0;
            const stepCount = state.currentStep || 0;
            const duration = state.startTime ? Date.now() - state.startTime : 0;
            
            // Emit final result
            this.emitProgress('final_result', {
                result: finalResult,
                stats: {
                    actionsCompleted: actionCount,
                    stepsCompleted: stepCount,
                    duration: Math.round(duration / 1000) + 's'
                }
            }, stepCount);
            
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
     * Run a PocketFlow-style node using our BaseNode implementation
     */
    private async runNode(node: any, state: AgentSharedState): Promise<void> {
        // Use the BaseNode's built-in run method that handles prep/exec/post with retry
        await node.run(state);
    }

    /**
     * Execute the ReAct reasoning and action loop using PocketFlow nodes
     */
    private async executeReActLoop(state: AgentSharedState): Promise<void> {
        const maxSteps = state.maxSteps || 10;
        
        while ((state.currentStep || 0) < maxSteps) {
            // Reasoning step using PocketFlow node
            console.log(`\n🤔 Reasoning Step ${(state.currentStep || 0) + 1}/${maxSteps}`);
            await this.runNode(this.reasoningNode, state);
            
            // Check if agent decided to complete
            if (!state.nextAction) {
                console.log('✅ Agent decided to complete - no more actions needed');
                break;
            }
            
            // Action step using PocketFlow node
            console.log(`🛠️ Action Step ${state.currentStep}/${maxSteps}`);
            await this.runNode(this.actionNode, state);
            
            // Brief pause to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if ((state.currentStep || 0) >= maxSteps) {
            console.log('⏰ Reached maximum steps - completing with current results');
            state.goalStatus = `Completed after reaching maximum ${maxSteps} steps`;
        }
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