/**
 * Mode Selector Component for Hybrid Mode Selection
 * 
 * Provides a UI toggle in the chat header allowing users to select between
 * Chat Mode and Agent Mode for ongoing conversation processing.
 */

import { ProcessingMode } from '../../core/types';

export interface ModeSelectorOptions {
    initialMode: ProcessingMode;
    onModeChange: (mode: ProcessingMode) => void;
    showTooltips?: boolean;
}

export class ModeSelector {
    private container: HTMLElement;
    private currentMode: ProcessingMode;
    private onModeChange: (mode: ProcessingMode) => void;
    private chatButton: HTMLElement;
    private agentButton: HTMLElement;

    constructor(options: ModeSelectorOptions) {
        this.currentMode = options.initialMode;
        this.onModeChange = options.onModeChange;
        this.container = this.createContainer();
        this.createButtons(options.showTooltips);
        this.updateButtonStates();
    }

    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'llm-mode-selector';
        container.style.cssText = `
            display: flex;
            gap: 4px;
            align-items: center;
            padding: 4px;
            background: var(--background-secondary);
            border-radius: 6px;
            border: 1px solid var(--background-modifier-border);
        `;
        return container;
    }

    private createButtons(showTooltips = true): void {
        // Chat Mode Button
        this.chatButton = this.createModeButton(
            '💬',
            'Chat',
            ProcessingMode.CHAT,
            showTooltips ? 'Direct LLM processing - Fast and simple' : undefined
        );

        // Agent Mode Button
        this.agentButton = this.createModeButton(
            '🤖',
            'Agent',
            ProcessingMode.AGENT,
            showTooltips ? 'ReAct Agent with MCP tools - Complex reasoning and actions' : undefined
        );

        this.container.appendChild(this.chatButton);
        this.container.appendChild(this.agentButton);
    }

    private createModeButton(
        icon: string,
        label: string,
        mode: ProcessingMode,
        tooltip?: string
    ): HTMLElement {
        const button = document.createElement('button');
        button.className = 'llm-mode-button';
        button.innerHTML = `${icon} ${label}`;
        
        if (tooltip) {
            button.title = tooltip;
        }

        button.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.15s ease;
            background: transparent;
            color: var(--text-muted);
        `;

        // Hover effects
        button.addEventListener('mouseenter', () => {
            if (mode !== this.currentMode) {
                button.style.background = 'var(--background-modifier-hover)';
                button.style.color = 'var(--text-normal)';
            }
        });

        button.addEventListener('mouseleave', () => {
            if (mode !== this.currentMode) {
                button.style.background = 'transparent';
                button.style.color = 'var(--text-muted)';
            }
        });

        button.addEventListener('click', () => {
            this.setMode(mode);
        });

        return button;
    }

    private updateButtonStates(): void {
        // Reset all buttons
        [this.chatButton, this.agentButton].forEach(button => {
            button.style.background = 'transparent';
            button.style.color = 'var(--text-muted)';
            button.style.fontWeight = '500';
        });

        // Highlight active button
        const activeButton = this.currentMode === ProcessingMode.CHAT 
            ? this.chatButton 
            : this.agentButton;
            
        activeButton.style.background = 'var(--interactive-accent)';
        activeButton.style.color = 'var(--text-on-accent)';
        activeButton.style.fontWeight = '600';
    }

    public setMode(mode: ProcessingMode): void {
        if (mode === this.currentMode) return;

        this.currentMode = mode;
        this.updateButtonStates();
        this.onModeChange(mode);

        // Visual feedback
        const button = mode === ProcessingMode.CHAT ? this.chatButton : this.agentButton;
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
            button.style.transform = 'scale(1)';
        }, 100);
    }

    public getCurrentMode(): ProcessingMode {
        return this.currentMode;
    }

    public getElement(): HTMLElement {
        return this.container;
    }

    public destroy(): void {
        this.container.remove();
    }

    /**
     * Create command help element that shows available prefixes
     */
    public static createCommandHelp(): HTMLElement {
        const helpElement = document.createElement('div');
        helpElement.className = 'llm-command-help';
        helpElement.style.cssText = `
            font-size: 11px;
            color: var(--text-muted);
            padding: 4px 8px;
            background: var(--background-secondary);
            border-radius: 4px;
            margin-top: 4px;
        `;
        
        helpElement.innerHTML = `
            <strong>Commands:</strong> /chat &lt;message&gt; • /agent &lt;message&gt;
        `;
        
        return helpElement;
    }
}