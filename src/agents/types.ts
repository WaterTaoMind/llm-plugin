/**
 * TypeScript type definitions for the ReAct Agent system
 */

// Progress event system for real-time updates
export interface AgentProgressEvent {
    type: 'step_start' | 'step_complete' | 'action_start' | 'action_complete' | 'reasoning_complete' | 'final_result';
    step: number;
    data: any;
    timestamp: number;
}

export type ProgressCallback = (event: AgentProgressEvent) => void;

// Generated media assets
export interface GeneratedImage {
    id: string;
    prompt: string;
    enhancedPrompt?: string; // NEW: LLM-enhanced prompt used for generation
    imageBytes: string; // Base64 encoded image data
    format: string; // 'image/jpeg', 'image/png', etc.
    aspectRatio: string;
    safetyFiltered?: boolean;
    safetyReason?: string;
    generatedAt: number;
    localFilePath?: string; // NEW: Local file system path for saved image
}

// Generated audio assets
export interface GeneratedAudio {
    id: string;
    text: string; // Original text input
    processedText: string; // Cleaned text used for TTS
    audioBytes: string; // Base64 encoded audio data (PCM)
    format: string; // 'audio/wav'
    voiceName: string; // Selected voice name
    generatedAt: number;
    localFilePath?: string; // Local file system path for saved audio
    duration?: number; // Duration in seconds (if available)
}

export interface TTSConfig {
    voiceName?: string; // Voice to use for TTS
    responseModalities?: string[]; // ['AUDIO']
}

export interface ImageGenerationConfig {
    aspectRatio?: string; // '1:1', '3:4', '4:3', '9:16', '16:9'
    numberOfImages?: number;
    safetyFilterLevel?: 'BLOCK_LOW_AND_ABOVE' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_NONE';
}

export interface AgentSharedState {
    // Input
    userRequest?: string;
    
    // Tool Discovery
    availableTools?: MCPTool[];
    toolsByServer?: Record<string, MCPTool[]>;
    toolServerMap?: Record<string, string>;
    
    // ReAct Process
    currentStep?: number;
    maxSteps?: number;
    actionHistory?: ActionResult[];
    currentReasoning?: string;
    goalStatus?: string;
    nextAction?: ActionDecision;
    
    // LLM Processing
    nextLLMRequest?: LLMProcessingRequest;
    
    // Progress Tracking
    startTime?: number;
    progressCallback?: ProgressCallback;
    
    // Cancellation Support
    abortSignal?: AbortSignal;
    cancelled?: boolean;
    
    // Configuration
    modelConfig?: ModelConfig;
    imageConfig?: ImageGenerationConfig;
    
    // Generated Media Assets
    generatedImages?: GeneratedImage[];
    generatedImagePaths?: string[]; // NEW: Absolute paths to saved image files
    currentImagePrompt?: string;
    imageProcessingComplete?: boolean; // NEW: Signal from image node when processing is complete
    
    // Generated Audio Assets
    generatedAudios?: GeneratedAudio[];
    generatedAudioPaths?: string[]; // NEW: Absolute paths to saved audio files
    currentTTSText?: string;
    ttsConfig?: TTSConfig;
    
    // Configuration & Filesystem
    mcpConfig?: {
        workingDirectory?: string;
        // Other MCP configuration options
    };
    pluginWorkingDir?: string; // Obsidian plugin working directory
    mcpClient?: any; // MCP client instance for filesystem operations
    
    // Final Result
    finalResult?: string;
}

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
    server: string;
    serverId?: string;
    serverName?: string;
}

export interface ActionResult {
    step: number;
    stepType: 'action' | 'llm_processing' | 'user_input';  // New: distinguish step types
    server: string;
    tool: string;
    parameters: Record<string, any>;
    result: string;
    justification: string;
    success: boolean;
    historyId: string;  // New: unique identifier for referencing
}

export interface ActionDecision {
    server: string;
    tool: string;
    parameters: Record<string, any>;
    justification: string;
}

export interface ReasoningResponse {
    reasoning: string;
    decision: 'continue' | 'complete' | 'llm_processing' | 'process_image' | 'generate_speech';  // NEW: Added generate_speech
    action?: ActionDecision;
    goalStatus: string;
    
    // LLM processing fields
    llmTask?: string;           // Task identifier (translate, summarize, etc.)
    llmPrompt?: string;         // Crafted prompt for LLM
    inputHistoryId?: string;    // Reference to specific history entry
    
    // Image processing fields (generation + editing)
    imagePrompt?: string;       // Prompt for image generation or editing instructions
    imageConfig?: ImageGenerationConfig;
    
    // TTS processing fields
    ttsText?: string;           // Text to convert to speech
    ttsConfig?: TTSConfig;      // TTS configuration
}

export interface LLMProcessingRequest {
    task: string;
    prompt: string;
    inputHistoryId: string;
}


export interface ModelConfig {
    reasoning: string;
    processing: string;
    default: string;
}

// LLM Provider interface for dependency injection
export interface LLMProvider {
    callLLM(prompt: string, model?: string, system?: string): Promise<string>;
    callLLMWithSchema(prompt: string, schema: any, model?: string, system?: string): Promise<any>;
}

// MCP Client interface for dependency injection  
export interface MCPClient {
    getAllTools(): Promise<Record<string, MCPTool[]>>;
    callTool(serverName: string, toolName: string, parameters: Record<string, any>, signal?: AbortSignal): Promise<string>;
}