import { Flow } from "pocketflow";
import { AgentSharedState, LLMProvider, MCPClient, ModelConfig, ProgressCallback } from './types';
import { DiscoverToolsNode } from './nodes/DiscoverToolsNode';
import { ReActReasoningNode } from './nodes/ReActReasoningNode';
import { ReActActionNode } from './nodes/ReActActionNode';
import { LLMProcessingNode } from './nodes/LLMProcessingNode';
import { SummarizeResultsNode } from './nodes/SummarizeResultsNode';
import { GeminiImageNode } from './nodes/GeminiImageNode';
import { GeminiTTSNode } from './nodes/GeminiTTSNode';

/**
 * PocketFlow-based ReAct Agent using proper Flow class and node chaining
 * This implementation follows true PocketFlow patterns with automatic workflow execution
 */
export class ReActFlow {
    private flow: Flow<AgentSharedState>;
    private discoverToolsNode: DiscoverToolsNode;
    private reasoningNode: ReActReasoningNode;
    private actionNode: ReActActionNode;
    private llmProcessingNode: LLMProcessingNode;
    private imageNode: GeminiImageNode;
    private ttsNode: GeminiTTSNode;
    private summarizeNode: SummarizeResultsNode;

    constructor(
        private llmProvider: LLMProvider,
        private mcpClient: MCPClient,
        private modelConfig: ModelConfig,
        private geminiApiKey: string,
        private pluginDataPath?: string, // NEW: Plugin data directory for settings.json access
        // Retry configuration options
        reasoningRetries: number = 3,
        actionRetries: number = 3,
        llmProcessingRetries: number = 3,
        imageGenerationRetries: number = 3,
        ttsRetries: number = 2,
        summarizeRetries: number = 2
    ) {
        // Initialize PocketFlow nodes
        this.discoverToolsNode = new DiscoverToolsNode(mcpClient, 1, 1);
        this.reasoningNode = new ReActReasoningNode(llmProvider, reasoningRetries, 2);
        this.actionNode = new ReActActionNode(mcpClient, actionRetries, 1);
        this.llmProcessingNode = new LLMProcessingNode(llmProvider, llmProcessingRetries, 1);
        this.imageNode = new GeminiImageNode(geminiApiKey, llmProvider, imageGenerationRetries, 2);
        this.ttsNode = new GeminiTTSNode(geminiApiKey, llmProvider, ttsRetries, 5);
        this.summarizeNode = new SummarizeResultsNode(llmProvider, summarizeRetries, 1);

        // Set up PocketFlow node chaining with conditional branching
        this.setupNodeChaining();

        // Create the Flow starting with tool discovery
        this.flow = new Flow<AgentSharedState>(this.discoverToolsNode);
    }

    /**
     * Set up PocketFlow node chaining with conditional transitions
     * Following PocketFlow patterns for automatic workflow execution
     */
    private setupNodeChaining(): void {
        // Step 1: Tool Discovery -> Reasoning
        this.discoverToolsNode.next(this.reasoningNode);

        // Step 2: Reasoning -> 5-way routing (UNIFIED MULTIMODAL PROCESSING)
        this.reasoningNode.on("continue", this.actionNode);           // External MCP actions
        this.reasoningNode.on("llm_processing", this.llmProcessingNode); // Internal LLM processing
        this.reasoningNode.on("process_image", this.imageNode);       // Unified image processing (generation + editing)
        this.reasoningNode.on("generate_speech", this.ttsNode);       // Text-to-speech generation
        this.reasoningNode.on("complete", this.summarizeNode);        // Final summary

        // Step 3: Action routing
        this.actionNode.on("default", this.reasoningNode);
        this.llmProcessingNode.on("continue", this.reasoningNode);
        this.imageNode.on("default", this.reasoningNode);  // For generation tasks (return 'default')
        this.imageNode.on("complete", this.summarizeNode); // For editing tasks (return 'complete')
        this.ttsNode.on("default", this.reasoningNode);    // TTS continues to reasoning for follow-up

        // Step 4: Summarization is the end (no next node)
        // this.summarizeNode returns undefined in post() to end the flow
    }

