import { Node } from "pocketflow";
import { AgentSharedState, LLMProvider, ReasoningResponse, ActionDecision, LLMProcessingRequest, AgentProgressEvent } from '../types';

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
        
        // Emit step start progress
        this.emitProgress(shared, 'step_start', {
            stepType: 'reasoning',
            description: `Analyzing situation and planning next action`,
            progress: `Step ${currentStep}/${maxSteps}`
        }, currentStep);
        
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
        
        // Emit reasoning completion progress
        this.emitProgress(state, 'reasoning_complete', {
            reasoning: this.truncateText(reasoning.reasoning, 200),
            decision: reasoning.decision,
            goalStatus: reasoning.goalStatus,
            nextAction: reasoning.action ? `${reasoning.action.tool} (${reasoning.action.server})` : 'None'
        }, currentStep);
        
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
            
            // Handle special case: "user_request" refers to original user request
            let inputHistoryId = reasoning.inputHistoryId;
            if (inputHistoryId === 'user_request') {
                // Create an action history entry for the user's original request
                const userRequestHistoryId = `user-request-${Date.now()}`;
                
                if (!shared.actionHistory) {
                    shared.actionHistory = [];
                }
                
                shared.actionHistory.push({
                    step: 0,
                    stepType: 'user_input',
                    server: 'internal',
                    tool: 'user_request',
                    parameters: {},
                    result: shared.userRequest || '',
                    justification: 'Original user request content',
                    success: true,
                    historyId: userRequestHistoryId
                });
                
                inputHistoryId = userRequestHistoryId;
                console.log(`📝 Created user request history entry with ID: ${userRequestHistoryId}`);
            }
            
            shared.nextLLMRequest = {
                task: reasoning.llmTask,
                prompt: reasoning.llmPrompt,
                inputHistoryId: inputHistoryId
            };
            
            console.log(`🧠 Prepared LLM processing: ${reasoning.llmTask} using history ID: ${inputHistoryId}`);
        }
        
        // Handle image processing requests (generation + editing)
        if (reasoning.decision === 'process_image') {
            if (!reasoning.imagePrompt) {
                throw new Error('Image processing decision requires imagePrompt');
            }
            
            // Set the image prompt and configuration in shared state
            shared.currentImagePrompt = reasoning.imagePrompt;
            
            if (reasoning.imageConfig) {
                shared.imageConfig = reasoning.imageConfig;
            }
            
            console.log(`🎨 Prepared image processing: "${reasoning.imagePrompt.substring(0, 100)}${reasoning.imagePrompt.length > 100 ? '...' : ''}"`);
            console.log(`🎨 DEBUG: Full imagePrompt from reasoning: "${reasoning.imagePrompt}"`);
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
        
        prompt += `\n**Efficiency Principle**:\n`;
        prompt += `- Accomplish as much work as effectively and efficiently as possible in each step\n`;
        prompt += `- Look for opportunities to combine, batch, or parallelize related operations\n`;
        prompt += `- Examples: generate multiple files in one script, process multiple content pieces together, combine related tool calls\n\n`;
        
        // Add tool usage experience section
        prompt += this.getToolUsageExperience(tools);
        
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
            
            prompt += `**Efficiency Planning**: With only ${maxSteps} steps available, design an approach that maximizes progress per step.\n`;
            prompt += `Consider: Can multiple operations be combined? Can related tasks be handled together? What's the most direct path to completion?\n\n`;
        }
        
        prompt += `## Available Decisions:\n`;
        prompt += `1. **"continue"**: Use external tools for data gathering, file operations, web requests\n`;
        prompt += `2. **"llm_processing"**: Process content using internal LLM capabilities (translate, summarize, analyze, transform, extract, **fix code**, **rewrite code**, etc.)\n`;
        prompt += `3. **"process_image"**: Create or edit visual content using Gemini (generate new images, edit existing ones)\n`;
        prompt += `4. **"complete"**: Task is finished, ready for final summary\n\n`;
        
        prompt += `## LLM Processing Instructions:\n`;
        prompt += `When using "llm_processing", you must specify:\n`;
        prompt += `- "llmTask": Type of processing (translate, summarize, analyze, transform, extract, rewrite, **fix_code**, **debug_code**, etc.)\n`;
        prompt += `- "llmPrompt": Specific instructions for the LLM (be detailed and clear)\n`;
        prompt += `- "inputHistoryId": Reference to content to process:\n`;
        prompt += `  * Use "user_request" to process the original user request\n`;
        prompt += `  * **CRITICAL**: Use EXACT history ID from brackets above (e.g., "llm-4-123456789", "action-1-123456789")\n`;
        prompt += `  * **DO NOT** modify prefixes: "llm-" stays "llm-", "action-" stays "action-"\n`;
        prompt += `  * Use comma-separated IDs for multiple content like "llm-1-123,action-2-456"\n\n`;
        
        prompt += `## Image Processing Instructions:\n`;
        prompt += `When using "process_image", you must specify:\n`;
        prompt += `- "imagePrompt": Detailed description for image generation OR editing instructions for existing image\n`;
        prompt += `- "imageConfig": Optional configuration object with:\n`;
        prompt += `  * "aspectRatio": "1:1", "3:4", "4:3", "9:16", or "16:9" (default: "1:1")\n`;
        prompt += `  * "numberOfImages": 1-4 (default: 1)\n`;
        prompt += `  * "safetyFilterLevel": "BLOCK_MOST", "BLOCK_SOME", "BLOCK_FEW", or "BLOCK_NONE" (default: "BLOCK_MOST")\n\n`;
        
        prompt += `## Your Task:\n`;
        prompt += `Analyze the situation and decide on the next action. You must respond with valid JSON containing:\n`;
        prompt += `- "reasoning": Your step-by-step thinking process\n`;
        prompt += `- "decision": One of "continue", "llm_processing", "process_image", or "complete"\n`;
        prompt += `- "goalStatus": Brief status of progress toward the goal\n`;
        prompt += `- "action": If decision is "continue", specify external tool and parameters\n`;
        prompt += `- "llmTask": If decision is "llm_processing", specify the task type\n`;
        prompt += `- "llmPrompt": If decision is "llm_processing", provide detailed processing instructions\n`;
        prompt += `- "inputHistoryId": If decision is "llm_processing", reference the history ID to process\n`;
        prompt += `- "imagePrompt": If decision is "process_image", provide detailed description for image generation or editing\n`;
        prompt += `- "imageConfig": If decision is "process_image", optional configuration object\n\n`;
        
        prompt += `## Guidelines:\n`;
        prompt += `- Use "continue" for external data gathering (fetch, search, file operations)\n`;
        prompt += `- Use "llm_processing" for content transformation tasks on existing data:\n`;
        prompt += `  * **Code fixes**: When user reports syntax errors, bugs, or needs code corrections\n`;
        prompt += `  * **Content transformation**: Translate, summarize, analyze, rewrite, extract\n`;
        prompt += `  * **Processing user input**: When user provides content that needs to be modified\n`;
        prompt += `- Use "process_image" for visual content creation or editing:\n`;
        prompt += `  * **Generation**: Create diagrams, charts, illustrations, concept visualizations\n`;
        prompt += `  * **Editing**: Modify existing images - change colors, add elements, improve quality, style transfer\n`;
        prompt += `  * **Enhancement**: Improve image quality, lighting, clarity of existing images\n`;
        prompt += `- Use "complete" when the user's request has been fully accomplished AND no content processing is needed\n`;
        prompt += `- **CRITICAL**: Reference history IDs exactly as shown in brackets [like-this] - copy the EXACT ID including prefixes\n`;
        prompt += `- **EFFICIENCY PRIORITY**: With ${remainingSteps} steps remaining, maximize work per step\n`;
        prompt += `- **STRATEGIC APPROACH**: Choose actions that accomplish the most progress toward your goal\n`;
        prompt += `- **COMBINE OPERATIONS**: Look for ways to handle multiple related tasks in single actions\n`;
        
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
     * Truncate text for progress display
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Generate tool usage experience guidance based on available tools
     */
    private getToolUsageExperience(tools: any[]): string {
        const hasFilesystem = tools.some(t => t.server === 'filesystem');
        const hasCommands = tools.some(t => t.server === 'commands');
        const hasYoutube = tools.some(t => t.server === 'youtube-transcript');
        
        if (!hasFilesystem && !hasCommands && !hasYoutube) {
            return '';
        }
        
        let experience = `## Tool Usage Experience (Best Practices):\n`;
        
        if (hasFilesystem) {
            experience += `**Filesystem Operations:**\n`;
            experience += `- Before file operations, use 'list_allowed_directories' to understand available paths\n`;
            experience += `- Use 'list_directory' to check directory contents before reading/writing files\n`;
            experience += `- Verify file paths exist before attempting operations\n\n`;
        }
        
        if (hasCommands) {
            experience += `**Command Execution:**\n`;
            experience += `- If commands fail with syntax errors, try 'command --help' to understand usage\n\n`;
        }
        
        if (hasYoutube) {
            experience += `**YouTube Operations:**\n`;
            experience += `- Extract clean YouTube URLs before calling transcript tools\n`;
            experience += `- Set keep_audio=false unless specifically requested to save space\n\n`;
        }
        
        return experience;
    }

    private getReasoningSchema(): any {
        return {
            "type": "object",
            "properties": {
                "reasoning": {"type": "string"},
                "decision": {"type": "string", "enum": ["continue", "complete", "llm_processing", "process_image"]},
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
                "inputHistoryId": {"type": "string"},
                "imagePrompt": {"type": "string"},
                "imageConfig": {
                    "type": "object",
                    "properties": {
                        "aspectRatio": {"type": "string", "enum": ["1:1", "3:4", "4:3", "9:16", "16:9"]},
                        "numberOfImages": {"type": "number", "minimum": 1, "maximum": 4},
                        "safetyFilterLevel": {"type": "string", "enum": ["BLOCK_MOST", "BLOCK_SOME", "BLOCK_FEW", "BLOCK_NONE"]}
                    }
                }
            },
            "required": ["reasoning", "decision", "goalStatus"]
        };
    }
}