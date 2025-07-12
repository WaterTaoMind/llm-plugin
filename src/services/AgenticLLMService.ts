import { LLMRequest, LLMResponse, LLMPluginSettings } from '../core/types';
import { MCPClientService } from './MCPClientService';
import { ReActAgent } from '../agents/ReActAgent';
import { LLMWilsonProvider } from '../agents/LLMWilsonProvider';
import { MCPClientAdapter } from '../agents/MCPClientAdapter';
import { ModelConfig, ProgressCallback } from '../agents/types';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Agentic LLM Service using TypeScript ReAct Agent
 * 
 * This service replaces simple LLM calls with a native TypeScript agentic ReAct system
 * that can reason, plan, and use tools to accomplish complex tasks.
 * 
 * Replaces the previous Python subprocess approach with proper TypeScript integration.
 */
export class AgenticLLMService {
    private mcpClientService?: MCPClientService;
    private reActAgent?: ReActAgent;
    private agentPath: string;

    constructor(private settings: LLMPluginSettings) {
        // Path to the ReAct agent implementation
        this.agentPath = this.getAgentPath();
    }

    /**
     * Set MCP client service for tool integration
     */
    setMCPClientService(mcpClientService: MCPClientService): void {
        this.mcpClientService = mcpClientService;
        this.initializeReActAgent();
    }

    /**
     * Initialize the TypeScript ReAct Agent system
     */
    private initializeReActAgent(): void {
        if (!this.mcpClientService) {
            console.warn('Cannot initialize ReAct flow without MCP client service');
            return;
        }

        try {
            // Create LLM provider using FastAPI wrapper
            const llmProvider = new LLMWilsonProvider(
                this.settings.llmConnectorApiUrl || 'http://localhost:49153',
                this.settings.llmConnectorApiKey || 'your_api_key'
            );
            
            // Create MCP client adapter
            const mcpClient = new MCPClientAdapter(this.mcpClientService);
            
            // Create model configuration
            const modelConfig: ModelConfig = {
                reasoning: this.settings.defaultModel || 'gpt-4o-mini',
                summarization: this.settings.defaultModel || 'gpt-4o-mini',
                default: this.settings.defaultModel || 'gpt-4o-mini'
            };
            
            // Initialize the TypeScript ReAct Agent system
            this.reActAgent = new ReActAgent(llmProvider, mcpClient, modelConfig);
            
            console.log('✅ TypeScript ReAct Agent initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize ReAct flow:', error);
        }
    }

    /**
     * Set progress callback for real-time updates
     */
    setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback;
        if (this.reActAgent) {
            this.reActAgent.setProgressCallback(callback);
        }
    }

    private progressCallback?: ProgressCallback;

    /**
     * Send request to agentic system (always use PocketFlow ReAct in Agent mode)
     */
    async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        try {
            // In Agent mode, always use the PocketFlow ReAct system - no complexity detection
            console.log('🤖 Agent Mode: Using PocketFlow ReAct System');
            return await this.callAgenticSystem(request);

        } catch (error) {
            console.error('Failed to send agentic request:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    // Removed: isSimpleRequest() - complexity detection is now handled 
    // at the LLMService level via explicit mode selection

    /**
     * Call simple LLM for basic requests
     */
    private async callSimpleLLM(request: LLMRequest): Promise<LLMResponse> {
        // Use Simon Wilson's LLM CLI directly
        return await this.callLLMCLI(request.prompt, request.model || 'gpt-4o-mini');
    }

    /**
     * Call PocketFlow ReAct system for complex requests
     */
    private async callAgenticSystem(request: LLMRequest): Promise<LLMResponse> {
        try {
            console.log('🤖 Using TypeScript ReAct Agent...');

            if (!this.reActAgent) {
                const error = 'TypeScript ReAct Agent not initialized - cannot process in Agent mode';
                console.error('❌', error);
                return {
                    result: '',
                    error: error
                };
            }

            // Set progress callback if available
            if (this.progressCallback) {
                this.reActAgent.setProgressCallback(this.progressCallback);
            }

            // Determine max steps based on request complexity
            const maxSteps = this.getMaxStepsForRequest(request);
            
            // Execute the TypeScript ReAct Agent
            const result = await this.reActAgent.execute(request.prompt, maxSteps);

            return {
                result: result,
                conversationId: request.conversationId
            };

        } catch (error) {
            console.error('❌ TypeScript ReAct Agent error:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Flow execution failed'
            };
        }
    }

    /**
     * Get maximum steps from settings
     */
    private getMaxStepsForRequest(request: LLMRequest): number {
        // Use configurable agentMaxSteps from settings
        return this.settings.agentMaxSteps || 20;
    }

    /**
     * Check if TypeScript agent system is available
     */
    async isAgentAvailable(): Promise<boolean> {
        try {
            const llmPath = '/opt/homebrew/Caskroom/miniconda/base/envs/llm/bin/llm';
            const llmExists = fs.existsSync(llmPath);
            const agentInitialized = !!this.reActAgent;
            
            console.log(`🔍 TypeScript ReAct Agent availability check:`);
            console.log(`   LLM CLI: ${llmExists ? '✅' : '❌'} (${llmPath})`);
            console.log(`   ReAct Agent: ${agentInitialized ? '✅' : '❌'} (TypeScript)`);
            console.log(`   MCP Client: ${!!this.mcpClientService ? '✅' : '❌'} (Service)`);
            
            return llmExists && agentInitialized && !!this.mcpClientService;
        } catch (error) {
            console.error('❌ Error checking agent availability:', error);
            return false;
        }
    }


    /**
     * Call LLM API directly for simple requests
     */
    private async callLLMCLI(prompt: string, model: string): Promise<LLMResponse> {
        try {
            const llmProvider = new LLMWilsonProvider(
                this.settings.llmConnectorApiUrl || 'http://localhost:49153',
                this.settings.llmConnectorApiKey || 'your_api_key'
            );
            const result = await llmProvider.callLLM(prompt, model);
            return { result };
        } catch (error) {
            throw new Error(`LLM API failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get path to the legacy agent directory (kept for compatibility)
     */
    private getAgentPath(): string {
        // Legacy path - no longer used with TypeScript agent
        return '/Users/zhonghaoning1/Work/AgentExplore';
    }


    /**
     * Install TypeScript agent system
     */
    async installAgent(): Promise<void> {
        console.log('🔧 TypeScript ReAct Agent - No installation required');
        console.log('✅ Agent system ready - using native TypeScript implementation');
    }
}
