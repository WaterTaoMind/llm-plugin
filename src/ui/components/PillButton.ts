export interface PillButtonOptions {
    text: string;
    icon?: string;
    onClick: () => void;
    className?: string;
    active?: boolean;
}

export class PillButton {
    private element: HTMLElement;
    private options: PillButtonOptions;

    constructor(container: HTMLElement, options: PillButtonOptions) {
        this.options = options;
        this.element = this.createElement(container);
    }

    private createElement(container: HTMLElement): HTMLElement {
        const button = container.createEl('button', {
            cls: `llm-pill-button ${this.options.className || ''}`,
        });

        if (this.options.active) {
            button.addClass('active');
        }

        const content = button.createDiv({ cls: 'llm-pill-content' });

        if (this.options.icon) {
            const iconEl = content.createDiv({ cls: 'llm-pill-icon' });
            iconEl.innerHTML = this.options.icon;
        }

        const textEl = content.createDiv({ cls: 'llm-pill-text' });
        textEl.textContent = this.options.text;

        button.addEventListener('click', this.options.onClick);

        return button;
    }

    setActive(active: boolean) {
        this.options.active = active;
        if (active) {
            this.element.addClass('active');
        } else {
            this.element.removeClass('active');
        }
    }

    setText(text: string) {
        this.options.text = text;
        const textEl = this.element.querySelector('.llm-pill-text');
        if (textEl) {
            textEl.textContent = text;
        }
    }

    destroy() {
        this.element.remove();
    }

    getElement(): HTMLElement {
        return this.element;
    }
}
