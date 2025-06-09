import { App, Notice } from 'obsidian';
import { Command } from '../core/types';
import { LLMService } from './LLMService';

export class CommandService {
    private commands: Map<string, Command> = new Map();

    constructor(
        private app: App,
        private llmService: LLMService
    ) {
        this.initializeCommands();
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
            }
        ];

        commands.forEach(cmd => this.commands.set(cmd.name, cmd));
    }

    getCommands(): Command[] {
        return Array.from(this.commands.values());
    }

    async executeCommand(input: string): Promise<string | null> {
        // Parse command and arguments
        const match = input.match(/^(@\w+)\s*(.*)$/);
        if (!match) return null;

        const [, commandName, args] = match;
        const command = this.commands.get(commandName);
        
        if (!command) return null;

        try {
            await command.handler(args.trim());
            return commandName; // Return command name to indicate it was handled
        } catch (error) {
            console.error(`Failed to execute command ${commandName}:`, error);
            new Notice(`Failed to execute ${commandName} command`);
            return null;
        }
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
}
