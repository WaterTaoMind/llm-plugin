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
    
    // Progress Tracking
    startTime?: number;
    progressCallback?: ProgressCallback;
    
    // Configuration
    modelConfig?: ModelConfig;
    
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
    stepType: 'action' | 'llm_processing';  // New: distinguish step types
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
    decision: 'continue' | 'complete' | 'llm_processing';
    action?: ActionDecision;
    goalStatus: string;
    
    // LLM processing fields
    llmTask?: string;           // Task identifier (translate, summarize, etc.)
    llmPrompt?: string;         // Crafted prompt for LLM
    inputHistoryId?: string;    // Reference to specific history entry
}

export interface LLMProcessingRequest {
    task: string;
    prompt: string;
    inputHistoryId: string;
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
    
    // Configuration
    modelConfig?: ModelConfig;
    
    // Final Result
    finalResult?: string;
}

export interface ModelConfig {
    reasoning: string;
    summarization: string;
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
    callTool(serverName: string, toolName: string, parameters: Record<string, any>): Promise<string>;
}