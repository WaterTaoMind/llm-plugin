import { LLMRequest, LLMResponse, LLMPluginSettings } from '../core/types';

export class LLMService {
    constructor(private settings: LLMPluginSettings) {}

    async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        try {
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
                    images: request.images
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
            console.error('Failed to send LLM request:', error);
            return {
                result: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
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
