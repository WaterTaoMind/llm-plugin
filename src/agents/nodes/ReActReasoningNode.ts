import { Node } from "pocketflow";
import { AgentSharedState, LLMProvider, ReasoningResponse, ActionDecision } from '../types';

/**
 * Node for ReAct reasoning step
 * Following PocketFlow TypeScript SDK patterns with built-in retry logic
 */
export class ReActReasoningNode extends Node<AgentSharedState> {
    constructor(
        private llmProvider: LLMProvider, 
        maxRetries: number = 3, 
        waitTime: number = 2
    ) {
        super(maxRetries, waitTime);
    }

    async prep(shared: AgentSharedState): Promise<{ state: AgentSharedState; currentStep: number }> {
        const currentStep = (shared.currentStep || 0) + 1;
        const maxSteps = shared.maxSteps || 10;
        
        console.log(`🤔 ReAct Reasoning - Step ${currentStep}/${maxSteps}`);
        
        return { state: shared, currentStep };
    }

    async exec(prepData: { state: AgentSharedState; currentStep: number }): Promise<ReasoningResponse> {
        const { state, currentStep } = prepData;
        
        console.log(`🔧 ReActReasoningNode: Executing reasoning step`);
        
        const prompt = this.buildReasoningPrompt(state, currentStep);
        
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
        
        const reasoning: ReasoningResponse = typeof response === 'string' 
            ? JSON.parse(response) 
            : response;
        
        // Validate the response
        if (!reasoning.reasoning || !reasoning.decision || !reasoning.goalStatus) {
            throw new Error('Invalid reasoning response structure');
        }
        
        console.log(`💭 Reasoning: ${reasoning.reasoning}`);
        console.log(`📊 Goal Status: ${reasoning.goalStatus}`);
        console.log(`🎯 Decision: ${reasoning.decision}`);
        
        if (reasoning.action) {
            console.log(`🛠️ Next Action: ${reasoning.action.tool} (${reasoning.action.server})`);
            console.log(`📝 Justification: ${reasoning.action.justification}`);
        }
        
        return reasoning;
    }

    async post(
        shared: AgentSharedState,
        prepData: { state: AgentSharedState; currentStep: number },
        reasoning: ReasoningResponse
    ): Promise<string | undefined> {
        const { currentStep } = prepData;
        const maxSteps = shared.maxSteps || 10;
        
        // Update shared state
        Object.assign(shared, {
            currentStep,
            currentReasoning: reasoning.reasoning,
            goalStatus: reasoning.goalStatus,
            nextAction: reasoning.action
        });
        
        // Check if we've reached maximum steps
        if (currentStep >= maxSteps) {
            console.log(`⏰ Reached maximum steps (${maxSteps}) - forcing completion`);
            shared.goalStatus = `Completed after reaching maximum ${maxSteps} steps`;
            return "complete"; // Force completion
        }
        
        // Return action for PocketFlow conditional branching
        // This determines which node to execute next
        return reasoning.decision; // "continue" or "complete"
    }

    /**
     * Fallback method when all retries fail
     * Following PocketFlow execFallback pattern
     */
    async execFallback(prepData: { state: AgentSharedState; currentStep: number }, error: Error): Promise<ReasoningResponse> {
        const { state, currentStep } = prepData;
        console.log('🔄 Using reasoning fallback...');
        
        // Try a simple fallback without schema for YouTube URLs
        if (state.userRequest?.toLowerCase().includes('youtube.com') || state.userRequest?.toLowerCase().includes('youtu.be')) {
            console.log('🎬 YouTube URL detected - using specialized fallback');
            
            // Check if we already tried and failed
            const hasTriedTranscript = state.actionHistory?.some(action => 
                action.tool === 'get_youtube_transcript' && !action.success
            );
            
            if (hasTriedTranscript || (state.actionHistory?.length || 0) > 0) {
                // If transcript failed or we already tried, just complete with available info
                console.log('📝 Transcript failed or already attempted - completing task');
                return {
                    reasoning: 'YouTube transcript unavailable, providing response based on URL',
                    goalStatus: 'Completing with available information',
                    decision: 'complete',
                    action: undefined // No more actions - go to summarization
                };
            }
            
            return {
                reasoning: 'Detected YouTube URL - will fetch transcript and summarize',
                goalStatus: 'Ready to fetch YouTube transcript',
                decision: 'continue',
                action: {
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
        
        // General fallback - decide to complete with current information
        return {
            reasoning: `Reasoning failed: ${error.message}. Completing with available information.`,
            goalStatus: 'Completing due to reasoning error',
            decision: 'complete',
            action: undefined
        };
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