    /**
     * Set progress callback for real-time updates
     */
    setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback;
    }

    private progressCallback?: ProgressCallback;

    /**
     * Execute the ReAct workflow using PocketFlow's automatic execution
     * 
     * @param userRequest The user's request to process
     * @param maxSteps Maximum number of reasoning steps (default: 10)
     * @returns Object containing final response and any generated images
     */
    async execute(userRequest: string, maxSteps: number = 10, abortSignal?: AbortSignal): Promise<{ result: string; images?: string[] }> {
        console.log('🚀 PocketFlow ReAct Agent - Starting execution');
        console.log(`📝 User Request: ${userRequest}`);
        console.log(`🔢 Max Steps: ${maxSteps}`);
        console.log(`🎯 Model Config: reasoning=${this.modelConfig.reasoning}, processing=${this.modelConfig.processing}, default=${this.modelConfig.default}`);

        // Initialize shared state
        const sharedState: AgentSharedState = {
            userRequest,
            maxSteps,
            currentStep: 0,
            actionHistory: [],
            modelConfig: this.modelConfig, // Use the configured model settings
            startTime: Date.now(),
            progressCallback: this.progressCallback,
            abortSignal,
            // NEW: Configuration and filesystem support
            mcpConfig: this.loadMCPConfig(),
            pluginWorkingDir: this.getPluginWorkingDir(),
            mcpClient: this.mcpClient
        };

        try {
            // Check for cancellation before starting
            if (abortSignal?.aborted) {
                throw new DOMException('Operation was cancelled', 'AbortError');
            }
            
            // Execute the flow with cancellation monitoring
            await this.executeWithCancellation(sharedState, abortSignal);

            const finalResult = sharedState.finalResult || 'Agent completed but no result was generated.';
            const actionCount = sharedState.actionHistory?.length || 0;
            const stepCount = sharedState.currentStep || 0;
            
            // Extract generated images if any
            const generatedImages = sharedState.generatedImages?.map(img => img.imageBytes) || [];

            console.log(`\n🎉 PocketFlow ReAct Agent - Execution Complete`);
            console.log(`📊 Actions taken: ${actionCount}/${maxSteps}`);
            console.log(`⚡ Steps completed: ${stepCount}`);
            console.log(`📄 Result length: ${finalResult.length} characters`);
            if (generatedImages.length > 0) {
                console.log(`📸 Generated images: ${generatedImages.length}`);
            }

            return {
                result: finalResult,
                images: generatedImages.length > 0 ? generatedImages : undefined
            };

        } catch (error) {
            console.error('❌ PocketFlow Agent execution failed:', error);

            // Return whatever partial results we have
            const partialResult = sharedState.finalResult || this.generateErrorResponse(userRequest, error);
            const partialImages = sharedState.generatedImages?.map(img => img.imageBytes) || [];
            return {
                result: partialResult,
                images: partialImages.length > 0 ? partialImages : undefined
            };
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
     * Load MCP configuration from settings.json
     */
    private loadMCPConfig(): { workingDirectory?: string } | undefined {
        try {
            // Import Node.js filesystem module
            const fs = require('fs');
            const path = require('path');
            
            // Get plugin data path (passed from AgenticLLMService via constructor)
            const pluginDataPath = this.getPluginDataPath();
            if (!pluginDataPath) {
                console.warn('Plugin data path not available for MCP config loading');
                return undefined;
            }
            
            const settingsPath = path.join(pluginDataPath, 'settings.json');
            
            // Check if settings.json exists
            if (!fs.existsSync(settingsPath)) {
                console.log('📋 No settings.json found - MCP filesystem operations will use fallback');
                return undefined;
            }
            
            // Load and parse settings.json
            const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(settingsContent);
            
            // Extract MCP servers configuration
            const mcpServers = settings.mcpServers || {};
            
            // Look for filesystem server to get working directory
            const filesystemServer = mcpServers.filesystem || mcpServers['filesystem'];
            if (filesystemServer && filesystemServer.args) {
                // Extract working directory from filesystem server args
                // Format: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
                const args = Array.isArray(filesystemServer.args) ? filesystemServer.args : [];
                const workingDirectory = args[args.length - 1]; // Last argument is usually the directory
                
                if (workingDirectory && workingDirectory.startsWith('/')) {
                    console.log(`📋 Loaded MCP working directory from settings: ${workingDirectory}`);
                    return { workingDirectory };
                }
            }
            
            console.log('📋 No MCP filesystem working directory found in settings.json');
            return undefined;
            
        } catch (error) {
            console.warn('Failed to load MCP config from settings.json:', error);
            return undefined;
        }
    }

    /**
     * Get plugin working directory
     */
    private getPluginWorkingDir(): string | undefined {
        try {
            // Get plugin data path from the dependency injection context
            const pluginDataPath = this.getPluginDataPath();
            
            if (pluginDataPath) {
                console.log(`📁 Using plugin working directory: ${pluginDataPath}`);
                return pluginDataPath;
            }
            
            // Fallback to current working directory
            const fallbackDir = process.cwd();
            console.log(`📁 Using fallback working directory: ${fallbackDir}`);
            return fallbackDir;
            
        } catch (error) {
            console.warn('Failed to get plugin working directory:', error);
            return process.cwd(); // Last resort fallback
        }
    }
    
    /**
     * Get plugin data path (to be injected by AgenticLLMService)
     */
    private getPluginDataPath(): string | undefined {
        // This will be set via dependency injection from AgenticLLMService
        // which has access to the plugin's data directory
        return this.pluginDataPath;
    }

    /**
     * Execute the flow with cancellation monitoring
     * Following PocketFlow best practices for graceful cancellation
     */
    private async executeWithCancellation(sharedState: AgentSharedState, abortSignal?: AbortSignal): Promise<void> {
        // Create a cancellation promise that rejects when aborted
        const cancellationPromise = new Promise<never>((_, reject) => {
            if (abortSignal?.aborted) {
                reject(new DOMException('Operation was cancelled', 'AbortError'));
                return;
            }
            
            const abortHandler = () => {
                sharedState.cancelled = true;
                reject(new DOMException('Operation was cancelled', 'AbortError'));
            };
            
            abortSignal?.addEventListener('abort', abortHandler, { once: true });
        });
        
        // Race the flow execution against cancellation
        try {
            await Promise.race([
                this.flow.run(sharedState),
                cancellationPromise
            ]);
        } catch (error) {
            // If it's a cancellation error, perform graceful cleanup
            if (error instanceof DOMException && error.name === 'AbortError') {
                await this.performGracefulCleanup(sharedState);
                throw error;
            }
            
            // For other errors, re-throw as-is
            throw error;
        }
    }

    /**
     * Perform graceful cleanup for cancelled flows
     * Ensures cancellation is harmless for following requests
     */
    private async performGracefulCleanup(sharedState: AgentSharedState): Promise<void> {
        try {
            console.log('🧹 Performing graceful cleanup after cancellation...');
            
            // Clean up any pending operations
            if (sharedState.nextAction) {
                console.log('  - Cleaning up pending action');
                sharedState.nextAction = undefined;
            }
            
            // Clean up any pending LLM requests
            if (sharedState.nextLLMRequest) {
                console.log('  - Cleaning up pending LLM request');
                sharedState.nextLLMRequest = undefined;
            }
            
            // Clean up partial reasoning state
            if (sharedState.currentReasoning) {
                console.log('  - Cleaning up partial reasoning state');
                sharedState.currentReasoning = undefined;
            }
            
            // Clean up any pending image generation
            if (sharedState.currentImagePrompt) {
                console.log('  - Cleaning up pending image generation');
                sharedState.currentImagePrompt = undefined;
                sharedState.imageProcessingComplete = false;
            }
            
            // Clean up any pending TTS operations
            if (sharedState.currentTTSText) {
                console.log('  - Cleaning up pending TTS operation');
                sharedState.currentTTSText = undefined;
            }
            
            // Set final status to indicate clean cancellation
            sharedState.goalStatus = 'cancelled';
            sharedState.cancelled = true;
            
            // Generate a clean cancellation message
            if (!sharedState.finalResult) {
                sharedState.finalResult = 'Request was cancelled by user. No partial results to report.';
            }
            
            console.log('✅ Graceful cleanup completed - ready for next request');
        } catch (cleanupError) {
            console.warn('⚠️ Error during graceful cleanup:', cleanupError);
            // Don't throw cleanup errors - cancellation should still succeed
            // Ensure minimum cleanup is done
            sharedState.cancelled = true;
            sharedState.goalStatus = 'cancelled';
        }
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