export class StyleManager {
    private styleElements: HTMLStyleElement[] = [];

    applyStyles() {
        this.addCopyableBlocksStyles();
        this.addImagePreviewStyles();
        this.addImageInputStyles();
        this.addChatStyles();
        this.addPillButtonStyles();
        this.addSelectorStyles();
        this.addCIDPopupStyles();
    }

    removeStyles() {
        this.styleElements.forEach(el => el.remove());
        this.styleElements = [];
    }

    private addCopyableBlocksStyles() {
        const styleEl = this.createStyleElement('llm-copyable-blocks-styles', `
            .llm-copyable-block {
                position: relative;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin: 0.75em 0;
                overflow: auto;
                padding: 0.25em 0;
                transition: box-shadow 0.2s ease-in-out;
            }

            .llm-copyable-block:hover {
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
            }

            .llm-copyable-block pre {
                margin: 0;
                padding-right: 30px;
                padding-bottom: 35px;
            }

            .llm-block-toolbar {
                position: absolute;
                bottom: 6px;
                right: 6px;
                display: flex;
                flex-direction: row;
                gap: 4px;
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 2px;
                opacity: 0;
                transform: translateX(10px);
                transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
                z-index: 10;
            }

            .llm-copyable-block:hover .llm-block-toolbar {
                opacity: 0.9;
                transform: translateX(0);
            }

            .llm-block-action {
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                border-radius: 3px;
                padding: 4px;
                cursor: pointer;
                color: var(--text-normal);
                transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
            }

            .llm-block-action:hover {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .llm-block-action.copied {
                background-color: var(--interactive-success);
                color: var(--text-on-accent);
            }

            .llm-block-action svg {
                display: block;
                width: 16px;
                height: 16px;
            }
        `);
        this.styleElements.push(styleEl);
    }

    private addImagePreviewStyles() {
        const styleEl = this.createStyleElement('llm-image-preview-styles', `
            .llm-image-previews {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 8px;
                min-height: 0;
                transition: all 0.2s ease;
            }

            .llm-image-preview-wrapper {
                position: relative;
                width: 60px;
                height: 60px;
                border-radius: 4px;
                overflow: hidden;
                border: 1px solid var(--background-modifier-border);
            }

            .llm-image-thumbnail {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .llm-image-delete-btn {
                position: absolute;
                top: 2px;
                right: 2px;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.5);
                color: white;
                font-size: 16px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: none;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }

            .llm-image-delete-btn:hover {
                opacity: 1;
            }

            .llm-image-preview-wrapper.manual-path {
                background: var(--background-secondary);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 4px;
                width: 80px;
                height: 60px;
            }

            .llm-manual-path-icon {
                font-size: 20px;
                margin-bottom: 2px;
            }

            .llm-image-label {
                font-size: 10px;
                color: var(--text-muted);
                text-align: center;
                word-break: break-all;
                line-height: 1.2;
                max-height: 24px;
                overflow: hidden;
            }
        `);
        this.styleElements.push(styleEl);
    }

