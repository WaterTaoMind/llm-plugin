import { App, Notice } from 'obsidian';
import { FileWithPath, ImageProcessingResult } from '../core/types';

const SCREENSHOT_FOLDER = "llm_screenshots";

export class ImageService {
    constructor(private app: App) {}

    async processDroppedFiles(files: FileList): Promise<string[]> {
        const processedImages: string[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i] as FileWithPath;
            if (file.type.startsWith('image/')) {
                try {
                    const filePath = await this.saveScreenshotToVault(file);
                    if (filePath) {
                        processedImages.push(filePath);
                    }
                } catch (error) {
                    console.error('Failed to process screenshot:', error);
                    // Fallback to data URL
                    const dataUrl = await this.fileToDataUrl(file);
                    if (dataUrl) {
                        processedImages.push(dataUrl);
                    }
                }
            }
        }
        
        return processedImages;
    }

    validateImagePath(path: string): ImageProcessingResult {
        const trimmedPath = path.trim();
        
        if (!trimmedPath) {
            return { path: trimmedPath, isDataUrl: false, isValid: false };
        }

        if (trimmedPath.startsWith('data:image/')) {
            return { path: trimmedPath, isDataUrl: true, isValid: true };
        }

        if (trimmedPath.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
            return { path: trimmedPath, isDataUrl: false, isValid: true };
        }

        return { path: trimmedPath, isDataUrl: false, isValid: false };
    }

    async saveScreenshotToVault(file: FileWithPath): Promise<string | null> {
        try {
            // Create screenshot folder if it doesn't exist
            const folderPath = SCREENSHOT_FOLDER;
            const adapter = this.app.vault.adapter;
            
            if (!(await adapter.exists(folderPath))) {
                await this.app.vault.createFolder(folderPath);
            }
            
            // Create filename
            const extension = file.name?.split('.').pop() || 'png';
            const timestamp = Date.now();
            const filename = `screenshot_${timestamp}.${extension}`;
            const relativePath = `${folderPath}/${filename}`;
            
            // Save file
            const arrayBuffer = await this.fileToArrayBuffer(file);
            const binary = new Uint8Array(arrayBuffer);
            await this.app.vault.createBinary(relativePath, binary);
            
            // Try to get absolute path
            let absolutePath = relativePath;
            try {
                // @ts-ignore - Some adapters have getBasePath
                const basePath = this.app.vault.adapter.getBasePath?.();
                if (basePath) {
                    absolutePath = `${basePath}/${relativePath}`;
                }
            } catch (error) {
                console.warn('Could not get absolute path, using relative path instead:', error);
            }
            
            return absolutePath;
        } catch (error) {
            console.error('Failed to save screenshot to vault:', error);
            new Notice('Failed to save screenshot to vault');
            return null;
        }
    }

    async cleanupScreenshots(paths: string[]): Promise<void> {
        for (const path of paths) {
            try {
                if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
                    // Extract filename from absolute path
                    const filename = path.split('/').pop();
                    if (filename) {
                        const relativePath = `${SCREENSHOT_FOLDER}/${filename}`;
                        if (await this.app.vault.adapter.exists(relativePath)) {
                            await this.app.vault.adapter.remove(relativePath);
                        }
                    }
                } else if (path.startsWith(SCREENSHOT_FOLDER) && 
                          await this.app.vault.adapter.exists(path)) {
                    await this.app.vault.adapter.remove(path);
                }
            } catch (error) {
                console.error(`Failed to remove temporary screenshot: ${path}`, error);
            }
        }
    }

    getScreenshotPaths(images: string[]): string[] {
        return images.filter(path => {
            const isAbsolutePath = path.includes(`/${SCREENSHOT_FOLDER}/`) || 
                                 path.includes(`\\${SCREENSHOT_FOLDER}\\`);
            const isRelativePath = path.startsWith(SCREENSHOT_FOLDER);
            return isAbsolutePath || isRelativePath;
        });
    }

    private async fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    private async fileToDataUrl(file: File): Promise<string | null> {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    }
}
