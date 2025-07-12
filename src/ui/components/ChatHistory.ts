import { ChatMessage } from '../../core/types';
import { UserIcon, ChatbotIcon } from '../../constants/icons';

export class ChatHistory {
    public container: HTMLElement;
    private messages: ChatMessage[] = [];

    constructor(container: HTMLElement) {
        this.container = container;
        this.container.addClass('llm-chat-history');
    }

    addMessage(message: ChatMessage, markdownRenderer?: (content: string) => string) {
        this.messages.push(message);
        this.renderMessage(message, markdownRenderer || ((content) => content));
        this.scrollToBottom();
    }

    private renderMessage(message: ChatMessage, markdownRenderer: (content: string) => string) {
        // Apply unified purple styling to all assistant messages
        const isAssistant = message.type === 'assistant';
        const messageClasses = isAssistant 
            ? 'llm-chat-message llm-chat-assistant-message llm-progress-message'
            : `llm-chat-message llm-chat-${message.type}-message`;
            
        const messageEl = this.container.createDiv({
            cls: messageClasses
        });

        const icon = message.type === 'user' ? UserIcon : ChatbotIcon;
        const content = message.type === 'assistant'
            ? markdownRenderer(message.content)
            : message.content;

        // Use progress text styling for assistant messages to match theme
        const textClass = isAssistant ? 'llm-chat-text llm-progress-text' : 'llm-chat-text';

        messageEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${icon}</div>
                <div class="${textClass}">${content}</div>
            </div>
        `;

        // Add action buttons
        this.addMessageActions(messageEl, message);
    }

    private addMessageActions(messageEl: HTMLElement, message: ChatMessage) {
        const actionContainer = messageEl.createDiv({ cls: 'llm-message-actions' });

        // Copy button
        const copyButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
        copyButton.setAttribute('title', 'Copy to clipboard');
        copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        copyButton.onclick = () => this.copyToClipboard(message.content, copyButton);

        if (message.type === 'assistant') {
            // Insert button
            const insertButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
            insertButton.setAttribute('title', 'Insert at cursor');
            insertButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="8 12 12 12 16 12"></polyline>
            </svg>`;
            insertButton.onclick = () => this.triggerAction('insert', message.content, insertButton);

            // Prepend button
            const prependButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
            prependButton.setAttribute('title', 'Prepend to note');
            prependButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="12 12 12 6"></polyline>
              <polyline points="8 8 12 4 16 8"></polyline>
            </svg>`;
            prependButton.onclick = () => this.triggerAction('prepend', message.content, prependButton);

            // Append button
            const appendButton = actionContainer.createEl('button', { cls: 'llm-block-action' });
            appendButton.setAttribute('title', 'Append to note');
            appendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="12 12 12 18"></polyline>
              <polyline points="8 16 12 20 16 16"></polyline>
            </svg>`;
            appendButton.onclick = () => this.triggerAction('append', message.content, appendButton);
        }
    }

    private copyToClipboard(content: string, button: HTMLElement) {
        navigator.clipboard.writeText(content).then(() => {
            button.classList.add('copied');
            setTimeout(() => button.classList.remove('copied'), 1000);
        });
    }

    private triggerAction(action: string, content: string, button: HTMLElement) {
        // Dispatch custom event that the parent view can listen to
        const event = new CustomEvent('llm-action', {
            detail: { action, content }
        });
        this.container.dispatchEvent(event);

        button.classList.add('copied');
        setTimeout(() => button.classList.remove('copied'), 1000);
    }

    private scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }


    /**
     * Create a progress message for real-time updates
     */
    addProgressMessage(initialContent: string): HTMLElement {
        const messageEl = this.container.createDiv({
            cls: 'llm-chat-message llm-chat-assistant-message llm-progress-message'
        });

        const icon = ChatbotIcon;
        const content = this.renderMarkdown(initialContent);

        // Create DOM structure exactly like renderMessage() for consistency
        const contentDiv = messageEl.createDiv({ cls: 'llm-chat-content' });
        const iconDiv = contentDiv.createDiv({ cls: 'llm-chat-icon' });
        iconDiv.innerHTML = icon;
        const textDiv = contentDiv.createDiv({ cls: 'llm-chat-text llm-progress-text' });
        textDiv.innerHTML = content;

        this.scrollToBottom();
        return messageEl;
    }

    /**
     * Append content to existing progress message
     */
    appendToProgressMessage(messageEl: HTMLElement, content: string): void {
        const textEl = messageEl.querySelector('.llm-progress-text');
        if (textEl) {
            const renderedContent = this.renderMarkdown(content);
            textEl.innerHTML += renderedContent;
            
            // Force a repaint to ensure visibility
            messageEl.style.display = 'block';
            messageEl.offsetHeight; // Trigger reflow
        }
        this.scrollToBottom();
    }

    /**
     * Add integrated action buttons to progress message (like chat mode)
     */
    addProgressMessageActions(messageEl: HTMLElement, finalResult: string): void {
        // Extract complete response content from the progress message
        const textEl = messageEl.querySelector('.llm-progress-text') as HTMLElement;
        const rawCompleteResponse = textEl ? textEl.textContent || textEl.innerText || '' : '';
        const completeResponse = this.formatCompleteResponse(rawCompleteResponse);

        // Create action container exactly like chat mode - directly on the message element
        const actionContainer = messageEl.createDiv({ cls: 'llm-message-actions' });
        
        // Create all buttons in single row like chat mode
        // Complete response buttons (with subtle visual distinction)
        this.createProgressActionButtons(actionContainer, completeResponse, finalResult);
    }

    /**
     * Create progress action buttons for both complete response and final result in single row
     */
    private createProgressActionButtons(container: HTMLElement, completeResponse: string, finalResult: string): void {
        // Complete response buttons (first set)
        this.createSingleActionButton(container, completeResponse, 'copy', 'Copy complete response');
        this.createSingleActionButton(container, completeResponse, 'insert', 'Insert complete response');
        this.createSingleActionButton(container, completeResponse, 'prepend', 'Prepend complete response');
        this.createSingleActionButton(container, completeResponse, 'append', 'Append complete response');
        
        // Final result buttons (second set)
        this.createSingleActionButton(container, finalResult, 'copy', 'Copy final result');
        this.createSingleActionButton(container, finalResult, 'insert', 'Insert final result');
        this.createSingleActionButton(container, finalResult, 'prepend', 'Prepend final result');
        this.createSingleActionButton(container, finalResult, 'append', 'Append final result');
    }

    /**
     * Create a single action button
     */
    private createSingleActionButton(container: HTMLElement, content: string, action: string, tooltip: string): void {
        const button = container.createEl('button', { cls: 'llm-block-action' });
        button.setAttribute('title', tooltip);
        
        const svgMap: { [key: string]: string } = {
            'copy': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
            'insert': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
            'prepend': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
            'append': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>'
        };
        
        button.innerHTML = svgMap[action] || '';
        button.onclick = () => {
            if (action === 'copy') {
                this.copyToClipboard(content, button);
            } else {
                this.triggerAction(action, content, button);
            }
        };
    }

    /**
     * Create a set of action buttons (copy, insert, prepend, append)
     */
    private createActionButtons(container: HTMLElement, content: string, tooltipPrefix: string): void {
        // Copy button
        const copyButton = container.createEl('button', { cls: 'llm-block-action' });
        copyButton.setAttribute('title', `Copy ${tooltipPrefix} to clipboard`);
        copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        copyButton.onclick = () => this.copyToClipboard(content, copyButton);

        // Insert button
        const insertButton = container.createEl('button', { cls: 'llm-block-action' });
        insertButton.setAttribute('title', `Insert ${tooltipPrefix} at cursor`);
        insertButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
        insertButton.onclick = () => this.triggerAction('insert', content, insertButton);

        // Prepend button
        const prependButton = container.createEl('button', { cls: 'llm-block-action' });
        prependButton.setAttribute('title', `Prepend ${tooltipPrefix} to note`);
        prependButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
        prependButton.onclick = () => this.triggerAction('prepend', content, prependButton);

        // Append button
        const appendButton = container.createEl('button', { cls: 'llm-block-action' });
        appendButton.setAttribute('title', `Append ${tooltipPrefix} to note`);
        appendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
        appendButton.onclick = () => this.triggerAction('append', content, appendButton);
    }


    /**
     * Format complete response text for better readability
     */
    private formatCompleteResponse(rawText: string): string {
        return rawText
            // Add line breaks after sections
            .replace(/([.!?])\s*([🤔🔧✅💭📊🎯🛠️📝])/g, '$1\n\n$2')
            // Add spacing around step indicators
            .replace(/(Step \d+)/g, '\n$1')
            // Add spacing around completion indicators
            .replace(/(Task Completed Successfully)/g, '\n$1\n')
            // Clean up excessive whitespace
            .replace(/\n{3,}/g, '\n\n')
            // Trim whitespace
            .trim();
    }

    /**
     * Simple markdown rendering for progress messages
     */
    private renderMarkdown(content: string): string {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>')
            .replace(/<details><summary>(.*?)<\/summary>\n\n(.*?)\n<\/details>/gs, 
                '<details><summary>$1</summary><div style="margin-top: 8px;">$2</div></details>');
    }

    clear() {
        this.messages = [];
        this.container.empty();
    }

    getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    exportToMarkdown(): string {
        return this.messages.map(msg => {
            const timestamp = msg.timestamp.toLocaleString();
            const role = msg.type === 'user' ? 'User' : 'Assistant';
            return `## ${role} (${timestamp})\n\n${msg.content}\n\n---\n`;
        }).join('\n');
    }
}