    private addImageInputStyles() {
        const styleEl = this.createStyleElement('llm-image-input-styles', `
            .llm-image-input-container {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 8px;
                align-items: center;
            }

            .llm-image-input {
                flex: 1;
                min-width: 200px;
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 14px;
                transition: border-color 0.2s ease, background-color 0.2s ease;
            }

            .llm-image-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
            }

            .llm-image-input.has-image {
                border-color: var(--interactive-success);
                background: var(--background-success);
            }

            .llm-image-input.data-url-image {
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
            }

            .llm-image-input.path-image {
                border-color: var(--interactive-success);
                background: var(--background-success);
            }

            .llm-image-input.invalid-image {
                border-color: var(--text-error);
                background: var(--background-primary);
            }

            .llm-add-image-button {
                padding: 8px 12px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s ease;
                min-width: 40px;
                height: 36px;
            }

            .llm-add-image-button:hover {
                background: var(--interactive-accent-hover);
            }

            .llm-add-image-button svg {
                width: 16px;
                height: 16px;
            }

            /* New unified input container styling */
            .llm-unified-input-container {
                display: flex;
                gap: 8px;
                align-items: flex-end;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 12px;
                padding: 12px;
                transition: border-color 0.2s ease;
            }

            .llm-unified-input-container:focus-within {
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1);
            }

            .llm-selectors-container {
                display: flex;
                gap: 12px;
                margin-bottom: 12px;
                flex-wrap: wrap;
            }

            .llm-model-container,
            .llm-template-container {
                flex: 1;
                min-width: 150px;
            }

            /* Legacy input container styling (for attachment panel) */
            .llm-cid-container,
            .llm-model-template-container,
            .llm-image-input-container {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
                align-items: center;
            }

            .llm-conversation-id-input,
            .llm-model-input,
            .llm-pattern-input {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 14px;
            }

            .llm-conversation-id-input:focus,
            .llm-model-input:focus,
            .llm-pattern-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
            }

            .llm-prompt-input {
                flex: 1;
                min-height: 40px;
                max-height: 200px;
                padding: 0;
                border: none;
                background: transparent;
                color: var(--text-normal);
                font-size: 14px;
                font-family: var(--font-text);
                resize: none;
                outline: none;
                line-height: 1.5;
                overflow-y: auto;
            }

            .llm-prompt-input:focus {
                outline: none;
            }

            .llm-prompt-input.drag-over {
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
                border-style: dashed;
            }

            .llm-send-button {
                padding: 8px 12px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                min-width: 44px;
                height: 44px;
            }

            .llm-get-cid-button,
            .llm-clear-cid-button {
                padding: 8px 12px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .llm-send-button:hover {
                background: var(--interactive-accent-hover);
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }

            .llm-get-cid-button:hover,
            .llm-clear-cid-button:hover {
                background: var(--interactive-accent-hover);
            }

            .llm-send-button:disabled {
                background: var(--background-modifier-border);
                color: var(--text-muted);
                cursor: not-allowed;
            }

            .llm-send-button svg,
            .llm-get-cid-button svg {
                width: 16px;
                height: 16px;
            }
        `);
        this.styleElements.push(styleEl);
    }

    private addChatStyles() {
        const styleEl = this.createStyleElement('llm-chat-styles', `
            .llm-chat-view {
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            .llm-chat-container {
                height: 100%;
                display: flex;
                flex-direction: column;
                padding: 16px;
                gap: 12px;
            }

            .llm-chat-history {
                flex: 1;
                overflow-y: auto;
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                padding: 16px;
                background: var(--background-primary);
            }

            .llm-chat-message {
                margin-bottom: 16px;
                padding: 12px;
                border-radius: 8px;
                background: var(--background-secondary);
            }

            .llm-chat-user-message {
                background: var(--background-primary-alt);
                margin-left: 20%;
            }

            .llm-chat-ai-message {
                background: var(--background-secondary);
                margin-right: 20%;
            }

            .llm-chat-content {
                display: flex;
                gap: 12px;
                align-items: flex-start;
            }

            .llm-chat-icon {
                flex-shrink: 0;
                width: 24px;
                height: 24px;
                color: var(--text-accent);
            }

            .llm-chat-text {
                flex: 1;
                line-height: 1.5;
            }

            .llm-message-actions {
                display: flex;
                flex-direction: row;
                gap: 6px;
                margin-top: 8px;
                padding: 0 8px;
            }

            .llm-message-actions .llm-block-action {
                padding: 6px;
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
            }
        `);
        this.styleElements.push(styleEl);
    }

