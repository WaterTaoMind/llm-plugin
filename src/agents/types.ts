/**
 * TypeScript type definitions for the ReAct Agent system
 */

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
    server: string;
    tool: string;
    parameters: Record<string, any>;
    result: string;
    justification: string;
    success: boolean;
}

export interface ActionDecision {
    server: string;
    tool: string;
    parameters: Record<string, any>;
    justification: string;
}

export interface ReasoningResponse {
    reasoning: string;
    decision: 'continue' | 'complete';
    action?: ActionDecision;
    goalStatus: string;
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