import { Node } from "pocketflow";
import { GoogleGenAI, SafetyFilterLevel } from "@google/genai";
import { 
    AgentSharedState, 
    GeneratedImage, 
    ImageGenerationConfig,
    AgentProgressEvent 
} from '../types';

/**
 * Interface for image generation request data
 */
interface ImageGenerationRequest {
    prompt: string;
    config: ImageGenerationConfig;
}

/**
 * PocketFlow Node for Gemini image generation using official Google GenAI SDK
 * Uses the official SDK for better compatibility and reliability
 */
export class GeminiImageGenerationLightNode extends Node<AgentSharedState> {
    private geminiClient: GoogleGenAI;

    constructor(
        private apiKey: string,
        maxRetries: number = 3,
        waitTime: number = 2
    ) {
        super(maxRetries, waitTime);
        this.geminiClient = new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * Preparation phase: Extract image generation parameters from shared state
     */
    async prep(shared: AgentSharedState): Promise<ImageGenerationRequest> {
        console.log('🎨 GeminiImageGenerationLightNode: Preparing image generation request');
        
        // Extract image prompt from user request or current context
        const prompt = this.extractImagePrompt(shared);
        
        // Get configuration with sensible defaults optimized for quality
        const config: ImageGenerationConfig = {
            aspectRatio: shared.imageConfig?.aspectRatio || '16:9', // Better for landscapes
            numberOfImages: shared.imageConfig?.numberOfImages || 1,
            safetyFilterLevel: shared.imageConfig?.safetyFilterLevel || 'BLOCK_MEDIUM_AND_ABOVE'
        };

        // Emit progress event
        this.emitProgress(shared, 'action_start', {
            action: 'generate_image',
            tool: 'generate_images',
            server: 'gemini-sdk',
            justification: 'Generating visual content using Gemini image generation API',
            prompt: this.truncateText(prompt, 100),
            config: config
        });

        return { prompt, config };
    }

    /**
     * Execution phase: Call Gemini API to generate images using official SDK
     */
    async exec(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
        console.log('🔧 GeminiImageGenerationLightNode: Executing image generation (Official SDK)');
        console.log(`📝 Prompt: ${this.truncateText(request.prompt, 200)}`);
        console.log(`⚙️ Config:`, request.config);

        if (!this.apiKey) {
            throw new Error('Gemini API key is required for image generation');
        }

        try {
            // Use the official Google GenAI SDK as per documentation
            const response = await this.geminiClient.models.generateContent({
                model: 'gemini-2.0-flash-preview-image-generation',
                contents: [{ parts: [{ text: request.prompt }] }],
                config: {
                    responseModalities: ['TEXT', 'IMAGE']
                }
            });
            const generatedImages: GeneratedImage[] = [];
            
            if (response.candidates) {
                for (const [candidateIndex, candidate] of response.candidates.entries()) {
                    if (candidate.content?.parts) {
                        for (const [partIndex, part] of candidate.content.parts.entries()) {
                            if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
                                const generatedImage: GeneratedImage = {
                                    id: `gemini-img-sdk-${Date.now()}-${candidateIndex}-${partIndex}`,
                                    prompt: request.prompt,
                                    imageBytes: part.inlineData.data,
                                    format: part.inlineData.mimeType,
                                    aspectRatio: request.config.aspectRatio || '1:1',
                                    safetyFiltered: candidate.finishReason === 'SAFETY',
                                    safetyReason: candidate.finishReason === 'SAFETY' ? 'Content filtered by safety settings' : undefined,
                                    generatedAt: Date.now()
                                };
                                generatedImages.push(generatedImage);
                            }
                        }
                    }
                }
            }

            console.log(`✅ Generated ${generatedImages.length} images using official SDK`);
            return generatedImages;

        } catch (error) {
            console.error('❌ Image generation failed:', error);
            throw new Error(`Gemini image generation failed: ${error.message}`);
        }
    }

    /**
     * Post-processing phase: Update shared state and determine next action
     */
    async post(
        shared: AgentSharedState,
        request: ImageGenerationRequest,
        images: GeneratedImage[]
    ): Promise<string | undefined> {
        console.log('📋 GeminiImageGenerationLightNode: Post-processing results');

        // Update shared state with generated images
        if (!shared.generatedImages) {
            shared.generatedImages = [];
        }
        shared.generatedImages.push(...images);

        // Add to action history for agent reference
        const actionResult = {
            step: shared.currentStep || 0,
            stepType: 'action' as const,
            server: 'gemini-sdk',
            tool: 'generate_images',
            parameters: {
                prompt: request.prompt,
                aspectRatio: request.config.aspectRatio,
                numberOfImages: request.config.numberOfImages
            },
            result: this.formatImageResults(images),
            justification: 'Generated visual content using Gemini official SDK',
            success: images.length > 0,
            historyId: `gemini-img-sdk-${Date.now()}`
        };

        if (!shared.actionHistory) {
            shared.actionHistory = [];
        }
        shared.actionHistory.push(actionResult);

        // Emit completion progress
        this.emitProgress(shared, 'action_complete', {
            action: 'generate_image',
            tool: 'generate_images',
            server: 'gemini-sdk',
            success: images.length > 0,
            result: this.formatImageResults(images),
            imageCount: images.length,
            safetyFiltered: images.filter(img => img.safetyFiltered).length
        });

        // Determine next action based on results
        if (images.length === 0) {
            console.log('⚠️ No images generated - this may indicate safety filtering');
            return undefined; // End workflow if no images generated
        }

        console.log(`🎉 Successfully generated ${images.length} image(s) via REST API`);
        return 'default'; // Continue to next step in workflow
    }

