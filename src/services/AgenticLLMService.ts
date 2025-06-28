import { LLMRequest, LLMResponse, LLMPluginSettings } from '../core/types';
import { MCPClientService } from './MCPClientService';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Agentic LLM Service using Simon Wilson's LLM + Pocket Flow
 * 
 * This service replaces simple LLM calls with an agentic ReAct system
 * that can reason, plan, and use tools to accomplish complex tasks.
 */
export class AgenticLLMService {
    private mcpClientService?: MCPClientService;
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
        return !agenticKeywords.some(keyword => lowerPrompt.includes(keyword));
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
            console.log('🤖 Using agentic system for complex request...');

            // Prepare agent configuration
            const agentConfig = this.prepareAgentConfig(request);
            
            // Call the ReAct agent
            const result = await this.executeReActAgent(request.prompt, agentConfig);

            return {
                result: result,
                conversationId: request.conversationId
            };

        } catch (error) {
            console.error('Agentic system error:', error);
            // Fallback to simple LLM
            return await this.callSimpleLLM(request);
        }
    }

    /**
     * Prepare configuration for the ReAct agent
     */
    private prepareAgentConfig(request: LLMRequest): any {
        return {
            model_profile: this.getModelProfile(request),
            max_steps: 10,
            config_path: this.getMCPConfigPath()
        };
    }

    /**
     * Get appropriate model profile based on request
     */
    private getModelProfile(request: LLMRequest): string {
        const model = request.model || this.settings.defaultModel;
        
        // Map Obsidian models to agent profiles
        if (model?.includes('gpt-4o')) return 'powerful';
        if (model?.includes('gpt-4o-mini')) return 'fast';
        if (model?.includes('claude')) return 'powerful';
        
        return 'balanced'; // Default profile
    }

    /**
     * Get path to MCP configuration
     */
    private getMCPConfigPath(): string {
        // Use the same settings.json that the plugin uses
        const pluginDir = this.getPluginDirectory();
        return path.join(pluginDir, 'settings.json');
    }

    /**
     * Execute the ReAct agent
     */
    private async executeReActAgent(prompt: string, config: any): Promise<string> {
        return new Promise((resolve, reject) => {
            const pythonPath = this.getPythonPath();
            const agentMainPath = path.join(this.agentPath, 'main.py');

            // Build command arguments
            const args = [
                agentMainPath,
                '--model-profile', config.model_profile,
                '--max-steps', config.max_steps.toString(),
                prompt
            ];

            console.log(`🐍 Executing: ${pythonPath} ${args.join(' ')}`);

            const childProcess = spawn(pythonPath, args, {
                cwd: this.agentPath,
                env: {
                    ...process.env,
                    PYTHONPATH: this.agentPath
                }
            });

            let stdout = '';
            let stderr = '';

            childProcess.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            childProcess.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            childProcess.on('close', (code: number | null) => {
                if (code === 0) {
                    // Extract the final result from agent output
                    const result = this.extractAgentResult(stdout);
                    resolve(result);
                } else {
                    console.error('Agent process error:', stderr);
                    reject(new Error(`Agent process failed with code ${code}: ${stderr}`));
                }
            });

            childProcess.on('error', (error: Error) => {
                console.error('Failed to start agent process:', error);
                reject(error);
            });
        });
    }

    /**
     * Extract final result from agent output
     */
    private extractAgentResult(output: string): string {
        // Look for the final result section
        const lines = output.split('\n');
        let inResultSection = false;
        let result = '';

        for (const line of lines) {
            if (line.includes('REACT AGENT FINAL RESULT')) {
                inResultSection = true;
                continue;
            }
            if (inResultSection && line.startsWith('=')) {
                break;
            }
            if (inResultSection && line.trim()) {
                result += line + '\n';
            }
        }

        return result.trim() || output.trim();
    }

    /**
     * Call Simon Wilson's LLM CLI directly
     */
    private async callLLMCLI(prompt: string, model: string): Promise<LLMResponse> {
        return new Promise((resolve, reject) => {
            const args = ['-m', model, prompt];

            const childProcess = spawn('llm', args);
            let stdout = '';
            let stderr = '';

            childProcess.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            childProcess.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            childProcess.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve({ result: stdout.trim() });
                } else {
                    reject(new Error(`LLM CLI failed: ${stderr}`));
                }
            });
        });
    }

    /**
     * Get path to the ReAct agent
     */
    private getAgentPath(): string {
        // This should point to where you've placed the ReAct agent code
        // Could be in the plugin directory or a separate location
        const pluginDir = this.getPluginDirectory();
        return path.join(pluginDir, 'agent');
    }

    /**
     * Get plugin directory path
     */
    private getPluginDirectory(): string {
        // This should match the plugin directory structure
        return path.join(process.cwd(), '.obsidian', 'plugins', 'unofficial-llm-integration');
    }

    /**
     * Get Python executable path
     */
    private getPythonPath(): string {
        // Try to find Python executable
        // You might want to make this configurable
        return process.platform === 'win32' ? 'python' : 'python3';
    }

    /**
     * Check if agent system is available
     */
    async isAgentAvailable(): Promise<boolean> {
        try {
            const agentMainPath = path.join(this.agentPath, 'main.py');
            return fs.existsSync(agentMainPath);
        } catch {
            return false;
        }
    }

    /**
     * Install agent system
     */
    async installAgent(): Promise<void> {
        // This could download and set up the ReAct agent
        // For now, just create the directory structure
        const agentDir = this.agentPath;
        if (!fs.existsSync(agentDir)) {
            fs.mkdirSync(agentDir, { recursive: true });
        }
        
        // Copy agent files from your AgentExplore implementation
        // This would need to be implemented based on your deployment strategy
    }
}
