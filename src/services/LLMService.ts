import { LLMRequest, LLMResponse, LLMPluginSettings, MCPToolCall, MCPToolResult, ProcessingMode, ParsedCommand } from '../core/types';
import { MCPClientService } from './MCPClientService';
import { AgenticLLMService } from './AgenticLLMService';
import { parseCommand, getEffectiveMode } from '../utils/commandParser';
import { withHttpRetry, createLLMError, RetryOptions } from '../utils/retryUtils';
import { ProgressCallback } from '../agents/types';

export class LLMService {
    private mcpClientService?: MCPClientService;
    private agenticService: AgenticLLMService;
    private currentMode: ProcessingMode;

    constructor(private settings: LLMPluginSettings) {
        this.agenticService = new AgenticLLMService(settings);
        this.currentMode = settings.defaultMode || ProcessingMode.CHAT;
    }

    /**
     * Set MCP client service for tool integration
     */
    setMCPClientService(mcpClientService: MCPClientService): void {
        this.mcpClientService = mcpClientService;
        this.agenticService.setMCPClientService(mcpClientService);
    }

    /**
     * Get current processing mode
     */
    getCurrentMode(): ProcessingMode {
        return this.currentMode;
    }

    /**
     * Set processing mode (from UI selector)
     */
    setCurrentMode(mode: ProcessingMode): void {
        this.currentMode = mode;
        console.log(`🎯 UI Mode changed to: ${mode.toUpperCase()}`);
    }

    /**
     * Set progress callback for agent mode
     */
    setProgressCallback(callback: ProgressCallback) {
        this.agenticService.setProgressCallback(callback);
    }

    async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        try {
            console.log('📥 Processing request:', request.prompt.substring(0, 100) + '...');
            
            // Parse command prefixes and determine effective mode
            const parsed = parseCommand(request.prompt);
            const effectiveMode = getEffectiveMode(request.prompt, this.currentMode);
            
            // Create clean request with command prefix removed
            const cleanRequest: LLMRequest = {
                ...request,
                prompt: parsed.cleanPrompt
            };

            // Log mode decision
            if (parsed.mode !== null) {
                console.log(`🎯 Command override: /${effectiveMode} - Processing in ${effectiveMode.toUpperCase()} mode`);
            } else {
                console.log(`🎯 UI mode: Processing in ${effectiveMode.toUpperCase()} mode`);
            }

            // Route to appropriate processing method
            switch (effectiveMode) {
                case ProcessingMode.CHAT:
                    return await this.processChatMode(cleanRequest);
                    
                case ProcessingMode.AGENT:
                    return await this.processAgentMode(cleanRequest);
                    
                default:
                    throw new Error(`Unknown processing mode: ${effectiveMode}`);
            }

        } catch (error) {
            console.error('Failed to send LLM request:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Process request in Chat Mode (direct LLM CLI)
     */
    private async processChatMode(request: LLMRequest): Promise<LLMResponse> {
        console.log('💬 Processing in Chat Mode - Direct LLM CLI');
        return await this.sendTraditionalRequest(request);
    }

    /**
     * Process request in Agent Mode (TypeScript ReAct Agent)
     */
    private async processAgentMode(request: LLMRequest): Promise<LLMResponse> {
        // Check agent availability
        const isAvailable = await this.agenticService.isAgentAvailable();
        if (!isAvailable) {
            console.warn('⚠️ Agent mode requested but not available, falling back to Chat mode');
            return await this.processChatMode(request);
        }

        console.log('🤖 Processing in Agent Mode - TypeScript ReAct Agent');
        return await this.agenticService.sendRequest(request);
    }

    /**
     * Send traditional LLM API request with robust retry logic
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

        // Configure retry options for LLM API calls
        const retryOptions: Partial<RetryOptions> = {
            maxRetries: 3,
            baseWaitTime: 1000,
            maxWaitTime: 10000,
            timeoutMs: 60000,
            retryOnStatus: [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]
        };

        // Use retry logic for the HTTP request
        try {
            const retryResult = await withHttpRetry(
                `${this.settings.llmConnectorApiUrl}/llm`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-API-Key': this.settings.llmConnectorApiKey
                    },
                    body: JSON.stringify(requestBody)
                },
                retryOptions,
                'Chat Mode LLM API call'
            );

            if (!retryResult.success || !retryResult.result) {
                throw createLLMError(retryResult.error, 'Chat Mode LLM API call');
            }

            const response = retryResult.result;
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

        } catch (error) {
            console.error('❌ Chat Mode LLM API call failed after retries:', error);
            throw createLLMError(error, 'Chat Mode LLM API call');
        }
    }

    // Removed: shouldUseAgenticSystem() and isComplexRequest() 
    // Replaced with explicit mode-based processing in sendRequest()

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