    /**
     * Fallback method when generation fails after all retries
     */
    async execFallback(
        request: ImageGenerationRequest, 
        error: Error
    ): Promise<GeneratedImage[]> {
        console.log('🔄 Using image generation fallback (REST API)...');
        
        // Try with a simpler, more generic prompt
        const simplePrompt = this.simplifyPrompt(request.prompt);
        console.log(`📝 Fallback prompt: ${simplePrompt}`);

        try {
            const response = await this.geminiClient.models.generateContent({
                model: 'gemini-2.0-flash-preview-image-generation',
                contents: [{ parts: [{ text: simplePrompt }] }],
                config: {
                    responseModalities: ['TEXT', 'IMAGE']
                }
            });

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
                        return [{
                            id: `gemini-img-sdk-fallback-${Date.now()}`,
                            prompt: simplePrompt,
                            imageBytes: part.inlineData.data,
                            format: part.inlineData.mimeType,
                            aspectRatio: '1:1',
                            safetyFiltered: false,
                            generatedAt: Date.now()
                        }];
                    }
                }
            }
        } catch (fallbackError) {
            console.error('❌ Fallback generation also failed:', fallbackError);
        }

        // Return empty array if fallback fails
        return [];
    }

    /**
     * Extract image generation prompt from user request and context
     */
    private extractImagePrompt(shared: AgentSharedState): string {
        // Check if there's a specific image prompt set
        if (shared.currentImagePrompt) {
            return this.enhancePromptQuality(shared.currentImagePrompt);
        }

        // Extract from user request
        const userRequest = shared.userRequest || '';
        
        // Look for explicit image generation requests
        const imageKeywords = [
            'generate image', 'create image', 'draw', 'illustrate', 
            'diagram', 'chart', 'visualization', 'picture', 'graphic'
        ];
        
        let extractedPrompt = userRequest;
        
        if (imageKeywords.some(keyword => userRequest.toLowerCase().includes(keyword))) {
            // Remove the trigger words and return the descriptive part
            extractedPrompt = userRequest
                .replace(/(?:generate|create|draw|make|show me)?\s*(?:an?|the)?\s*(?:image|picture|diagram|chart|visualization|graphic)\s*(?:of|showing|that shows|about)?\s*/gi, '')
                .trim() || userRequest;
        }

        // Enhance the prompt for better quality
        return this.enhancePromptQuality(extractedPrompt);
    }

    /**
     * Enhance prompt with quality modifiers for better image generation
     */
    private enhancePromptQuality(basePrompt: string): string {
        // Don't enhance if already contains quality keywords
        const hasQualityKeywords = /(?:photorealistic|high resolution|professional|detailed|sharp|8k|4k|masterpiece)/i.test(basePrompt);
        if (hasQualityKeywords) {
            return basePrompt;
        }

        // Quality enhancement prefixes and suffixes
        const qualityEnhancers = [
            "A photorealistic, highly detailed",
            "Professional photography of",
            "High-resolution, sharp focus image of"
        ];

        const qualitySuffixes = [
            "Professional photography, sharp focus, vibrant colors, high resolution",
            "Photorealistic, detailed, award-winning photography style",
            "High quality, dramatic lighting, vivid colors, sharp details"
        ];

        // Choose enhancer based on content type
        let enhancedPrompt = basePrompt;
        
        if (/(?:sunset|sunrise|landscape|mountain|nature|scenery)/i.test(basePrompt)) {
            enhancedPrompt = `${qualityEnhancers[1]} ${basePrompt.toLowerCase()}. ${qualitySuffixes[0]}, landscape photography, golden hour lighting.`;
        } else if (/(?:portrait|person|face|people)/i.test(basePrompt)) {
            enhancedPrompt = `${qualityEnhancers[0]} ${basePrompt.toLowerCase()}. ${qualitySuffixes[1]}, portrait photography.`;
        } else {
            enhancedPrompt = `${qualityEnhancers[2]} ${basePrompt.toLowerCase()}. ${qualitySuffixes[2]}.`;
        }

        console.log(`🎨 Enhanced prompt: "${basePrompt}" → "${enhancedPrompt}"`);
        return enhancedPrompt;
    }

    /**
     * Simplify prompt for fallback generation
     */
    private simplifyPrompt(originalPrompt: string): string {
        // Remove complex descriptors and keep core subject
        return originalPrompt
            .replace(/\b(very|extremely|highly|incredibly|amazingly)\s+/gi, '')
            .replace(/\b(detailed|intricate|complex|sophisticated)\s+/gi, '')
            .split(/[.,!?]/)[0] // Take first sentence/clause
            .trim()
            .substring(0, 100); // Limit length
    }

    /**
     * Format image generation results for action history
     */
    private formatImageResults(images: GeneratedImage[]): string {
        const successCount = images.filter(img => !img.safetyFiltered).length;
        const filteredCount = images.filter(img => img.safetyFiltered).length;
        
        let result = `Generated ${images.length} image(s)`;
        
        if (filteredCount > 0) {
            result += ` (${filteredCount} filtered by safety)`;
        }
        
        if (images.length > 0) {
            result += `. Image IDs: ${images.map(img => img.id).join(', ')}`;
        }
        
        return result;
    }

    /**
     * Emit progress event to callback if available
     */
    private emitProgress(
        shared: AgentSharedState, 
        type: AgentProgressEvent['type'], 
        data: any
    ): void {
        if (shared.progressCallback) {
            shared.progressCallback({
                type,
                step: shared.currentStep || 0,
                data,
                timestamp: Date.now()
            });
        }
    }


    /**
     * Truncate text for progress display
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}