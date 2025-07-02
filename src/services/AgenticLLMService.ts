import { LLMRequest, LLMResponse, LLMPluginSettings } from '../core/types';
import { MCPClientService } from './MCPClientService';
import { ReActAgent } from '../agents/ReActAgent';
import { LLMWilsonProvider } from '../agents/LLMWilsonProvider';
import { MCPClientAdapter } from '../agents/MCPClientAdapter';
import { ModelConfig } from '../agents/types';
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
     * Initialize the TypeScript ReAct agent
     */
    private initializeReActAgent(): void {
        if (!this.mcpClientService) {
            console.warn('Cannot initialize ReAct agent without MCP client service');
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
            
            // Initialize the ReAct agent
            this.reActAgent = new ReActAgent(llmProvider, mcpClient, modelConfig);
            
            console.log('✅ TypeScript ReAct Agent initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize ReAct agent:', error);
        }
    }

    /**
     * Send request to agentic system instead of simple LLM
     */
    async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        try {
            // For simple requests, use direct LLM
            if (this.isSimpleRequest(request.prompt)) {
                return await this.callSimpleLLM(request);
            }

            // For complex requests, use ReAct agent
            return await this.callAgenticSystem(request);

        } catch (error) {
            console.error('Failed to send agentic request:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Determine if request needs agentic processing
     */
    private isSimpleRequest(prompt: string): boolean {
        const agenticKeywords = [
            'search', 'find', 'analyze', 'research', 'investigate',
            'summarize', 'extract', 'process', 'youtube', 'video',
            'file', 'document', 'data', 'information', 'help me',
            'can you', 'please', 'how to', 'what is', 'explain'
        ];

        const lowerPrompt = prompt.toLowerCase();
        
        // Check for YouTube URLs specifically - these always need agentic processing
        const youtubeUrlPattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/)/;
        if (youtubeUrlPattern.test(lowerPrompt)) {
            console.log('🎬 YouTube URL detected - routing to agentic system');
            return false; // Not simple, needs agentic processing
        }
        
        // Check for agentic keywords
        const needsAgentic = agenticKeywords.some(keyword => lowerPrompt.includes(keyword));
        if (needsAgentic) {
            console.log(`🤖 Agentic keyword detected - routing to agentic system`);
            return false; // Not simple, needs agentic processing
        }
        
        console.log('📝 Simple request - using traditional LLM');
        return true; // Simple request
    }

    /**
     * Call simple LLM for basic requests
     */
    private async callSimpleLLM(request: LLMRequest): Promise<LLMResponse> {
        // Use Simon Wilson's LLM CLI directly
        return await this.callLLMCLI(request.prompt, request.model || 'gpt-4o-mini');
    }

    /**
     * Call agentic ReAct system for complex requests
     */
    private async callAgenticSystem(request: LLMRequest): Promise<LLMResponse> {
        try {
            console.log('🤖 Using TypeScript ReAct Agent for complex request...');

            if (!this.reActAgent) {
                console.warn('⚠️ ReAct agent not initialized, falling back to simple LLM');
                return await this.callSimpleLLM(request);
            }

            // Determine max steps based on request complexity
            const maxSteps = this.getMaxStepsForRequest(request);
            
            // Execute the TypeScript ReAct agent
            const result = await this.reActAgent.execute(request.prompt, maxSteps);

            return {
                result: result,
                conversationId: request.conversationId
            };

        } catch (error) {
            console.error('❌ TypeScript ReAct Agent error:', error);
            // Fallback to simple LLM
            return await this.callSimpleLLM(request);
        }
    }

    /**
     * Determine maximum steps based on request complexity
     */
    private getMaxStepsForRequest(request: LLMRequest): number {
        const prompt = request.prompt.toLowerCase();
        
        // YouTube URLs may need multiple steps (transcript + summarization)
        if (prompt.includes('youtube.com') || prompt.includes('youtu.be')) {
            return 5;
        }
        
        // File operations might need multiple steps
        if (prompt.includes('file') || prompt.includes('document')) {
            return 7;
        }
        
        // Research requests might need more steps
        if (prompt.includes('research') || prompt.includes('analyze') || prompt.includes('investigate')) {
            return 8;
        }
        
        // Default to moderate number of steps
        return 5;
    }

    /**
     * Check if TypeScript agent system is available
     */
    async isAgentAvailable(): Promise<boolean> {
        try {
            const llmPath = '/opt/homebrew/Caskroom/miniconda/base/envs/llm/bin/llm';
            const llmExists = fs.existsSync(llmPath);
            const agentInitialized = !!this.reActAgent;
            
            console.log(`🔍 TypeScript Agent availability check:`);
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
