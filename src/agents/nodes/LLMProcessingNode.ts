import { Node } from "pocketflow";
import { AgentSharedState, LLMProvider, LLMProcessingRequest, ActionResult } from '../types';

/**
 * Dedicated LLM Processing Node following PocketFlow patterns
 * 
 * Responsibilities:
 * - prep(): Retrieve content from action history using historyId reference
 * - exec(): Execute LLM processing with crafted prompt and selected content
 * - post(): Add result to unified action history with stepType: 'llm_processing'
 * 
 * This maintains clear separation of concerns:
 * - ReasoningNode: Decides what to do and crafts prompts
 * - LLMProcessingNode: Executes LLM tasks with history-based input
 * - ActionNode: Executes external tool actions
 */
export class LLMProcessingNode extends Node<AgentSharedState> {
    constructor(
        private llmProvider: LLMProvider,
        maxRetries: number = 3,
        waitTime: number = 1
    ) {
        super(maxRetries, waitTime);
    }

    async prep(shared: AgentSharedState): Promise<{ prompt: string; content: string; request: LLMProcessingRequest }> {
        const request = shared.nextLLMRequest;
        
        if (!request) {
            throw new Error('No LLM processing request found in shared state');
        }

        console.log(`🧠 LLM Processing - Task: ${request.task}`);
        console.log(`📝 Input History ID: ${request.inputHistoryId}`);
        
        // Get content from action history using historyId reference
        const content = this.getContentFromHistory(shared.actionHistory || [], request.inputHistoryId);
        
        console.log(`📄 Retrieved content: ${content.length} characters`);
        
        return {
            prompt: request.prompt,
            content: content,
            request: request
        };
    }

    async exec(prepData: { prompt: string; content: string; request: LLMProcessingRequest }): Promise<string> {
        const { prompt, content } = prepData;
        
        console.log(`🔧 LLMProcessingNode: Executing ${prepData.request.task}`);
        
        // Combine prompt and content following PocketFlow patterns
        const fullPrompt = `${prompt}\n\nContent to process:\n${content}`;
        
        // Execute LLM processing - no JSON schema needed for content tasks
        const result = await this.llmProvider.callLLM(
            fullPrompt,
            undefined, // Use default model
            'You are a helpful assistant that processes content according to the given instructions.'
        );
        
        console.log(`✅ LLM Processing completed: ${prepData.request.task}`);
        console.log(`📊 Output length: ${result.length} characters`);
        
        return result.trim();
    }

    async post(
        shared: AgentSharedState,
        prepData: { prompt: string; content: string; request: LLMProcessingRequest },
        result: string
    ): Promise<string> {
        const { request } = prepData;
        
        // Generate unique history ID for this LLM processing step
        const historyId = `llm-${shared.currentStep || 0}-${Date.now()}`;
        
        // Add to unified action history with stepType: 'llm_processing'
        if (!shared.actionHistory) {
            shared.actionHistory = [];
        }
        
        shared.actionHistory.push({
            step: shared.currentStep || 0,
            stepType: 'llm_processing',
            server: 'internal',
            tool: request.task,
            parameters: { 
                inputHistoryId: request.inputHistoryId,
                promptLength: request.prompt.length,
                contentLength: prepData.content.length
            },
            result: result,
            justification: request.prompt,
            success: true,
            historyId: historyId
        });
        
        // Clear the LLM request and update step counter
        shared.nextLLMRequest = undefined;
        shared.currentStep = (shared.currentStep || 0) + 1;
        
        console.log(`📋 LLM Processing result added to action history with ID: ${historyId}`);
        
        return "continue"; // Return to reasoning node for next decision
    }

    /**
     * Retrieve content from action history using historyId reference
     * This enables precise content selection for LLM processing
     */
    private getContentFromHistory(history: ActionResult[], historyId: string): string {
        if (!historyId) {
            throw new Error('No input history ID provided for LLM processing');
        }
        
        // Find the specific history entry
        const entry = history.find(h => h.historyId === historyId);
        
        if (!entry) {
            // If exact historyId not found, try partial matching for backward compatibility
            const partialMatch = history.find(h => h.historyId.includes(historyId) || historyId.includes(h.historyId));
            
            if (partialMatch) {
                console.log(`⚠️ Using partial match for history ID: ${historyId} → ${partialMatch.historyId}`);
                return partialMatch.result;
            }
            
            throw new Error(`History entry not found: ${historyId}. Available IDs: ${history.map(h => h.historyId).join(', ')}`);
        }
        
        return entry.result;
    }

    /**
     * Fallback method when all retries fail
     * Following PocketFlow execFallback pattern
     */
    async execFallback(
        prepData: { prompt: string; content: string; request: LLMProcessingRequest },
        error: Error
    ): Promise<string> {
        console.error('❌ LLM Processing failed:', error);
        console.log('🔄 Using LLM processing fallback...');
        
        const { request } = prepData;
        
        // Return a fallback response indicating failure
        return `[LLM Processing Failed: ${error.message}]\n\nOriginal task: ${request.task}\nInput history ID: ${request.inputHistoryId}`;
    }
}