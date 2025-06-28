import { App, Notice } from 'obsidian';
import { Command } from '../core/types';
import { LLMService } from './LLMService';
import { MCPClientService } from './MCPClientService';

export class CommandService {
    private commands: Map<string, Command> = new Map();
    private mcpClientService?: MCPClientService;

    constructor(
        private app: App,
        private llmService: LLMService
    ) {
        this.initializeCommands();
    }

    /**
     * Set MCP client service for tool integration
     */
    setMCPClientService(mcpClientService: MCPClientService): void {
        this.mcpClientService = mcpClientService;
    }

    private initializeCommands() {
        const commands: Command[] = [
            {
                name: '@web',
                description: 'Scrape content from a URL',
                handler: this.handleWebCommand.bind(this)
            },
            {
                name: '@tavily',
                description: 'Search using Tavily API',
                handler: this.handleTavilyCommand.bind(this)
            },
            {
                name: '@youtube',
                description: 'Get YouTube video transcript',
                handler: this.handleYouTubeCommand.bind(this)
            },
            {
                name: '@note',
                description: 'Read current note content',
                handler: this.handleNoteCommand.bind(this)
            },
            {
                name: '@clipboard',
                description: 'Read from clipboard',
                handler: this.handleClipboardCommand.bind(this)
            },
            {
                name: '@resource',
                description: 'Read MCP resource content',
                handler: this.handleResourceCommand.bind(this)
            }
        ];

        commands.forEach(cmd => this.commands.set(cmd.name, cmd));
    }

    getCommands(): Command[] {
        return Array.from(this.commands.values());
    }

    async executeCommand(input: string): Promise<string | null> {
        // Parse command and arguments - support both @command and @server:tool syntax
        const match = input.match(/^(@\w+(?::\w+)?)\s*(.*)$/);
        if (!match) return null;

        const [, commandName, args] = match;

        // Check built-in commands first
        const command = this.commands.get(commandName);
        if (command) {
            try {
                await command.handler(args.trim());
                return commandName; // Return command name to indicate it was handled
            } catch (error) {
                console.error(`Failed to execute command ${commandName}:`, error);
                new Notice(`Failed to execute ${commandName} command`);
                return null;
            }
        }

        // Check MCP tools if no built-in command found
        if (this.mcpClientService) {
            return await this.executeMCPCommand(commandName, args.trim());
        }

        return null;
    }

    /**
     * Execute MCP tool command
     */
    private async executeMCPCommand(commandName: string, args: string): Promise<string | null> {
        if (!this.mcpClientService) return null;

        const toolName = commandName.substring(1); // Remove @ prefix

        // Handle server:tool syntax
        let serverId = '';
        let actualToolName = toolName;

        if (toolName.includes(':')) {
            [serverId, actualToolName] = toolName.split(':');
        }

        // Check if tool exists
        const tool = this.mcpClientService.getTool(serverId ? `${serverId}:${actualToolName}` : actualToolName);
        if (!tool) {
            // Provide suggestions
            const similar = this.mcpClientService.getSimilarTools(actualToolName);
            if (similar.length > 0) {
                new Notice(`Tool '${actualToolName}' not found. Did you mean: ${similar.slice(0, 3).join(', ')}?`, 5000);
            } else {
                new Notice(`MCP tool '${actualToolName}' not found`, 3000);
            }
            return null;
        }

        // Check for conflicts
        if (this.mcpClientService.isToolConflicted(actualToolName) && !serverId) {
            const resolutions = this.mcpClientService.getConflictResolution(actualToolName);
            new Notice(`Tool name '${actualToolName}' is ambiguous. Use: ${resolutions.join(' or ')}`, 5000);
            return null;
        }

        try {
            // Parse arguments (simple space-separated for now)
            const parsedArgs = this.parseToolArguments(args, tool.inputSchema);

            // Execute tool
            const toolCall = {
                id: `manual_${Date.now()}`,
                toolName: actualToolName,
                serverId: tool.serverId,
                arguments: parsedArgs
            };

            const results = await this.mcpClientService.executeToolCalls([toolCall]);
            const result = results[0];

            if (result.success) {
                new Notice(`Tool '${actualToolName}' executed successfully`, 2000);
                // You could display the result in chat or return it
                console.log('MCP Tool Result:', result.content);
                return commandName;
            } else {
                new Notice(`Tool '${actualToolName}' failed: ${result.error}`, 5000);
                return null;
            }
        } catch (error) {
            console.error(`Failed to execute MCP tool ${actualToolName}:`, error);
            new Notice(`Failed to execute MCP tool: ${error}`, 5000);
            return null;
        }
    }

