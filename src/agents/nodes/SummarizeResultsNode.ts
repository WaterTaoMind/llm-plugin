import { Node } from "pocketflow";
import { AgentSharedState, LLMProvider } from '../types';

/**
 * Node for summarizing and finalizing ReAct agent results
 * Following PocketFlow TypeScript SDK patterns with built-in retry logic
 */
export class SummarizeResultsNode extends Node<AgentSharedState> {
    constructor(
        private llmProvider: LLMProvider,
        maxRetries: number = 2,
        waitTime: number = 1
    ) {
        super(maxRetries, waitTime);
    }

    async prep(shared: AgentSharedState): Promise<string> {
        console.log('📋 Summarizing results...');
        return this.buildSummaryPrompt(shared);
    }

    async exec(prompt: string): Promise<string> {
        const summary = await this.llmProvider.callLLM(
            prompt,
            undefined, // Use default model config
            'You are a helpful assistant that provides clear, concise summaries based on the provided information.'
        );
        
        // Validate the summary
        if (!summary || summary.trim().length < 10) {
            throw new Error('Summary is too short or empty');
        }
        
        console.log(`✅ Summary generated (${summary.length} chars)`);
        console.log(`📄 Summary preview: ${summary.substring(0, 200)}...`);
        
        return summary;
    }

    async post(
        shared: AgentSharedState,
        prompt: string,
        summary: string
    ): Promise<string | undefined> {
        // Update shared state with final result
        Object.assign(shared, {
            finalResult: summary
        });
        
        return undefined; // End of flow
    }

    /**
     * Fallback method when all retries fail
     * Following PocketFlow execFallback pattern
     */
    async execFallback(prompt: string, error: Error): Promise<string> {
        console.log('🔄 Using summarization fallback...');
        
        // Generate fallback summary from prompt content
        const fallbackSummary = this.generateFallbackSummaryFromPrompt(prompt);
        console.log(`✅ Fallback summary generated (${fallbackSummary.length} chars)`);
        
        return fallbackSummary;
    }

    private buildSummaryPrompt(state: AgentSharedState): string {
        const userRequest = state.userRequest || 'Unknown request';
        const actionHistory = state.actionHistory || [];
        const totalSteps = state.currentStep || 0;
        const maxSteps = state.maxSteps || 10;
        
        let prompt = `# Task Summary Request\n\n`;
        prompt += `**Original User Request:** ${userRequest}\n\n`;
        
        if (actionHistory.length > 0) {
            prompt += `## Actions Taken (${actionHistory.length} actions in ${totalSteps} steps):\n\n`;
            
            actionHistory.forEach((action, i) => {
                prompt += `### Step ${action.step}: ${action.tool} (${action.server})\n`;
                prompt += `**Justification:** ${action.justification}\n`;
                prompt += `**Status:** ${action.success ? '✅ SUCCESS' : '❌ FAILED'}\n`;
                prompt += `**Result:** ${action.result}\n\n`;
            });
        } else {
            prompt += `## Actions Taken:\nNo tools were used. Response based on available knowledge.\n\n`;
        }
        
        prompt += `## Summary Instructions:\n`;
        prompt += `Please provide a comprehensive but concise response to the user's original request based on the above information. `;
        prompt += `Focus on answering their question directly and clearly. If actions were taken, incorporate the results. `;
        prompt += `If no relevant actions were performed, provide the best possible response based on your knowledge.\n\n`;
        
        prompt += `Guidelines:\n`;
        prompt += `- Be direct and helpful\n`;
        prompt += `- Include specific information from any tool results\n`;
        prompt += `- If the task couldn't be completed fully, explain what was accomplished\n`;
        prompt += `- Keep the response focused on the user's needs\n`;
        prompt += `- Use markdown formatting for better readability if appropriate\n`;
        
        return prompt;
    }

    private generateFallbackSummaryFromPrompt(prompt: string): string {
        // Extract user request from prompt
        const userRequestMatch = prompt.match(/\*\*Original User Request:\*\* (.+)/);
        const userRequest = userRequestMatch ? userRequestMatch[1] : 'your request';
        
        // Extract action count
        const actionMatch = prompt.match(/## Actions Taken \((\d+) actions/);
        const actionCount = actionMatch ? parseInt(actionMatch[1]) : 0;
        
        let summary = `I attempted to help with ${userRequest}.\n\n`;
        
        if (actionCount > 0) {
            summary += `**Actions taken:** ${actionCount} actions were performed to gather information.\n\n`;
            
            // Check for success/failure indicators in prompt
            if (prompt.includes('✅ SUCCESS')) {
                summary += `Some tools were successfully executed to gather relevant information.\n`;
            }
            if (prompt.includes('❌ FAILED')) {
                summary += `Some actions failed, but I've provided the best response possible with available information.\n`;
            }
        } else {
            summary += `No specific tools were needed for this request. I've provided a response based on available knowledge.\n`;
        }
        
        summary += `\n*Note: Automatic summarization failed, so this is a simplified response based on the available information.*`;
        
        return summary;
    }
}