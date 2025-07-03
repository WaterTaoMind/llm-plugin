/**
 * Base Node class following PocketFlow TypeScript SDK patterns
 * Provides built-in retry logic with exponential backoff
 * Eliminates need for external PocketFlow dependency
 */
export abstract class BaseNode<SharedState> {
    protected maxRetries: number;
    protected waitTime: number; // Base wait time in seconds

    constructor(maxRetries: number = 3, waitTime: number = 1) {
        this.maxRetries = maxRetries;
        this.waitTime = waitTime;
    }

    /**
     * Prepare data for execution
     * Override this method in subclasses
     */
    abstract prep(shared: SharedState): Promise<any>;

    /**
     * Core execution logic
     * Override this method in subclasses
     * This method will be automatically retried on failure
     */
    abstract exec(prepData: any): Promise<any>;

    /**
     * Post-processing and state updates
     * Override this method in subclasses
     */
    abstract post(shared: SharedState, prepData: any, execResult: any): Promise<string | undefined>;

    /**
     * Fallback method when all retries fail
     * Override this method in subclasses for custom fallback logic
     */
    execFallback?(prepData: any, error: Error): any;

    /**
     * Run the node with built-in retry logic
     * Follows PocketFlow prep/exec/post pattern
     */
    async run(shared: SharedState): Promise<string | undefined> {
        let prepData: any;
        
        try {
            // Step 1: Prepare data
            prepData = await this.prep(shared);
            
            // Step 2: Execute with retry logic
            const execResult = await this.execWithRetry(prepData);
            
            // Step 3: Post-processing
            return await this.post(shared, prepData, execResult);
            
        } catch (error) {
            // Use fallback if available
            if (this.execFallback) {
                console.log(`🔄 Using fallback for ${this.constructor.name}`);
                const fallbackResult = this.execFallback(prepData, error as Error);
                return await this.post(shared, prepData, fallbackResult);
            } else {
                throw error;
            }
        }
    }

    /**
     * Execute with automatic retry and exponential backoff
     * Following PocketFlow retry patterns
     */
    private async execWithRetry(prepData: any): Promise<any> {
        let lastError: Error | undefined;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this.exec(prepData);
            } catch (error) {
                lastError = error as Error;
                console.warn(`⚠️ ${this.constructor.name}: Attempt ${attempt}/${this.maxRetries} failed:`, error);
                
                // Don't wait after the last attempt
                if (attempt < this.maxRetries) {
                    const waitTime = this.calculateBackoffTime(attempt);
                    console.log(`⏳ Waiting ${waitTime}s before retry...`);
                    await this.sleep(waitTime * 1000);
                }
            }
        }
        
        // All attempts failed
        throw lastError || new Error(`All attempts failed for ${this.constructor.name}`);
    }

    /**
     * Calculate exponential backoff time with jitter
     * Following best practices for retry mechanisms
     */
    private calculateBackoffTime(attempt: number): number {
        // Exponential backoff: waitTime * 2^(attempt-1)
        const exponentialTime = this.waitTime * Math.pow(2, attempt - 1);
        
        // Add jitter (±25% random variation)
        const jitter = 0.75 + (Math.random() * 0.5); // 0.75 to 1.25
        const waitTime = exponentialTime * jitter;
        
        // Cap at reasonable maximum (30 seconds)
        return Math.min(waitTime, 30);
    }

    /**
     * Sleep utility function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Type alias for compatibility with PocketFlow patterns
 */
export const Node = BaseNode;