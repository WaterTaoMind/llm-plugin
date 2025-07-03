export class StyleManager {
    private styleElements: HTMLStyleElement[] = [];

    applyStyles() {
        this.addCopyableBlocksStyles();
        this.addImagePreviewStyles();
        this.addImageInputStyles();
        this.addChatStyles();
        this.addMCPStyles();
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

            /* Input container styling */
            .llm-cid-container,
            .llm-model-template-container,
            .llm-prompt-input-container {
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
                width: 100%;
                min-height: 80px;
                padding: 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 14px;
                font-family: var(--font-text);
                resize: vertical;
                transition: border-color 0.2s ease;
            }

            .llm-prompt-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
            }

            .llm-prompt-input.drag-over {
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
                border-style: dashed;
            }

            .llm-send-button,
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

            .llm-send-button:hover,
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

    private addMCPStyles() {
        const styleEl = this.createStyleElement('llm-mcp-styles', `
            .mcp-server-list {
                margin: 1em 0;
            }

            .mcp-server-item {
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                padding: 1em;
                margin: 0.5em 0;
                background: var(--background-secondary);
            }

            .mcp-server-header {
                margin-bottom: 1em;
                padding-bottom: 0.5em;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .mcp-server-status-enabled {
                color: var(--text-success);
                font-size: 0.9em;
            }

            .mcp-server-status-disabled {
                color: var(--text-muted);
                font-size: 0.9em;
            }

            .mcp-server-status-connected {
                color: var(--color-green);
                font-size: 0.9em;
                font-weight: bold;
            }

            .mcp-server-status-connecting {
                color: var(--color-orange);
                font-size: 0.9em;
            }

            .mcp-server-status-error {
                color: var(--color-red);
                font-size: 0.9em;
            }

            .mcp-server-status-disconnected {
                color: var(--text-muted);
                font-size: 0.9em;
            }

            .mcp-tools-count {
                color: var(--text-accent);
                font-size: 0.8em;
                font-style: italic;
            }

            .mcp-server-item hr {
                margin: 1em 0;
                border: none;
                border-top: 1px solid var(--background-modifier-border);
            }

            .mcp-server-item .setting-item {
                border: none;
                padding: 0.5em 0;
            }

            .mcp-server-item .setting-item:last-child {
                border-bottom: none;
            }

            .mcp-server-actions {
                display: flex;
                gap: 0.5em;
                margin-top: 1em;
                padding-top: 1em;
                border-top: 1px solid var(--background-modifier-border);
            }

            .mcp-server-actions button {
                padding: 0.5em 1em;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-primary);
                color: var(--text-normal);
                cursor: pointer;
                font-size: 0.9em;
            }

            .mcp-server-actions button:hover {
                background: var(--background-modifier-hover);
            }

            .mcp-server-actions button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .mcp-server-actions button.mod-cta {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border-color: var(--interactive-accent);
            }

            .mcp-server-actions button.mod-warning {
                background: var(--color-red);
                color: white;
                border-color: var(--color-red);
            }

            /* MCP Status Pill */
            .mcp-status-pill {
                font-size: 0.8em !important;
                padding: 4px 8px !important;
                min-width: auto !important;
            }

            .mcp-status-pill.mcp-connected {
                background-color: var(--color-green) !important;
                color: white !important;
            }

            .mcp-status-pill.mcp-disconnected {
                background-color: var(--color-red) !important;
                color: white !important;
            }

            .mcp-status-pill:hover {
                opacity: 0.8;
            }

            /* Mode Selector Styles */
            .llm-controls-container {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                background: var(--background-primary-alt);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
            }

            .llm-mode-selector {
                position: relative;
                display: inline-block;
            }

            .llm-mode-current {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background: var(--background-primary);
                color: var(--text-normal);
                cursor: pointer;
                transition: all 0.15s ease;
                font-size: 13px;
                font-weight: 400;
                min-width: 80px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }

            .llm-mode-current:hover {
                background: var(--background-modifier-hover);
                border-color: var(--background-modifier-border-hover);
            }

            .llm-mode-current[aria-expanded="true"] {
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px var(--interactive-accent-hover);
            }

            .llm-mode-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                z-index: 1000;
                margin-top: 4px;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                overflow: hidden;
            }

            .llm-mode-option {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border: none;
                background: transparent;
                color: var(--text-normal);
                cursor: pointer;
                transition: all 0.15s ease;
                font-size: 13px;
                font-weight: 400;
                text-align: left;
                width: 100%;
            }

            .llm-mode-option:hover {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .llm-mode-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .llm-mode-icon svg {
                width: 16px;
                height: 16px;
                stroke: currentColor;
                stroke-width: 1.5;
            }

            .llm-mode-label {
                font-size: 13px;
                font-weight: 400;
                color: inherit;
                white-space: nowrap;
            }

            .llm-mode-arrow {
                margin-left: auto;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.6;
            }

            .llm-mode-arrow svg {
                width: 12px;
                height: 12px;
                stroke: currentColor;
                transition: transform 0.2s ease;
            }

            .llm-mode-current[aria-expanded="true"] .llm-mode-arrow svg {
                transform: rotate(180deg);
            }

            /* Dark theme optimizations */
            .theme-dark .llm-mode-current {
                background: var(--background-primary-alt);
                border-color: var(--background-modifier-border-hover);
            }

            .theme-dark .llm-mode-dropdown {
                background: var(--background-primary-alt);
                border-color: var(--background-modifier-border-hover);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            }

            .llm-model-selector {
                flex: 1;
                padding: 6px 10px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 13px;
                min-width: 120px;
            }

            .llm-model-selector:focus {
                outline: none;
                border-color: var(--interactive-accent);
                background: var(--background-primary-alt);
            }

            .llm-unified-send-button {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .llm-unified-send-button:hover {
                background: var(--interactive-accent-hover);
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .llm-unified-send-button:active {
                transform: translateY(0);
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
            }

            .llm-unified-send-button svg {
                width: 16px;
                height: 16px;
                fill: currentColor;
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
