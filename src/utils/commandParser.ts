/**
 * Command Prefix Parser for Hybrid Mode Selection
 * 
 * Handles parsing of command prefixes like /chat and /agent to override
 * the UI-selected processing mode on a per-message basis.
 */

import { ProcessingMode, ParsedCommand } from '../core/types';

/**
 * Parse command prefixes from user input
 * 
 * Examples:
 * - "/chat Hello world" → { mode: CHAT, cleanPrompt: "Hello world", originalPrompt: "/chat Hello world" }
 * - "/agent Analyze this" → { mode: AGENT, cleanPrompt: "Analyze this", originalPrompt: "/agent Analyze this" }
 * - "/agent\nhttps://example.com\nAnalyze this" → { mode: AGENT, cleanPrompt: "https://example.com\nAnalyze this", originalPrompt: "..." }
 * - "Regular message" → { mode: null, cleanPrompt: "Regular message", originalPrompt: "Regular message" }
 */
export function parseCommand(input: string): ParsedCommand {
    const trimmedInput = input.trim();
    
    // Check for command prefixes at the start of the message (support multiline)
    const chatCommandPattern = /^\/chat(?:\s+(.+))?$/mis;
    const agentCommandPattern = /^\/agent(?:\s+(.+))?$/mis;
    
    // Test for /chat command
    const chatMatch = trimmedInput.match(chatCommandPattern);
    if (chatMatch) {
        const cleanPrompt = chatMatch[1] ? chatMatch[1].trim() : '';
        return {
            mode: ProcessingMode.CHAT,
            cleanPrompt,
            originalPrompt: trimmedInput
        };
    }
    
    // Test for /agent command
    const agentMatch = trimmedInput.match(agentCommandPattern);
    if (agentMatch) {
        const cleanPrompt = agentMatch[1] ? agentMatch[1].trim() : '';
        return {
            mode: ProcessingMode.AGENT,
            cleanPrompt,
            originalPrompt: trimmedInput
        };
    }
    
    // No command prefix found - use UI selected mode
    return {
        mode: null, // null indicates use UI selected mode
        cleanPrompt: trimmedInput,
        originalPrompt: trimmedInput
    };
}

/**
 * Get help text for available commands
 */
export function getCommandHelp(): string {
    return `Available commands:
• /chat <message> - Process with Chat Mode (direct LLM)
• /agent <message> - Process with Agent Mode (ReAct workflow)

Examples:
• /chat What is 2+2?
• /agent Analyze this document and extract key insights`;
}

/**
 * Check if input contains a valid command prefix
 */
export function hasCommandPrefix(input: string): boolean {
    const parsed = parseCommand(input);
    return parsed.mode !== null;
}

/**
 * Get the effective processing mode for a request
 * Command prefixes override the UI selected mode
 */
export function getEffectiveMode(input: string, uiSelectedMode: ProcessingMode): ProcessingMode {
    const parsed = parseCommand(input);
    return parsed.mode ?? uiSelectedMode; // Use command mode or fall back to UI mode
}