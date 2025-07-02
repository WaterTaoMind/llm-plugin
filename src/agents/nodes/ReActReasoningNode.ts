import { AgentSharedState, LLMProvider, ReasoningResponse, ActionDecision } from '../types';

/**
 * Node for ReAct reasoning step
 * Following PocketFlow TypeScript SDK patterns
 */
export class ReActReasoningNode {
    constructor(private llmProvider: LLMProvider) {}

    async execute(state: AgentSharedState): Promise<AgentSharedState> {
        const currentStep = (state.currentStep || 0) + 1;
        const maxSteps = state.maxSteps || 10;
        
        console.log(`🤔 ReAct Reasoning - Step ${currentStep}/${maxSteps}`);
        
        try {
            const prompt = this.buildReasoningPrompt(state, currentStep);
            console.log('🔧 ReActReasoningNode: Starting LLM call...');
            
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Reasoning timeout after 30 seconds')), 30000);
            });
            
            const reasoningPromise = this.llmProvider.callLLMWithSchema(
                prompt,
                this.getReasoningSchema(),
                state.modelConfig?.reasoning
            );
            
            const response = await Promise.race([reasoningPromise, timeoutPromise]);
            console.log('✅ ReActReasoningNode: Got LLM response');
            
            const reasoning: ReasoningResponse = typeof response === 'string' 
                ? JSON.parse(response) 
                : response;
            
            console.log(`💭 Reasoning: ${reasoning.reasoning}`);
            console.log(`📊 Goal Status: ${reasoning.goalStatus}`);
            console.log(`🎯 Decision: ${reasoning.decision}`);
            
            if (reasoning.action) {
                console.log(`🛠️ Next Action: ${reasoning.action.tool} (${reasoning.action.server})`);
                console.log(`📝 Justification: ${reasoning.action.justification}`);
            }
            
            return {
                ...state,
                currentStep,
                currentReasoning: reasoning.reasoning,
                goalStatus: reasoning.goalStatus,
                nextAction: reasoning.action
            };
            
        } catch (error) {
            console.error('❌ Reasoning failed:', error);
            
            // Try a simple fallback without schema for YouTube URLs
            if (state.userRequest?.toLowerCase().includes('youtube.com') || state.userRequest?.toLowerCase().includes('youtu.be')) {
                console.log('🔄 Using fallback reasoning for YouTube request...');
                
                // Check if we already tried and failed
                const hasTriedTranscript = state.actionHistory?.some(action => 
                    action.tool === 'get_youtube_transcript' && !action.success
                );
                
                if (hasTriedTranscript || (state.actionHistory?.length || 0) > 0) {
                    // If transcript failed or we already tried, just complete with available info
                    console.log('📝 Transcript failed or already attempted - completing task');
                    return {
                        ...state,
                        currentStep,
                        currentReasoning: 'YouTube transcript unavailable, providing response based on URL',
                        goalStatus: 'Completing with available information',
                        nextAction: undefined // No more actions - go to summarization
                    };
                }
                
                return {
                    ...state,
                    currentStep,
                    currentReasoning: 'Detected YouTube URL - will fetch transcript and summarize',
                    goalStatus: 'Ready to fetch YouTube transcript',
                    nextAction: {
                        server: 'youtube-transcript',
                        tool: 'get_youtube_transcript',
                        parameters: {
                            video_url: this.extractYouTubeURL(state.userRequest),
                            keep_audio: false
                        },
                        justification: 'Fetching YouTube transcript to summarize the video content'
                    }
                };
            }
            
            // Fallback reasoning - decide to complete with current information
            return {
                ...state,
                currentStep,
                currentReasoning: `Reasoning failed: ${error instanceof Error ? error.message : String(error)}. Completing with available information.`,
                goalStatus: 'Completing due to reasoning error',
                nextAction: undefined
            };
        }
    }

    private buildReasoningPrompt(state: AgentSharedState, currentStep: number): string {
        const tools = state.availableTools || [];
        const history = state.actionHistory || [];
        const maxSteps = state.maxSteps || 10;
        
        let prompt = `You are a ReAct (Reasoning + Acting) agent. Your task is to help with: "${state.userRequest}"\n\n`;
        
        // Add available tools
        if (tools.length > 0) {
            prompt += `## Available Tools:\n`;
            tools.forEach(tool => {
                prompt += `- **${tool.name}** (${tool.server}): ${tool.description}\n`;
            });
            prompt += `\n`;
        } else {
            prompt += `## Available Tools:\nNo tools are currently available. You can still reason and provide helpful responses.\n\n`;
        }
        
        // Add action history
        if (history.length > 0) {
            prompt += `## Previous Actions:\n`;
            history.forEach((action, i) => {
                prompt += `Step ${action.step}: Used ${action.tool} - ${action.success ? 'SUCCESS' : 'FAILED'}\n`;
                prompt += `Result: ${action.result.substring(0, 200)}${action.result.length > 200 ? '...' : ''}\n\n`;
            });
        }
        
        prompt += `## Current Situation:\n`;
        prompt += `- Step ${currentStep} of ${maxSteps}\n`;
        prompt += `- User Request: ${state.userRequest}\n\n`;
        
        prompt += `## Your Task:\n`;
        prompt += `Analyze the situation and decide on the next action. You must respond with valid JSON containing:\n`;
        prompt += `- "reasoning": Your step-by-step thinking process\n`;
        prompt += `- "decision": Either "continue" (take action) or "complete" (finish)\n`;
        prompt += `- "goalStatus": Brief status of progress toward the goal\n`;
        prompt += `- "action": If continuing, specify the tool and parameters\n\n`;
        
        prompt += `Guidelines:\n`;
        prompt += `- If you have sufficient information to answer the user's request, choose "complete"\n`;
        prompt += `- If you need more information or should use a tool, choose "continue" and specify the action\n`;
        prompt += `- Be efficient - don't use tools unnecessarily\n`;
        prompt += `- If no relevant tools are available, provide the best response you can and complete\n`;
        
        return prompt;
    }

    private extractYouTubeURL(text: string): string {
        // Extract YouTube URL from text
        const youtubeUrlPattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/;
        const match = text.match(youtubeUrlPattern);
        if (match) {
            return `https://www.youtube.com/watch?v=${match[1]}`;
        }
        // Return the original text if no URL pattern found
        return text;
    }

    private getReasoningSchema(): any {
        return {
            "type": "object",
            "properties": {
                "reasoning": {"type": "string"},
                "decision": {"type": "string"},
                "goalStatus": {"type": "string"},
                "action": {
                    "type": "object", 
                    "properties": {
                        "server": {"type": "string"},
                        "tool": {"type": "string"},
                        "parameters": {"type": "object"},
                        "justification": {"type": "string"}
                    }
                }
            },
            "required": ["reasoning", "decision", "goalStatus"]
        };
    }
}