import { LLMRequest, LLMResponse, LLMPluginSettings, MCPToolCall, MCPToolResult } from '../core/types';
import { MCPClientService } from './MCPClientService';

export class LLMService {
    private mcpClientService?: MCPClientService;

    constructor(private settings: LLMPluginSettings) {}

    /**
     * Set MCP client service for tool integration
     */
    setMCPClientService(mcpClientService: MCPClientService): void {
        this.mcpClientService = mcpClientService;
    }

    async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        try {
            // Get available MCP tools if MCP is enabled
            const tools = this.mcpClientService?.getToolsForLLM() || [];

            const response = await fetch(`${this.settings.llmConnectorApiUrl}/llm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Key': this.settings.llmConnectorApiKey
                },
                body: JSON.stringify({
                    prompt: request.prompt,
                    template: request.template,
                    model: request.model,
                    options: request.options,
                    json_mode: false,
                    images: request.images,
                    tools: tools.length > 0 ? tools : undefined, // Include tools if available
                    tool_choice: tools.length > 0 ? "auto" : undefined // Let LLM decide
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseData = await response.json();

            // Check if LLM wants to call tools
            if (responseData.tool_calls && this.mcpClientService) {
                return await this.processToolCallsAndRespond(responseData, request);
            }

            return {
                result: responseData.result,
                conversationId: responseData.conversation_id
            };
        } catch (error) {
            console.error('Failed to send LLM request:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
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
