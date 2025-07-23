import { ChatMessage } from '../../core/types';
import { UserIcon, ChatbotIcon } from '../../constants/icons';
import { Notice } from 'obsidian';

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
        // Only apply progress styling to actual progress messages, not regular assistant messages
        const isAssistant = message.type === 'assistant';
        const messageClasses = isAssistant 
            ? 'llm-chat-message llm-chat-assistant-message'
            : `llm-chat-message llm-chat-${message.type}-message`;
            
        const messageEl = this.container.createDiv({
            cls: messageClasses
        });

        const icon = message.type === 'user' ? UserIcon : ChatbotIcon;
        const content = message.type === 'assistant'
            ? markdownRenderer(message.content)
            : message.content;

        // Use regular chat text styling for standard messages
        const textClass = 'llm-chat-text';

        messageEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${icon}</div>
                <div class="${textClass}">${content}</div>
            </div>
        `;

        // Add images if present
        if (message.images && message.images.length > 0) {
            this.addImagesToMessage(messageEl, message.images);
        }

        // Add action buttons
        this.addMessageActions(messageEl, message);
    }

    private addImagesToMessage(messageEl: HTMLElement, images: string[]) {
        const chatContent = messageEl.querySelector('.llm-chat-content');
        if (!chatContent) return;

        const imagesContainer = chatContent.createDiv({ cls: 'llm-chat-images' });
        
        images.forEach((imageData, index) => {
            const imageContainer = imagesContainer.createDiv({ cls: 'llm-chat-image-container' });
            
            // Create image element
            const img = imageContainer.createEl('img', { 
                cls: 'llm-chat-image',
                attr: {
                    src: `data:image/jpeg;base64,${imageData}`,
                    alt: `Generated image ${index + 1}`,
                    loading: 'lazy'
                }
            });
            
            // Add click handler for full-size view
            img.onclick = () => this.showImageModal(imageData, index + 1);
            
            // Add image actions
            const imageActions = imageContainer.createDiv({ cls: 'llm-image-actions' });
            
            // Download button
            const downloadButton = imageActions.createEl('button', { 
                cls: 'llm-image-action',
                attr: { title: 'Download image' }
            });
            downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
            downloadButton.onclick = (e) => {
                e.stopPropagation();
                this.downloadImage(imageData, index + 1);
            };
            
            // Copy button
            const copyImageButton = imageActions.createEl('button', { 
                cls: 'llm-image-action',
                attr: { title: 'Copy image to clipboard' }
            });
            copyImageButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2 2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
            copyImageButton.onclick = (e) => {
                e.stopPropagation();
                this.copyImageToClipboard(imageData, copyImageButton);
            };
        });
    }

    private showImageModal(imageData: string, imageNumber: number) {
        // Create modal overlay
        const modal = document.body.createDiv({ cls: 'llm-image-modal' });
        
        // Modal content
        const modalContent = modal.createDiv({ cls: 'llm-image-modal-content' });
        
        // Close button
        const closeButton = modalContent.createEl('button', { 
            cls: 'llm-image-modal-close',
            text: '×'
        });
        closeButton.onclick = () => modal.remove();
        
        // Image
        const img = modalContent.createEl('img', {
            cls: 'llm-image-modal-img',
            attr: {
                src: `data:image/jpeg;base64,${imageData}`,
                alt: `Generated image ${imageNumber}`
            }
        });
        
        // Close on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };
        
        // Close on escape key
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    private downloadImage(imageData: string, imageNumber: number) {
        try {
            // Convert base64 to blob
            const byteCharacters = atob(imageData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });
            
            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `generated-image-${imageNumber}-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download image:', error);
        }
    }

    private async copyImageToClipboard(imageData: string, button: HTMLElement) {
        try {
            // Convert base64 to blob
            const byteCharacters = atob(imageData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });
            
            // Copy to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/jpeg': blob })
            ]);
            
            button.classList.add('copied');
            setTimeout(() => button.classList.remove('copied'), 1000);
            new Notice('Image copied to clipboard');
        } catch (error) {
            console.error('Failed to copy image to clipboard:', error);
            // Fallback: copy as data URL
            try {
                await navigator.clipboard.writeText(`data:image/jpeg;base64,${imageData}`);
                button.classList.add('copied');
                setTimeout(() => button.classList.remove('copied'), 1000);
                new Notice('Image copied to clipboard');
            } catch (fallbackError) {
                console.error('Failed to copy image data URL:', fallbackError);
                new Notice('Failed to copy image to clipboard');
            }
        }
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
            new Notice('Copied to clipboard');
        }).catch(() => {
            new Notice('Failed to copy to clipboard');
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

        // Use the exact same structure as renderMessage for consistency
        messageEl.innerHTML = `
            <div class="llm-chat-content">
                <div class="llm-chat-icon">${icon}</div>
                <div class="llm-chat-text llm-progress-text">${content}</div>
            </div>
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
     * Add hierarchical action buttons with embedded final result section
     */
    addProgressMessageActions(messageEl: HTMLElement, finalResult: string, images?: string[]): void {
        const textEl = messageEl.querySelector('.llm-progress-text') as HTMLElement;
        
        if (!textEl) return;
        
        // Create embedded final result section within the progress text
        const finalResultSection = textEl.createDiv({ cls: 'llm-final-result-section' });
        finalResultSection.innerHTML = `
            <div class="llm-final-result-header">Final Result</div>
            <div class="llm-final-result-content">${this.renderMarkdown(finalResult)}</div>
        `;
        
        // Add images if present
        if (images && images.length > 0) {
            this.addImagesToProgressMessage(finalResultSection, images);
        }
        
        // Add action buttons under final result section
        const finalResultActions = finalResultSection.createDiv({ cls: 'llm-message-actions' });
        this.createStandardActionButtons(finalResultActions, finalResult, 'final result');
        
        // Add action buttons under complete response (entire message)
        const completeResponseActions = messageEl.createDiv({ cls: 'llm-message-actions' });
        const completeResponse = this.formatCompleteResponse(textEl.textContent || '');
        this.createStandardActionButtons(completeResponseActions, completeResponse, 'complete response');
    }

    /**
     * Create standard action buttons exactly like chat mode
     */
    private createStandardActionButtons(container: HTMLElement, content: string, contentType: string): void {
        // Copy button
        const copyButton = container.createEl('button', { cls: 'llm-block-action' });
        copyButton.setAttribute('title', `Copy ${contentType} to clipboard`);
        copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        copyButton.onclick = () => this.copyToClipboard(content, copyButton);

        // Insert button
        const insertButton = container.createEl('button', { cls: 'llm-block-action' });
        insertButton.setAttribute('title', `Insert ${contentType} at cursor`);
        insertButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="8 12 12 12 16 12"></polyline>
        </svg>`;
        insertButton.onclick = () => this.triggerAction('insert', content, insertButton);

        // Prepend button
        const prependButton = container.createEl('button', { cls: 'llm-block-action' });
        prependButton.setAttribute('title', `Prepend ${contentType} to note`);
        prependButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="12 12 12 6"></polyline>
          <polyline points="8 8 12 4 16 8"></polyline>
        </svg>`;
        prependButton.onclick = () => this.triggerAction('prepend', content, prependButton);

        // Append button
        const appendButton = container.createEl('button', { cls: 'llm-block-action' });
        appendButton.setAttribute('title', `Append ${contentType} to note`);
        appendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="12 12 12 18"></polyline>
          <polyline points="8 16 12 20 16 16"></polyline>
        </svg>`;
        appendButton.onclick = () => this.triggerAction('append', content, appendButton);
    }

    /**
     * Create a single action button (retained for modularity).
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
     * Add images specifically to progress message sections
     */
    private addImagesToProgressMessage(container: HTMLElement, images: string[]) {
        const imagesContainer = container.createDiv({ cls: 'llm-chat-images' });
        
        images.forEach((imageData, index) => {
            const imageContainer = imagesContainer.createDiv({ cls: 'llm-chat-image-container' });
            
            // Create image element
            const img = imageContainer.createEl('img', { 
                cls: 'llm-chat-image',
                attr: {
                    src: `data:image/jpeg;base64,${imageData}`,
                    alt: `Generated image ${index + 1}`,
                    loading: 'lazy'
                }
            });
            
            // Add click handler for full-size view
            img.onclick = () => this.showImageModal(imageData, index + 1);
            
            // Add image actions
            const imageActions = imageContainer.createDiv({ cls: 'llm-image-actions' });
            
            // Download button
            const downloadButton = imageActions.createEl('button', { 
                cls: 'llm-image-action',
                attr: { title: 'Download image' }
            });
            downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
            downloadButton.onclick = (e) => {
                e.stopPropagation();
                this.downloadImage(imageData, index + 1);
            };
            
            // Copy button
            const copyImageButton = imageActions.createEl('button', { 
                cls: 'llm-image-action',
                attr: { title: 'Copy image to clipboard' }
            });
            copyImageButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
            copyImageButton.onclick = (e) => {
                e.stopPropagation();
                this.copyImageToClipboard(imageData, copyImageButton);
            };
        });
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
