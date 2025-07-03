import { LLMProvider } from './types';

/**
 * LLM Provider implementation using FastAPI wrapper around Simon Wilson's LLM CLI
 * Provides dependency injection for the ReAct agent
 * Uses HTTP API instead of direct CLI calls
 */
export class LLMWilsonProvider implements LLMProvider {
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl: string = 'http://localhost:49153', apiKey: string = 'your_api_key') {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    /**
     * Call LLM using FastAPI HTTP endpoint
     * Note: Retry logic is handled by PocketFlow at the Node level
     */
    async callLLM(prompt: string, model?: string, system?: string): Promise<string> {
        const validModel = this.validateModel(model);
        console.log(`🔧 LLMWilsonProvider: Using model "${validModel}" via HTTP API`);
        
        const requestBody: any = {
            prompt: prompt,
            json_mode: false
        };
        
        // Add model if specified
        if (validModel) {
            requestBody.model = validModel;
        }
        
        // Add system prompt as an option if provided
        if (system) {
            requestBody.options = ['-s', system];
        }
        
        console.log(`🔧 LLMWilsonProvider: Calling ${this.baseUrl}/llm`);
        
        try {
            const response = await fetch(`${this.baseUrl}/llm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            console.log(`✅ LLMWilsonProvider: Got HTTP response`);
            
            // Extract the result - the API should return the LLM output
            if (typeof result === 'string') {
                return result;
            } else if (result.output || result.result || result.response) {
                return result.output || result.result || result.response;
            } else {
                // If the result is a JSON object, convert to string
                return JSON.stringify(result);
            }
            
        } catch (error) {
            console.error('❌ LLMWilsonProvider HTTP call failed:', error);
            throw new Error(`Agent Mode LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Call LLM with schema constraints for structured output using JSON mode
     * Uses the FastAPI json_mode parameter for better structured output
     */
    async callLLMWithSchema(prompt: string, schema: any, model?: string, system?: string, maxRetries: number = 3): Promise<any> {
        console.log('🔧 LLMWilsonProvider: Starting schema call with model:', model || 'default');
        
        // Build enhanced prompt with schema 
        const schemaJson = JSON.stringify(schema, null, 2);
        const enhancedPrompt = `${prompt}

Please format your response as a valid JSON object conforming to the following schema:
${schemaJson}

Only return valid JSON, nothing else.`;
        
        const errors: string[] = [];
        
        // Try multiple times to get valid JSON
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`🔧 LLMWilsonProvider: Schema attempt ${attempt + 1}/${maxRetries}`);
                
                const validModel = this.validateModel(model);
                
                const requestBody: any = {
                    prompt: enhancedPrompt,
                    json_mode: true // Use JSON mode for structured output
                };
                
                // Add model if specified
                if (validModel) {
                    requestBody.model = validModel;
                }
                
                // Add system prompt as an option if provided
                if (system) {
                    requestBody.options = ['-s', system];
                }
                
                console.log(`🔧 LLMWilsonProvider: Calling ${this.baseUrl}/llm with json_mode=true`);
                
                const response = await fetch(`${this.baseUrl}/llm`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey
                    },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const result = await response.json();
                console.log('🔧 LLMWilsonProvider: Got response for schema call');
                
                // Extract and parse the JSON response
                let jsonStr = '';
                if (typeof result === 'string') {
                    jsonStr = result;
                } else if (result.output || result.result || result.response) {
                    jsonStr = result.output || result.result || result.response;
                } else {
                    jsonStr = JSON.stringify(result);
                }
                
                // Clean up the JSON string if needed
                if (jsonStr.includes('```json')) {
                    const parts = jsonStr.split('```json');
                    if (parts.length > 1) {
                        const jsonPart = parts[1].split('```')[0];
                        if (jsonPart) {
                            jsonStr = jsonPart.trim();
                        }
                    }
                } else if (jsonStr.includes('```')) {
                    const parts = jsonStr.split('```');
                    if (parts.length > 2) {
                        jsonStr = parts[1].trim();
                    }
                }
                
                // Parse the JSON
                const parsed = JSON.parse(jsonStr);
                console.log('✅ LLMWilsonProvider: Successfully parsed JSON on attempt', attempt + 1);
                return parsed;
                
            } catch (error) {
                const errorMsg = `Attempt ${attempt + 1}: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMsg);
                console.warn(`⚠️ LLMWilsonProvider: ${errorMsg}`);
                
                // Don't retry if it's the last attempt
                if (attempt === maxRetries - 1) {
                    break;
                }
            }
        }
        
        // If we get here, all attempts failed
        const errorMsg = errors.join('\n');
        console.error('❌ LLMWilsonProvider: All schema attempts failed:', errorMsg);
        throw new Error(`Failed to get valid JSON after ${maxRetries} attempts:\n${errorMsg}`);
    }

    /**
     * Validate model name and provide fallback
     * Keep original model names for HTTP API
     */
    private validateModel(model?: string): string {
        if (!model) {
            // Return original model name (the API will handle defaults)
            return 'g25fp';
        }
        
        // Check for invalid model names
        if (model.includes('undefined') || model.trim() === '') {
            console.warn(`⚠️ Invalid model name "${model}", using default g25fp`);
            return 'g25fp';
        }
        
        // Return the model as-is for HTTP API
        return model;
    }
}