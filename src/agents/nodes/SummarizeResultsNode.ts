import { AgentSharedState, LLMProvider } from '../types';

/**
 * Node for summarizing and finalizing ReAct agent results
 * Following PocketFlow TypeScript SDK patterns
 */
export class SummarizeResultsNode {
    constructor(private llmProvider: LLMProvider) {}

    async execute(state: AgentSharedState): Promise<AgentSharedState> {
        console.log('📋 Summarizing results...');
        
        try {
            const prompt = this.buildSummaryPrompt(state);
            console.log('🔧 SummarizeResultsNode: Starting LLM call...');
            
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Summarization timeout after 20 seconds')), 20000);
            });
            
            const summaryPromise = this.llmProvider.callLLM(
                prompt,
                state.modelConfig?.summarization,
                'You are a helpful assistant that provides clear, concise summaries based on the provided information.'
            );
            
            const summary = await Promise.race([summaryPromise, timeoutPromise]);
            console.log('✅ SummarizeResultsNode: Got LLM response');
            
            console.log(`✅ Summary generated (${summary.length} chars)`);
            console.log(`📄 Summary preview: ${summary.substring(0, 200)}...`);
            
            return {
                ...state,
                finalResult: summary
            };
            
        } catch (error) {
            console.error('❌ Summarization failed:', error);
            console.log('🔄 Using fallback summary generation...');
            
            // Fallback summary
            const fallbackSummary = this.generateFallbackSummary(state);
            console.log(`✅ Fallback summary generated (${fallbackSummary.length} chars)`);
            
            return {
                ...state,
                finalResult: fallbackSummary
            };
        }
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

    private generateFallbackSummary(state: AgentSharedState): string {
        const userRequest = state.userRequest || 'your request';
        const actionHistory = state.actionHistory || [];
        const totalSteps = state.currentStep || 0;
        
        let summary = `I attempted to help with ${userRequest}.\n\n`;
        
        if (actionHistory.length > 0) {
            const successfulActions = actionHistory.filter(a => a.success);
            const failedActions = actionHistory.filter(a => !a.success);
            
            summary += `**Actions taken:** ${actionHistory.length} actions in ${totalSteps} steps\n`;
            summary += `- ✅ Successful: ${successfulActions.length}\n`;
            summary += `- ❌ Failed: ${failedActions.length}\n\n`;
            
            if (successfulActions.length > 0) {
                summary += `**Results obtained:**\n`;
                successfulActions.forEach(action => {
                    summary += `- ${action.tool}: ${action.result.substring(0, 100)}${action.result.length > 100 ? '...' : ''}\n`;
                });
            }
            
            if (failedActions.length > 0) {
                summary += `\n**Note:** Some actions failed, but I've provided the best response possible with available information.\n`;
            }
        } else {
            summary += `No specific tools were needed for this request. I've provided a response based on available knowledge.\n`;
        }
        
        return summary;
    }
}