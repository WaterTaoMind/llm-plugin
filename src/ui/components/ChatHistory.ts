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
        const messageEl = this.container.createDiv({
            cls: `llm-chat-message llm-chat-${message.type}-message`
        });

        const icon = message.type === 'user' ? UserIcon : ChatbotIcon;
        const content = message.type === 'assistant'
            ? markdownRenderer(message.content)
            : message.content;

        messageEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${icon}</div>
                <div class="llm-chat-text">${content}</div>
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

        const progressContent = messageEl.createDiv({ cls: 'llm-chat-content' });
        const renderedContent = this.renderMarkdown(initialContent);
        progressContent.innerHTML = `
            <div class="llm-chat-icon">${ChatbotIcon}</div>
            <div class="llm-chat-text llm-progress-text">${renderedContent}</div>
        `;

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
