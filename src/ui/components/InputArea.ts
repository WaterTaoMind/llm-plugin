import { Notice } from 'obsidian';
import { Command } from '../../core/types';
import { SendIcon, PlusIcon, GetCidIcon } from '../../constants/icons';

export class InputArea {
    public container: HTMLElement;
    private conversationIdInput: HTMLInputElement;
    private modelInput: HTMLInputElement;
    private patternInput: HTMLInputElement;
    private promptInput: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private dropdown: HTMLElement | null = null;
    private commands: Command[] = [];
    private attachedImages: string[] = []; // For drag-dropped images
    private imagePreviewContainer: HTMLElement;
    private imagePathInput: HTMLInputElement;
    private addImageButton: HTMLButtonElement;
    private imageInputContainer: HTMLElement;

    // Event handlers
    public onSendMessage: () => void = () => {};

    public onGetConversationId: () => void = () => {};
    public onClearConversationId: () => void = () => {};

    constructor(container: HTMLElement) {
        this.container = container;
        this.createInputInterface();
    }

    private createInputInterface() {
        // Conversation ID section
        const cidContainer = this.container.createDiv({ cls: 'llm-cid-container' });

        const getCidButton = cidContainer.createEl('button', { cls: 'llm-get-cid-button' });
        getCidButton.innerHTML = GetCidIcon;
        getCidButton.addEventListener('click', () => this.onGetConversationId());

        this.conversationIdInput = cidContainer.createEl('input', {
            type: 'text',
            placeholder: 'Conversation ID (optional)',
            cls: 'llm-conversation-id-input'
        });

        const clearCidButton = cidContainer.createEl('button', { cls: 'llm-clear-cid-button' });
        clearCidButton.innerHTML = 'Clear';
        clearCidButton.addEventListener('click', () => this.onClearConversationId());

        // Model and pattern inputs
        const modelTemplateContainer = this.container.createDiv({ cls: 'llm-model-template-container' });

        this.modelInput = modelTemplateContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter model name',
            cls: 'llm-model-input'
        });

        this.patternInput = modelTemplateContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter LLM template',
            cls: 'llm-pattern-input'
        });

        // Image path input section (manual entry)
        this.imageInputContainer = this.container.createDiv({ cls: 'llm-image-input-container' });
        this.imagePathInput = this.imageInputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter document path',
            cls: 'llm-image-input'
        });
        this.addImageButton = this.imageInputContainer.createEl('button', {
            cls: 'llm-add-image-button'
        });
        this.addImageButton.innerHTML = PlusIcon;
        this.addImageButton.addEventListener('click', () => this.addImageInput());

        // Setup image path input handlers
        this.setupImagePathInputHandlers();

        // Image preview section
        this.imagePreviewContainer = this.container.createDiv({ cls: 'llm-image-previews' });

        // Prompt input section
        const promptInputContainer = this.container.createDiv({ cls: 'llm-prompt-input-container' });

        this.promptInput = promptInputContainer.createEl('textarea', {
            placeholder: 'Type your message here... (drop screenshots here)',
            cls: 'llm-prompt-input'
        });

        // Setup prompt input event handlers
        this.setupPromptInputHandlers();

        this.sendButton = promptInputContainer.createEl('button', { cls: 'llm-send-button' });
        this.sendButton.innerHTML = SendIcon;
        this.sendButton.addEventListener('click', () => this.handleSendMessage());
    }

    private setupPromptInputHandlers() {
        // Command autocomplete
        this.promptInput.addEventListener('input', (e) => this.handlePromptInput(e as InputEvent));
        this.promptInput.addEventListener('keydown', (e) => this.handlePromptKeydown(e));

        // Drag and drop for images
        this.promptInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.promptInput.classList.add('drag-over');
        });

        this.promptInput.addEventListener('dragleave', () => {
            this.promptInput.classList.remove('drag-over');
        });

        this.promptInput.addEventListener('drop', (e) => {
            e.preventDefault();
            this.promptInput.classList.remove('drag-over');

            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                this.handleDroppedFiles(e.dataTransfer.files);
            }
        });
    }

    private setupImagePathInputHandlers() {
        // Handle input validation and styling
        this.imagePathInput.addEventListener('input', () => {
            this.updateAddImageButtonVisibility();
            this.validateImagePath(this.imagePathInput);
        });

        // Handle Enter key to add image
        this.imagePathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addImageFromInput();
            }
        });
    }

    private validateImagePath(input: HTMLInputElement) {
        const value = input.value.trim();

        // Remove existing classes
        input.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');

        if (value) {
            if (value.startsWith('data:image/')) {
                // Valid data URL
                input.classList.add('has-image', 'data-url-image');
            } else if (value.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|pdf|txt|md|doc|docx)$/i)) {
                // Path appears to be a supported file
                input.classList.add('has-image', 'path-image');
            } else {
                // Possibly valid path (could be any document type)
                input.classList.add('has-image', 'path-image');
            }
        }
    }

    private addImageFromInput() {
        const path = this.imagePathInput.value.trim();
        if (path) {
            // Mark this input as having an image and create a new one if needed
            this.imagePathInput.classList.add('has-image');
            this.validateImagePath(this.imagePathInput);

            // Create a new input field for the next image
            this.addImageInput();

            this.updateAddImageButtonVisibility();
            this.renderImagePreviews();
            new Notice('Image path added');
        }
    }

    private addImageInput() {
        if (!this.imageInputContainer) return;

        // Check if we already have 5 inputs
        const allImageInputs = Array.from(this.imageInputContainer.children)
            .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];

        if (allImageInputs.length >= 5) {
            new Notice('Maximum of 5 image inputs allowed');
            return;
        }

        const imageInput = this.imageInputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter document path',
            cls: 'llm-image-input'
        });

        // Add input validation
        imageInput.addEventListener('input', () => {
            this.updateAddImageButtonVisibility();
            this.validateImagePath(imageInput);
        });

        // Handle Enter key
        imageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const path = imageInput.value.trim();
                if (path) {
                    // Mark this input as having an image and create a new one if needed
                    imageInput.classList.add('has-image');
                    this.validateImagePath(imageInput);

                    // Create a new input field for the next image (if under limit)
                    this.addImageInput();

                    this.updateAddImageButtonVisibility();
                    this.renderImagePreviews();
                    new Notice('Image path added');
                }
            }
        });

        this.updateAddImageButtonVisibility();
    }

    private updateAddImageButtonVisibility() {
        const allImageInputs = Array.from(this.imageInputContainer?.children || [])
            .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];
        const totalInputs = allImageInputs.length;

        if (this.addImageButton) {
            // Show button if we have less than 5 inputs total
            this.addImageButton.style.display = totalInputs < 5 ? 'block' : 'none';
        }
    }

    private handlePromptInput(e: InputEvent) {
        const target = e.target as HTMLTextAreaElement;
        const cursorPosition = target.selectionStart;
        const textBeforeCursor = target.value.substring(0, cursorPosition);

        if (textBeforeCursor.endsWith('@')) {
            this.showCommandDropdown();
        } else {
            this.hideCommandDropdown();
        }
    }

    private handlePromptKeydown(e: KeyboardEvent) {
        if (!this.dropdown) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            // Handle selection navigation
        } else if (e.key === 'Enter' && this.dropdown.style.display !== 'none') {
            e.preventDefault();
            const selected = this.dropdown.querySelector('.selected');
            if (selected) {
                this.insertCommand(selected.textContent || '');
            }
        } else if (e.key === 'Escape') {
            this.hideCommandDropdown();
        }
    }

    private showCommandDropdown() {
        if (!this.dropdown) {
            this.dropdown = document.createElement('div');
            this.dropdown.className = 'llm-command-dropdown';
            this.promptInput.parentElement?.appendChild(this.dropdown);
        }

        this.dropdown.style.display = 'block';
        this.dropdown.style.top = `${this.promptInput.offsetTop - this.dropdown.offsetHeight}px`;
        this.dropdown.style.left = `${this.promptInput.offsetLeft}px`;

        this.dropdown.innerHTML = '';
        this.commands.forEach(cmd => {
            const option = document.createElement('div');
            option.className = 'llm-command-option';
            option.textContent = `${cmd.name} - ${cmd.description}`;
            option.onclick = () => this.insertCommand(cmd.name);
            this.dropdown!.appendChild(option);
        });
    }

    private hideCommandDropdown() {
        if (this.dropdown) {
            this.dropdown.style.display = 'none';
        }
    }

    private insertCommand(command: string) {
        const cursorPosition = this.promptInput.selectionStart;
        const textBeforeCursor = this.promptInput.value.substring(0, cursorPosition - 1); // Remove @
        const textAfterCursor = this.promptInput.value.substring(cursorPosition);

        this.promptInput.value = textBeforeCursor + command + ' ' + textAfterCursor;
        this.hideCommandDropdown();
        this.promptInput.focus();
    }

    private handleDroppedFiles(files: FileList) {
        // Dispatch event for parent to handle
        const event = new CustomEvent('llm-files-dropped', {
            detail: { files }
        });
        this.container.dispatchEvent(event);
    }

    public addImage(imagePath: string) {
        this.attachedImages.push(imagePath);
        this.renderImagePreviews();
    }

    public getImages(): string[] {
        // Get all images from both sources - manually entered paths and drag-dropped images
        const manualImagePaths = Array.from(this.imageInputContainer?.children || [])
            .filter(el => el.tagName === 'INPUT')
            .map(input => (input as HTMLInputElement).value)
            .filter(path => path.trim() !== '');

        // Combine with drag-dropped images
        return [...this.attachedImages, ...manualImagePaths];
    }

    public clearImages() {
        this.attachedImages = [];

        // Clear all image input fields
        if (this.imageInputContainer) {
            const allImageInputs = Array.from(this.imageInputContainer.children)
                .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];
            allImageInputs.forEach(input => {
                input.value = '';
                input.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');
            });
        }

        this.renderImagePreviews();
        this.updateAddImageButtonVisibility();
    }

    private renderImagePreviews() {
        this.imagePreviewContainer.empty();

        // Render drag-dropped images
        this.attachedImages.forEach((imagePath, index) => {
            const wrapper = this.imagePreviewContainer.createDiv({ cls: 'llm-image-preview-wrapper' });

            // Create thumbnail
            const img = wrapper.createEl('img', { cls: 'llm-image-thumbnail' });
            if (imagePath.startsWith('data:')) {
                img.src = imagePath;
            } else {
                // For file paths, use a placeholder icon
                img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
            }

            // Add path label
            const label = wrapper.createDiv({ cls: 'llm-image-label' });
            label.textContent = imagePath.length > 30 ? '...' + imagePath.slice(-30) : imagePath;

            // Create delete button
            const deleteBtn = wrapper.createEl('button', { cls: 'llm-image-delete-btn' });
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = () => {
                this.attachedImages.splice(index, 1);
                this.renderImagePreviews();
                this.updateAddImageButtonVisibility();
            };
        });

        // Render manually entered image paths from input fields
        const allImageInputs = Array.from(this.imageInputContainer?.children || [])
            .filter(el => el.tagName === 'INPUT') as HTMLInputElement[];
        const filledInputs = allImageInputs.filter(input => input.value.trim() !== '');

        filledInputs.forEach((input, index) => {
            const imagePath = input.value.trim();
            const wrapper = this.imagePreviewContainer.createDiv({ cls: 'llm-image-preview-wrapper manual-path' });

            // Create icon for manual paths
            const icon = wrapper.createEl('div', { cls: 'llm-manual-path-icon' });
            icon.innerHTML = '📄'; // Document icon

            // Add path label
            const label = wrapper.createDiv({ cls: 'llm-image-label' });
            label.textContent = imagePath.length > 30 ? '...' + imagePath.slice(-30) : imagePath;

            // Create delete button
            const deleteBtn = wrapper.createEl('button', { cls: 'llm-image-delete-btn' });
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = () => {
                // Clear the input field and remove styling
                input.value = '';
                input.classList.remove('has-image', 'data-url-image', 'path-image', 'invalid-image');
                this.renderImagePreviews();
                this.updateAddImageButtonVisibility();
            };
        });

        // Show/hide the container based on whether there are images
        const totalImages = this.attachedImages.length + filledInputs.length;
        if (totalImages > 0) {
            this.imagePreviewContainer.style.display = 'flex';
        } else {
            this.imagePreviewContainer.style.display = 'none';
        }
    }

    private handleSendMessage() {
        const prompt = this.promptInput.value.trim();
        if (!prompt) {
            new Notice('Please enter a message');
            return;
        }

        this.onSendMessage();
    }

    // Public methods
    setCommands(commands: Command[]) {
        this.commands = commands;
    }

    clearInputs() {
        this.promptInput.value = '';
        this.patternInput.value = '';
        this.clearImages();
    }

    setConversationId(id: string) {
        this.conversationIdInput.value = id;
    }

    clearConversationId() {
        this.conversationIdInput.value = '';
    }

    getPromptValue(): string {
        return this.promptInput.value;
    }

    setPromptValue(value: string) {
        this.promptInput.value = value;
    }

    focus() {
        this.promptInput.focus();
    }

    setLoading(loading: boolean) {
        this.sendButton.disabled = loading;
        this.promptInput.disabled = loading;

        if (loading) {
            this.sendButton.innerHTML = 'Sending...';
        } else {
            this.sendButton.innerHTML = SendIcon;
        }
    }

    setDefaultModel(model: string) {
        if (!this.modelInput.value) {
            this.modelInput.value = model;
        }
    }

    getModelValue(): string {
        return this.modelInput.value;
    }

    getPatternValue(): string {
        return this.patternInput.value;
    }

    setPatternValue(value: string) {
        this.patternInput.value = value;
    }

    getConversationId(): string {
        return this.conversationIdInput.value;
    }
}
