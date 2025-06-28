// Core type definitions for the LLM Plugin

// MCP-specific types (defined early for use in settings)
export interface MCPServerConfig {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    enabled: boolean;
    autoReconnect: boolean;
    description?: string;
}

export interface LLMPluginSettings {
    llmConnectorApiUrl: string;
    llmConnectorApiKey: string;
    outputFolder: string;
    customPatternsFolder: string;
    youtubeAutodetectEnabled: boolean;
    audioFileAutodetectEnabled: boolean;
    defaultModel: string;
    defaultPostProcessingPattern: string;
    debug: boolean;
    tavilyApiKey: string;
    // MCP Settings
    mcpServers: MCPServerConfig[];
    mcpEnabled: boolean;
    mcpAutoConnect: boolean;
    mcpToolTimeout: number;
    mcpShowToolExecution: boolean;
}

export const DEFAULT_SETTINGS: LLMPluginSettings = {
    llmConnectorApiUrl: '',
    llmConnectorApiKey: '',
    outputFolder: '',
    customPatternsFolder: '',
    youtubeAutodetectEnabled: true,
    audioFileAutodetectEnabled: true,
    defaultModel: 'gpt-4o',
    defaultPostProcessingPattern: '',
    debug: false,
    tavilyApiKey: '',
    // MCP Default Settings
    mcpServers: [],
    mcpEnabled: true,
    mcpAutoConnect: true,
    mcpToolTimeout: 30000, // 30 seconds
    mcpShowToolExecution: true
};

export interface FileWithPath extends File {
    path?: string;
}

export interface ChatMessage {
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    images?: string[];
}

export interface LLMRequest {
    prompt: string;
    template: string;
    model: string;
    options: string[];
    images: string[];
    conversationId?: string;
    tools?: MCPTool[]; // Available MCP tools for LLM function calling
}

export interface LLMResponse {
    result: string;
    conversationId?: string;
    error?: string;
    toolCalls?: MCPToolCall[]; // Tools LLM decided to call
}

export interface Command {
    name: string;
    description: string;
    handler: (args: string) => Promise<void>;
}

export interface RequestState {
    isLoading: boolean;
    error: string | null;
    lastRequest: Date | null;
}

export interface ImageProcessingResult {
    path: string;
    isDataUrl: boolean;
    isValid: boolean;
}

// Additional MCP types
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
    serverId: string;
    serverName: string;
}

export interface MCPToolCall {
    id: string;
    toolName: string;
    serverId: string;
    arguments: Record<string, any>;
}

export interface MCPToolResult {
    toolCallId: string;
    success: boolean;
    content: string | any[];
    error?: string;
}

export interface MCPServerConnection {
    id: string;
    name: string;
    status: 'connected' | 'disconnected' | 'connecting' | 'error';
    lastConnected?: Date;
    error?: string;
    tools: MCPTool[];
}

export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    serverId: string;
    serverName: string;
}
