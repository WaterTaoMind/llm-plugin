// Core type definitions for the LLM Plugin

export interface ModelConfig {
    id: string;
    label: string;
}

export interface TemplateConfig {
    id: string;
    label: string;
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
    modelList: ModelConfig[];
    templateList: TemplateConfig[];
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
    modelList: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { id: 'custom', label: 'Custom' }
    ],
    templateList: [
        { id: '', label: 'No Template' },
        { id: 'summarize', label: 'Summarize' },
        { id: 'explain', label: 'Explain' },
        { id: 'custom', label: 'Custom' }
    ]
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
}

export interface LLMResponse {
    result: string;
    conversationId?: string;
    error?: string;
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
