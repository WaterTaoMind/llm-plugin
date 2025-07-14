import { Flow } from "pocketflow";
import { AgentSharedState, LLMProvider, MCPClient, ModelConfig, ProgressCallback } from './types';
import { DiscoverToolsNode } from './nodes/DiscoverToolsNode';
import { ReActReasoningNode } from './nodes/ReActReasoningNode';
import { ReActActionNode } from './nodes/ReActActionNode';
import { LLMProcessingNode } from './nodes/LLMProcessingNode';
import { SummarizeResultsNode } from './nodes/SummarizeResultsNode';
import { GeminiImageNode } from './nodes/GeminiImageNode';

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
        summarizeRetries: number = 2
    ) {
        // Initialize PocketFlow nodes
        this.discoverToolsNode = new DiscoverToolsNode(mcpClient, 1, 1);
        this.reasoningNode = new ReActReasoningNode(llmProvider, reasoningRetries, 2);
        this.actionNode = new ReActActionNode(mcpClient, actionRetries, 1);
        this.llmProcessingNode = new LLMProcessingNode(llmProvider, llmProcessingRetries, 1);
        this.imageNode = new GeminiImageNode(geminiApiKey, llmProvider, imageGenerationRetries, 2);
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

        // Step 2: Reasoning -> 4-way routing (UNIFIED IMAGE PROCESSING)
        this.reasoningNode.on("continue", this.actionNode);           // External MCP actions
        this.reasoningNode.on("llm_processing", this.llmProcessingNode); // Internal LLM processing
        this.reasoningNode.on("process_image", this.imageNode);       // Unified image processing (generation + editing)
        this.reasoningNode.on("complete", this.summarizeNode);        // Final summary

        // Step 3: All action types loop back to Reasoning (for iterative ReAct)
        this.actionNode.on("default", this.reasoningNode);
        this.llmProcessingNode.on("continue", this.reasoningNode);
        this.imageNode.on("default", this.reasoningNode);

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
    async execute(userRequest: string, maxSteps: number = 10): Promise<{ result: string; images?: string[] }> {
        console.log('🚀 PocketFlow ReAct Agent - Starting execution');
        console.log(`📝 User Request: ${userRequest}`);
        console.log(`🔢 Max Steps: ${maxSteps}`);

        // Initialize shared state
        const sharedState: AgentSharedState = {
            userRequest,
            maxSteps,
            currentStep: 0,
            actionHistory: [],
            modelConfig: undefined, // Will be set by nodes if needed
            startTime: Date.now(),
            progressCallback: this.progressCallback,
            // NEW: Configuration and filesystem support
            mcpConfig: this.loadMCPConfig(),
            pluginWorkingDir: this.getPluginWorkingDir(),
            mcpClient: this.mcpClient
        };

        try {
            // Execute the flow using PocketFlow's automatic execution
            // The flow will automatically follow the node chaining we set up
            await this.flow.run(sharedState);

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