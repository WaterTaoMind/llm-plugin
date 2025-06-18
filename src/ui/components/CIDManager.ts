import { GetCidIcon } from '../../constants/icons';

export class CIDManager {
    private container: HTMLElement;
    private popup: HTMLElement | null = null;
    private conversationIdInput: HTMLInputElement | null = null;
    private onGetConversationId: () => void;
    private onClearConversationId: () => void;
    private onConversationIdChange: (id: string) => void;

    constructor(
        container: HTMLElement, 
        onGetConversationId: () => void,
        onClearConversationId: () => void,
        onConversationIdChange: (id: string) => void
    ) {
        this.container = container;
        this.onGetConversationId = onGetConversationId;
        this.onClearConversationId = onClearConversationId;
        this.onConversationIdChange = onConversationIdChange;
    }

    showPopup() {
        if (this.popup) {
            this.hidePopup();
            return;
        }

        this.popup = this.container.createDiv({ cls: 'llm-cid-popup' });

        // Header
        const header = this.popup.createDiv({ cls: 'llm-cid-popup-header' });
        header.textContent = 'Conversation ID Management';

        // Current CID input
        const inputSection = this.popup.createDiv({ cls: 'llm-cid-input-section' });
        const inputLabel = inputSection.createDiv({ cls: 'llm-cid-label' });
        inputLabel.textContent = 'Conversation ID:';

        this.conversationIdInput = inputSection.createEl('input', {
            type: 'text',
            cls: 'llm-cid-input',
            placeholder: 'Enter conversation ID'
        });

        this.conversationIdInput.addEventListener('input', () => {
            const value = this.conversationIdInput!.value.trim();
            this.onConversationIdChange(value);
        });

        // Action buttons
        const buttonSection = this.popup.createDiv({ cls: 'llm-cid-buttons' });

        const getFromNoteButton = buttonSection.createEl('button', { cls: 'llm-cid-action-button' });
        getFromNoteButton.innerHTML = `
            <span class="llm-cid-button-icon">${GetCidIcon}</span>
            <span>Get from Note</span>
        `;
        getFromNoteButton.addEventListener('click', () => {
            this.onGetConversationId();
            this.hidePopup();
        });

        const clearButton = buttonSection.createEl('button', { cls: 'llm-cid-action-button llm-cid-clear-button' });
        clearButton.innerHTML = `
            <span>Clear CID</span>
        `;
        clearButton.addEventListener('click', () => {
            this.onClearConversationId();
            if (this.conversationIdInput) {
                this.conversationIdInput.value = '';
            }
            this.hidePopup();
        });

        // Close button
        const closeButton = this.popup.createEl('button', { cls: 'llm-cid-close-button' });
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => this.hidePopup());

        // Position popup
        this.positionPopup();

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick.bind(this));
        }, 0);
    }

    private positionPopup() {
        if (!this.popup) return;

        // Position relative to container
        const rect = this.container.getBoundingClientRect();
        this.popup.style.position = 'absolute';
        this.popup.style.top = `${rect.height + 5}px`;
        this.popup.style.left = '0px';
        this.popup.style.zIndex = '1000';
    }

    private handleOutsideClick(event: MouseEvent) {
        if (this.popup && !this.popup.contains(event.target as Node)) {
            this.hidePopup();
        }
    }

    hidePopup() {
        if (this.popup) {
            document.removeEventListener('click', this.handleOutsideClick.bind(this));
            this.popup.remove();
            this.popup = null;
            this.conversationIdInput = null;
        }
    }

    setConversationId(id: string) {
        if (this.conversationIdInput) {
            this.conversationIdInput.value = id;
        }
    }

    getConversationId(): string {
        return this.conversationIdInput?.value.trim() || '';
    }

    isPopupVisible(): boolean {
        return this.popup !== null;
    }
}