    private addPillButtonStyles() {
        const styleEl = this.createStyleElement('llm-pill-button-styles', `
            .llm-pill-container {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                flex-wrap: wrap;
            }

            .llm-pill-button {
                display: inline-flex;
                align-items: center;
                padding: 6px 12px;
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 13px;
                color: var(--text-normal);
                white-space: nowrap;
            }

            .llm-pill-button:hover {
                background: var(--background-modifier-hover);
                border-color: var(--interactive-accent);
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .llm-pill-button.active {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border-color: var(--interactive-accent);
            }

            .llm-pill-content {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .llm-pill-icon {
                display: flex;
                align-items: center;
                width: 16px;
                height: 16px;
            }

            .llm-pill-icon svg {
                width: 100%;
                height: 100%;
            }

            .llm-pill-text {
                font-weight: 500;
            }
        `);
        this.styleElements.push(styleEl);
    }

    private addSelectorStyles() {
        const styleEl = this.createStyleElement('llm-selector-styles', `
            .llm-model-selector,
            .llm-template-selector {
                position: relative;
                display: inline-block;
                min-width: 150px;
            }

            .llm-selector-button {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                padding: 8px 12px;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 14px;
                color: var(--text-normal);
            }

            .llm-selector-button:hover {
                background: var(--background-modifier-hover);
                border-color: var(--interactive-accent);
            }

            .llm-selector-text {
                flex: 1;
                text-align: left;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .llm-selector-icon {
                margin-left: 8px;
                display: flex;
                align-items: center;
                width: 16px;
                height: 16px;
                opacity: 0.7;
            }

            .llm-selector-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 1000;
                max-height: 200px;
                overflow-y: auto;
                margin-top: 2px;
            }

            .llm-selector-option {
                padding: 10px 12px;
                cursor: pointer;
                transition: background-color 0.15s ease;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .llm-selector-option:last-child {
                border-bottom: none;
            }

            .llm-selector-option:hover {
                background: var(--background-modifier-hover);
            }

            .llm-custom-model-input,
            .llm-custom-template-input {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--interactive-accent);
                border-radius: 6px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 14px;
                margin-top: 4px;
            }

            .llm-custom-model-input:focus,
            .llm-custom-template-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }
        `);
        this.styleElements.push(styleEl);
    }

    private addCIDPopupStyles() {
        const styleEl = this.createStyleElement('llm-cid-popup-styles', `
            .llm-cid-popup {
                position: absolute;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
                padding: 16px;
                min-width: 280px;
                z-index: 1000;
            }

            .llm-cid-popup-header {
                font-weight: 600;
                font-size: 14px;
                color: var(--text-normal);
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .llm-cid-input-section {
                margin-bottom: 16px;
            }

            .llm-cid-label {
                font-size: 13px;
                color: var(--text-muted);
                margin-bottom: 6px;
            }

            .llm-cid-input {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 14px;
            }

            .llm-cid-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }

            .llm-cid-buttons {
                display: flex;
                gap: 8px;
                flex-direction: column;
            }

            .llm-cid-action-button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 16px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                border-radius: 6px;
                cursor: pointer;
                transition: background-color 0.2s ease;
                font-size: 14px;
                font-weight: 500;
            }

            .llm-cid-action-button:hover {
                background: var(--interactive-accent-hover);
            }

            .llm-cid-clear-button {
                background: var(--background-secondary);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
            }

            .llm-cid-clear-button:hover {
                background: var(--background-modifier-hover);
            }

            .llm-cid-button-icon {
                display: flex;
                align-items: center;
                width: 16px;
                height: 16px;
            }

            .llm-cid-close-button {
                position: absolute;
                top: 8px;
                right: 8px;
                width: 24px;
                height: 24px;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 18px;
                color: var(--text-muted);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            }

            .llm-cid-close-button:hover {
                background: var(--background-modifier-hover);
                color: var(--text-normal);
            }
        `);
        this.styleElements.push(styleEl);
    }

    private createStyleElement(id: string, css: string): HTMLStyleElement {
        const styleEl = document.createElement('style');
        styleEl.id = id;
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
        return styleEl;
    }
}
