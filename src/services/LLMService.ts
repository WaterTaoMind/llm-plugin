import { LLMRequest, LLMResponse, LLMPluginSettings, MCPToolCall, MCPToolResult } from '../core/types';
import { MCPClientService } from './MCPClientService';
import { AgenticLLMService } from './AgenticLLMService';

export class LLMService {
    private mcpClientService?: MCPClientService;
    private agenticService: AgenticLLMService;

    constructor(private settings: LLMPluginSettings) {
        this.agenticService = new AgenticLLMService(settings);
    }

    /**
     * Set MCP client service for tool integration
     */
    setMCPClientService(mcpClientService: MCPClientService): void {
        this.mcpClientService = mcpClientService;
        this.agenticService.setMCPClientService(mcpClientService);
    }

    async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        try {
            console.log('📥 Processing request:', request.prompt.substring(0, 100) + '...');
            
            // Check if agentic system should be used
            const useAgentic = await this.shouldUseAgenticSystem(request);

            if (useAgentic) {
                console.log('🤖 Using agentic system for request');
                return await this.agenticService.sendRequest(request);
            }

            // Fallback to traditional LLM API
            console.log('🔗 Using traditional LLM API');
            return await this.sendTraditionalRequest(request);

        } catch (error) {
            console.error('Failed to send LLM request:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Send traditional LLM API request
     */
    private async sendTraditionalRequest(request: LLMRequest): Promise<LLMResponse> {
        // Get available MCP tools if MCP is enabled
        const tools = this.mcpClientService?.getToolsForLLM() || [];
        
        // Debug: Log available tools for YouTube-related requests
        const lowerPrompt = request.prompt.toLowerCase();
        if (lowerPrompt.includes('youtube') || lowerPrompt.includes('video')) {
            console.log('🔧 Available MCP tools for YouTube request:', tools.map(t => t.function?.name || t.name));
            console.log('🔧 Tool details:', JSON.stringify(tools, null, 2));
        }

        // For YouTube requests, warn that tools aren't available in traditional mode
        if (lowerPrompt.includes('youtube') || /youtube\.com|youtu\.be/.test(lowerPrompt)) {
            console.warn('⚠️ YouTube request in traditional mode - tools not available in this backend');
            console.warn('Consider enabling agentic mode for tool-based requests');
        }

        const requestBody = {
            prompt: request.prompt,
            template: request.template,
            model: request.model,
            options: request.options,
            json_mode: false,
            images: request.images
            // Note: tools and tool_choice removed since backend doesn't support them
        };

        // Debug: Log the actual request being sent for YouTube requests
        if (lowerPrompt.includes('youtube') || lowerPrompt.includes('video')) {
            console.log('📤 Request payload:', JSON.stringify(requestBody, null, 2));
        }

        const response = await fetch(`${this.settings.llmConnectorApiUrl}/llm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': this.settings.llmConnectorApiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();

        // Debug: Log response for YouTube requests
        if (lowerPrompt.includes('youtube') || lowerPrompt.includes('video')) {
            console.log('📥 Response data:', JSON.stringify(responseData, null, 2));
        }

        // Note: Tool calling removed since backend doesn't support it
        // All tool-based requests should use agentic mode instead
        if (lowerPrompt.includes('youtube') || /youtube\.com|youtu\.be/.test(lowerPrompt)) {
            console.warn('⚠️ YouTube request processed without tools - use agentic mode for tool support');
        }

        return {
            result: responseData.result,
            conversationId: responseData.conversation_id
        };
    }

    /**
     * Determine if agentic system should be used
     */
    private async shouldUseAgenticSystem(request: LLMRequest): Promise<boolean> {
        // Check if agentic system is available
        const isAvailable = await this.agenticService.isAgentAvailable();
        if (!isAvailable) {
            console.log('🚫 Agentic system not available');
            return false;
        }

        // Check user preference (could be a setting)
        if (this.settings.agenticMode === false) {
            console.log('🚫 Agentic mode disabled in settings');
            return false;
        }

        // Check if request complexity warrants agentic processing
        const isComplex = this.isComplexRequest(request.prompt);
        console.log(`🎯 Request complexity analysis: ${isComplex ? 'COMPLEX (agentic)' : 'SIMPLE (traditional)'}`);
        return isComplex;
    }

    /**
     * Determine if request is complex enough for agentic processing
     */
    private isComplexRequest(prompt: string): boolean {
        const complexKeywords = [
            'analyze', 'research', 'investigate', 'find information',
            'summarize video', 'youtube', 'extract data', 'process file',
            'help me with', 'can you help', 'step by step', 'multiple steps',
            'summarize' // Added standalone summarize
        ];

        const lowerPrompt = prompt.toLowerCase();
        
        // Check for YouTube URLs specifically
        const youtubeUrlPattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/)/;
        if (youtubeUrlPattern.test(lowerPrompt)) {
            console.log('🎬 YouTube URL detected in LLMService - using agentic system');
            return true;
        }
        
        const isComplex = complexKeywords.some(keyword => lowerPrompt.includes(keyword));
        if (isComplex) {
            console.log('🤖 Complex request detected in LLMService - using agentic system');
        }
        
        return isComplex;
    }

    /**
     * Process tool calls from LLM and send results back for final response
     */
    private async processToolCallsAndRespond(responseData: any, originalRequest: LLMRequest): Promise<LLMResponse> {
        if (!this.mcpClientService) {
            throw new Error('MCP client service not available');
        }

        try {
            // Convert response tool calls to our format
            const toolCalls: MCPToolCall[] = responseData.tool_calls.map((call: any, index: number) => ({
                id: call.id || `tool_call_${index}`,
                toolName: call.function?.name || call.name,
                serverId: this.findServerForTool(call.function?.name || call.name),
                arguments: call.function?.arguments || call.arguments || {}
            }));

            // Execute tool calls
            const toolResults = await this.mcpClientService.executeToolCalls(toolCalls);

            // Send tool results back to LLM for final response
            return await this.sendToolResults(toolResults, originalRequest, responseData);
        } catch (error) {
            console.error('Failed to process tool calls:', error);
            return {
                result: responseData.result || 'Tool execution failed',
                error: error instanceof Error ? error.message : 'Tool execution error'
            };
        }
    }

    /**
     * Send tool results back to LLM for final response
     */
    private async sendToolResults(toolResults: MCPToolResult[], originalRequest: LLMRequest, previousResponse: any): Promise<LLMResponse> {
        try {
            // Format tool results for LLM
            const toolResultsText = toolResults.map(result => {
                if (result.success) {
                    return `Tool ${result.toolCallId} result: ${typeof result.content === 'string' ? result.content : JSON.stringify(result.content)}`;
                } else {
                    return `Tool ${result.toolCallId} failed: ${result.error}`;
                }
            }).join('\n\n');

            // Send follow-up request with tool results
            const response = await fetch(`${this.settings.llmConnectorApiUrl}/llm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Key': this.settings.llmConnectorApiKey
                },
                body: JSON.stringify({
                    prompt: `${originalRequest.prompt}\n\nTool Results:\n${toolResultsText}\n\nPlease provide a final response incorporating these tool results.`,
                    template: originalRequest.template,
                    model: originalRequest.model,
                    options: originalRequest.options,
                    json_mode: false,
                    images: originalRequest.images,
                    conversation_id: previousResponse.conversation_id
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseData = await response.json();
            return {
                result: responseData.result,
                conversationId: responseData.conversation_id
            };
        } catch (error) {
            console.error('Failed to send tool results:', error);
            return {
                result: 'Failed to process tool results',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Find server ID for a tool name
     */
    private findServerForTool(toolName: string): string {
        if (!this.mcpClientService) return '';

        const tool = this.mcpClientService.getTool(toolName);
        return tool?.serverId || '';
    }

    async getYouTubeTranscript(url: string): Promise<string> {
        try {
            const response = await fetch(`${this.settings.llmConnectorApiUrl}/yt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Key': this.settings.llmConnectorApiKey
                },
                body: JSON.stringify({ 
                    url: url,
                    stream: false 
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.transcript || '';
        } catch (error) {
            console.error('Failed to get YouTube transcript:', error);
            throw error;
        }
    }

    async getLastConversationId(): Promise<string | null> {
        try {
            const response = await fetch(`${this.settings.llmConnectorApiUrl}/latest_cid`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': this.settings.llmConnectorApiKey
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.conversation_id || null;
        } catch (error) {
            console.error('Failed to query last conversation ID:', error);
            return null;
        }
    }

    async performTavilySearch(query: string): Promise<any> {
        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    include_answer: true,
                    max_results: 5,
                    include_images: true,
                    search_depth: "basic",
                    api_key: this.settings.tavilyApiKey
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to perform Tavily search:', error);
            throw error;
        }
    }

    async scrapeWebContent(url: string): Promise<string> {
        try {
            // Ensure URL starts with http:// or https://
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            const jinaUrl = `https://r.jina.ai/${url}`;
            const response = await fetch(jinaUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.text();
        } catch (error) {
            console.error('Failed to scrape web content:', error);
            throw error;
        }
    }
}
