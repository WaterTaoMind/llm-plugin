import { Node } from "pocketflow";
import { AgentSharedState, LLMProvider, ReasoningResponse, ActionDecision, LLMProcessingRequest } from '../types';

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
        
        const response = await this.llmProvider.callLLMWithSchema(
            prompt,
            this.getReasoningSchema(),
            state.modelConfig?.reasoning
        );
        
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
        
        // Handle LLM processing requests
        if (reasoning.decision === 'llm_processing') {
            if (!reasoning.llmTask || !reasoning.llmPrompt || !reasoning.inputHistoryId) {
                throw new Error('LLM processing decision requires llmTask, llmPrompt, and inputHistoryId');
            }
            
            shared.nextLLMRequest = {
                task: reasoning.llmTask,
                prompt: reasoning.llmPrompt,
                inputHistoryId: reasoning.inputHistoryId
            };
            
            console.log(`🧠 Prepared LLM processing: ${reasoning.llmTask} using history ID: ${reasoning.inputHistoryId}`);
        }
        
        // Check if we've reached maximum steps
        if (currentStep >= maxSteps) {
            console.log(`⏰ Reached maximum steps (${maxSteps}) - forcing completion`);
            shared.goalStatus = `Completed after reaching maximum ${maxSteps} steps`;
            return "complete"; // Force completion
        }
        
        // Return action for PocketFlow conditional branching
        // This determines which node to execute next: "continue", "llm_processing", or "complete"
        return reasoning.decision;
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
        const remainingSteps = maxSteps - currentStep;
        
        let prompt = `You are a ReAct (Reasoning + Acting) agent. Your task is to help with: "${state.userRequest}"\n\n`;
        
        // Add step efficiency awareness
        prompt += `## Step Efficiency Guidelines:\n`;
        prompt += `⏱️ **Current Step**: ${currentStep}/${maxSteps} (${remainingSteps} steps remaining)\n`;
        prompt += `🎯 **Efficiency Focus**: With ${remainingSteps} steps left, consider how to accomplish the most work in each step while maintaining quality.\n`;
        
        if (remainingSteps <= 5) {
            prompt += `⚠️ **Limited Steps**: You have only ${remainingSteps} steps remaining. Plan carefully and batch operations when possible.\n`;
        }
        
        if (remainingSteps <= 2) {
            prompt += `🚨 **Critical Phase**: Only ${remainingSteps} steps left! Prioritize completing the core task. Consider using 'llm_processing' to handle multiple transformations in one step.\n`;
        }
        
        prompt += `\n**Efficiency Strategies**:\n`;
        prompt += `- When processing multiple similar items, handle several in one step when possible\n`;
        prompt += `- Use 'llm_processing' to batch content transformations, analysis, or generation tasks\n`;
        prompt += `- Combine related file operations or data gathering in single tool calls\n`;
        prompt += `- If generating multiple audio segments, scripts, or files, process them in batches\n\n`;
        
        // Add available tools with enhanced information
        if (tools.length > 0) {
            prompt += `## Available Tools (IMPORTANT: Use exact server names shown):\n`;
            
            // Group tools by server for better organization while keeping server names clear
            const toolsByServer = tools.reduce((acc, tool) => {
                if (!acc[tool.server]) acc[tool.server] = [];
                acc[tool.server].push(tool);
                return acc;
            }, {} as Record<string, typeof tools>);
            
            Object.entries(toolsByServer).forEach(([serverName, serverTools]) => {
                prompt += `\n**${serverName}:**\n`;
                serverTools.forEach(tool => {
                    prompt += `- **${tool.name}** (SERVER: ${tool.server}): ${tool.description}\n`;
                    // Include parameter schema for proper usage
                    if (tool.inputSchema && tool.inputSchema.properties) {
                        const params = Object.keys(tool.inputSchema.properties);
                        prompt += `  Parameters: {${params.map(p => `"${p}"`).join(', ')}}\n`;
                    }
                });
            });
            prompt += `\n`;
        } else {
            prompt += `## Available Tools:\nNo tools are currently available. You can still reason and provide helpful responses.\n\n`;
        }
        
        // Add action history with historyId references
        if (history.length > 0) {
            prompt += `## Previous Actions:\n`;
            history.forEach((action) => {
                const stepTypeIcon = action.stepType === 'llm_processing' ? '🧠' : '🔧';
                prompt += `[${action.historyId}] ${stepTypeIcon} Step ${action.step} (${action.stepType}): ${action.tool} - ${action.success ? 'SUCCESS' : 'FAILED'}\n`;
                
                // Provide complete results for proper decision making
                // Show full content to enable correct decision-making
                prompt += `Result: ${action.result}\n\n`;
            });
        }
        
        prompt += `## Current Situation:\n`;
        prompt += `- Step ${currentStep} of ${maxSteps} (${remainingSteps} remaining)\n`;
        prompt += `- User Request: ${state.userRequest}\n`;
        
        // Add basic progress info
        if (history.length > 0) {
            const successfulActions = history.filter(action => action.success).length;
            const failedActions = history.filter(action => !action.success).length;
            prompt += `- Progress: ${successfulActions} successful actions, ${failedActions} failed actions\n`;
        }
        prompt += `\n`;
        
        // Add task decomposition for first step with efficiency planning
        if (currentStep === 1 && (history.length === 0)) {
            prompt += `## Initial Task Decomposition & Efficiency Planning:\n`;
            prompt += `Before taking any actions, analyze the user request and plan efficiently:\n`;
            prompt += `1. What is the complete goal the user wants to achieve?\n`;
            prompt += `2. What are the sequential steps needed, and how can they be batched?\n`;
            prompt += `3. Which tools/capabilities will be required for each step?\n`;
            prompt += `4. How can you accomplish multiple sub-tasks in each step?\n`;
            prompt += `5. What will the final deliverable look like?\n\n`;
            
            prompt += `**Efficiency Planning**: With only ${maxSteps} steps available, plan to accomplish multiple related tasks in each step.\n`;
            prompt += `For example:\n`;
            prompt += `- If generating multiple files/segments, batch them together\n`;
            prompt += `- If processing multiple pieces of content, handle them in one 'llm_processing' step\n`;
            prompt += `- If fetching multiple resources, combine requests when possible\n\n`;
        }
        
        prompt += `## Available Decisions:\n`;
        prompt += `1. **"continue"**: Use external tools for data gathering, file operations, web requests\n`;
        prompt += `2. **"llm_processing"**: Process content using internal LLM capabilities (translate, summarize, analyze, transform, extract, etc.)\n`;
        prompt += `3. **"complete"**: Task is finished, ready for final summary\n\n`;
        
        prompt += `## LLM Processing Instructions:\n`;
        prompt += `When using "llm_processing", you must specify:\n`;
        prompt += `- "llmTask": Type of processing (translate, summarize, analyze, transform, extract, rewrite, etc.)\n`;
        prompt += `- "llmPrompt": Specific instructions for the LLM (be detailed and clear)\n`;
        prompt += `- "inputHistoryId": Reference to history entry containing content to process (use exact ID from brackets above)\n`;
        prompt += `  * For single content: use one ID like "action-1-123456789"\n`;
        prompt += `  * For multiple content: use comma-separated IDs like "action-1-123,action-2-456,action-3-789"\n\n`;
        
        prompt += `## Your Task:\n`;
        prompt += `Analyze the situation and decide on the next action. You must respond with valid JSON containing:\n`;
        prompt += `- "reasoning": Your step-by-step thinking process\n`;
        prompt += `- "decision": One of "continue", "llm_processing", or "complete"\n`;
        prompt += `- "goalStatus": Brief status of progress toward the goal\n`;
        prompt += `- "action": If decision is "continue", specify external tool and parameters\n`;
        prompt += `- "llmTask": If decision is "llm_processing", specify the task type\n`;
        prompt += `- "llmPrompt": If decision is "llm_processing", provide detailed processing instructions\n`;
        prompt += `- "inputHistoryId": If decision is "llm_processing", reference the history ID to process\n\n`;
        
        prompt += `## Guidelines:\n`;
        prompt += `- Use "continue" for external data gathering (fetch, search, file operations)\n`;
        prompt += `- Use "llm_processing" for content transformation tasks on existing data\n`;
        prompt += `- Use "complete" when the user's request has been fully accomplished\n`;
        prompt += `- Reference history IDs exactly as shown in brackets [like-this]\n`;
        prompt += `- **EFFICIENCY PRIORITY**: With ${remainingSteps} steps remaining, maximize work per step\n`;
        prompt += `- **BATCH OPERATIONS**: When generating multiple items (audio segments, files, content), handle several together\n`;
        prompt += `- **SMART DECISIONS**: Choose actions that accomplish the most toward your goal\n`;
        
        if (remainingSteps <= 3) {
            prompt += `- **CRITICAL**: Only ${remainingSteps} steps left - focus on completing core requirements\n`;
        }
        
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
                "decision": {"type": "string", "enum": ["continue", "complete", "llm_processing"]},
                "goalStatus": {"type": "string"},
                "action": {
                    "type": "object", 
                    "properties": {
                        "server": {"type": "string"},
                        "tool": {"type": "string"},
                        "parameters": {"type": "object"},
                        "justification": {"type": "string"}
                    },
                    "required": ["server", "tool", "parameters", "justification"]
                },
                "llmTask": {"type": "string"},
                "llmPrompt": {"type": "string"},
                "inputHistoryId": {"type": "string"}
            },
            "required": ["reasoning", "decision", "goalStatus"]
        };
    }
}