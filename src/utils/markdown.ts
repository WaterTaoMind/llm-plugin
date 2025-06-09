import MarkdownIt from 'markdown-it';
import { InsertNoteIcon, PrependNoteIcon, SaveAsNoteIcon } from '../constants/icons';

export class MarkdownProcessor {
    private md: MarkdownIt;

    constructor() {
        this.md = new MarkdownIt();
        this.configureCopyableBlocks();
    }

    render(content: string): string {
        return this.md.render(content);
    }

    private configureCopyableBlocks() {
        // Store original renderers
        const originalFenceRenderer = this.md.renderer.rules.fence;
        const originalHtmlBlockRenderer = this.md.renderer.rules.html_block;
        const originalTableRenderer = this.md.renderer.rules.table_open;
        const originalTableCloseRenderer = this.md.renderer.rules.table_close;

        // Custom fence renderer for code blocks
        this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const content = token.content;
            const langName = token.info.trim() || '';

            let originalHtml = '';
            if (originalFenceRenderer) {
                originalHtml = originalFenceRenderer(tokens, idx, options, env, self);
            } else {
                originalHtml = self.renderToken(tokens, idx, options);
            }

            let blockType = 'code';
            if (langName.match(/^(plantuml|mermaid|graph)$/i)) {
                blockType = 'diagram';
            } else if (langName.match(/^svg$/i) || content.trim().startsWith('<svg')) {
                blockType = 'svg';
            }

            return this.wrapWithToolbar(originalHtml, content, blockType);
        };

        // Custom HTML block renderer
        this.md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const content = token.content;

            let originalHtml = '';
            if (originalHtmlBlockRenderer) {
                originalHtml = originalHtmlBlockRenderer(tokens, idx, options, env, self);
            } else {
                originalHtml = content;
            }

            let blockType = 'html';
            if (content.trim().match(/<svg\s/i)) {
                blockType = 'svg';
            } else if (content.trim().match(/<(div|span)\s+class="[^"]*mermaid[^"]*"/i)) {
                blockType = 'diagram';
            }

            if (blockType === 'svg' || blockType === 'diagram') {
                return this.wrapWithToolbar(originalHtml, content, blockType);
            }

            return originalHtml;
        };

        // Table renderers
        this.md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
            const tableText = this.extractTableText(tokens, idx);
            const originalHtml = originalTableRenderer
                ? originalTableRenderer(tokens, idx, options, env, self)
                : self.renderToken(tokens, idx, options);

            return `<div class="llm-copyable-block llm-table-block" data-table-content="${this.escapeHtml(tableText)}">` + originalHtml;
        };

        this.md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
            const closeTag = originalTableCloseRenderer
                ? originalTableCloseRenderer(tokens, idx, options, env, self)
                : self.renderToken(tokens, idx, options);

            // Get table content from the wrapper div
            const tableText = ''; // This would need to be extracted properly

            return closeTag + this.createToolbar(tableText) + '</div>';
        };
    }

    private wrapWithToolbar(originalHtml: string, content: string, blockType: string): string {
        return `
            <div class="llm-copyable-block llm-${blockType}-block">
                ${originalHtml}
                ${this.createToolbar(content)}
            </div>
        `;
    }

    private createToolbar(content: string): string {
        return `
            <div class="llm-block-toolbar">
                <button class="llm-block-action" data-action="copy" data-content="${this.escapeHtml(content)}" title="Copy to clipboard">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                <button class="llm-block-action" data-action="insert" data-content="${this.escapeHtml(content)}" title="Insert at cursor">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="8 12 12 12 16 12"></polyline>
                    </svg>
                </button>
                <button class="llm-block-action" data-action="prepend" data-content="${this.escapeHtml(content)}" title="Prepend to note">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="12 12 12 6"></polyline>
                      <polyline points="8 8 12 4 16 8"></polyline>
                    </svg>
                </button>
                <button class="llm-block-action" data-action="append" data-content="${this.escapeHtml(content)}" title="Append to note">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="12 12 12 18"></polyline>
                      <polyline points="8 16 12 20 16 16"></polyline>
                    </svg>
                </button>
            </div>
        `;
    }

    private extractTableText(tokens: any[], startIdx: number): string {
        let tableText = '';
        let rowContent: string[] = [];

        for (let i = startIdx; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.type === 'table_close') break;

            if (token.type === 'tr_open') {
                rowContent = [];
            } else if (token.type === 'tr_close') {
                tableText += rowContent.join('\t') + '\n';
            } else if ((token.type === 'th_open' || token.type === 'td_open') && i + 1 < tokens.length) {
                const contentToken = tokens[i + 1];
                if (contentToken.type === 'inline' && contentToken.content) {
                    rowContent.push(contentToken.content);
                }
            }
        }

        return tableText;
    }

    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