    /**
     * Parse tool arguments based on schema (simplified)
     */
    private parseToolArguments(args: string, schema: any): Record<string, any> {
        if (!args.trim()) return {};

        // Simple parsing - split by spaces and try to match to schema properties
        const parts = args.split(' ');
        const result: Record<string, any> = {};

        if (schema && schema.properties) {
            const properties = Object.keys(schema.properties);

            // Map positional arguments to schema properties
            parts.forEach((part, index) => {
                if (index < properties.length) {
                    const propName = properties[index];
                    const propType = schema.properties[propName]?.type;

                    // Basic type conversion
                    if (propType === 'number') {
                        result[propName] = parseFloat(part) || 0;
                    } else if (propType === 'boolean') {
                        result[propName] = part.toLowerCase() === 'true';
                    } else {
                        result[propName] = part;
                    }
                }
            });

            // If only one argument and one property, use it directly
            if (parts.length === 1 && properties.length === 1) {
                const propName = properties[0];
                result[propName] = args.trim();
            }
        } else {
            // Fallback: use the entire args as a single parameter
            result.input = args.trim();
        }

        return result;
    }

    // Replace inline @-commands in text
    async processInlineCommands(text: string): Promise<string> {
        let processedText = text;

        // Replace @note
        if (/@note\b/i.test(processedText)) {
            const noteContent = await this.readCurrentNote();
            if (noteContent !== null) {
                processedText = processedText.replace(/@note\b/gi, noteContent);
            } else {
                new Notice('No active note found for @note');
                throw new Error('No active note found');
            }
        }

        // Replace @clipboard
        if (/@clipboard\b/i.test(processedText)) {
            const clipboardContent = await this.readClipboard();
            if (clipboardContent !== null) {
                processedText = processedText.replace(/@clipboard\b/gi, clipboardContent);
            } else {
                new Notice('No text found in clipboard for @clipboard');
                throw new Error('No clipboard content found');
            }
        }

        // Replace @resource:uri patterns
        if (this.mcpClientService && /@resource:/i.test(processedText)) {
            const resourceMatches = processedText.match(/@resource:([^\s]+)/gi);
            if (resourceMatches) {
                for (const match of resourceMatches) {
                    const uri = match.substring(10); // Remove '@resource:' prefix
                    try {
                        const resourceContent = await this.mcpClientService.readResource(uri);
                        processedText = processedText.replace(match, resourceContent);
                    } catch (error) {
                        new Notice(`Failed to read resource ${uri}: ${error}`, 5000);
                        throw new Error(`Failed to read resource ${uri}`);
                    }
                }
            }
        }

        return processedText;
    }

    private async handleWebCommand(url: string): Promise<void> {
        const content = await this.llmService.scrapeWebContent(url);
        // This would typically trigger LLM processing
        // Implementation depends on how the calling code wants to handle the result
    }

    private async handleTavilyCommand(query: string): Promise<void> {
        const results = await this.llmService.performTavilySearch(query);
        // Process search results
    }

    private async handleYouTubeCommand(url: string): Promise<void> {
        const transcript = await this.llmService.getYouTubeTranscript(url);
        // Process transcript
    }

    private async handleNoteCommand(args: string): Promise<void> {
        const content = await this.readCurrentNote();
        if (!content) {
            throw new Error('No active note found');
        }
        // Process note content
    }

    private async handleClipboardCommand(args: string): Promise<void> {
        const content = await this.readClipboard();
        if (!content) {
            throw new Error('No text found in clipboard');
        }
        // Process clipboard content
    }

    private async readCurrentNote(): Promise<string | null> {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                return null;
            }
            return await this.app.vault.read(activeFile);
        } catch (error) {
            console.error('Failed to read current note:', error);
            return null;
        }
    }

    private async readClipboard(): Promise<string | null> {
        try {
            const text = await navigator.clipboard.readText();
            return text || null;
        } catch (error) {
            console.error('Failed to read clipboard:', error);
            return null;
        }
    }

    private async handleResourceCommand(args: string): Promise<void> {
        if (!this.mcpClientService) {
            throw new Error('MCP client service not available');
        }

        const uri = args.trim();
        if (!uri) {
            // List available resources
            const resources = await this.mcpClientService.getAvailableResources();
            if (resources.length === 0) {
                new Notice('No MCP resources available', 3000);
                return;
            }

            const resourceList = resources.map(r => `${r.uri} (${r.serverName})`).join('\n');
            new Notice(`Available resources:\n${resourceList}`, 10000);
            return;
        }

        try {
            const content = await this.mcpClientService.readResource(uri);
            new Notice(`Resource content loaded: ${uri}`, 2000);
            console.log('Resource content:', content);
            // The content could be used in the LLM context
        } catch (error) {
            console.error(`Failed to read resource ${uri}:`, error);
            new Notice(`Failed to read resource: ${error}`, 5000);
        }
    }
}
