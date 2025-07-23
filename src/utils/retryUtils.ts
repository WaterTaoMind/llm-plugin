/**
 * Utility functions for robust API calling with exponential backoff and retry logic
 * Shared between Chat mode and Agent mode for consistent error handling
 */

export interface RetryOptions {
    maxRetries?: number;
    baseWaitTime?: number; // Base wait time in milliseconds
    maxWaitTime?: number;  // Maximum wait time in milliseconds
    timeoutMs?: number;    // Request timeout in milliseconds
    retryOnStatus?: number[]; // HTTP status codes to retry on
}

export interface RetryResult<T> {
    success: boolean;
    result?: T;
    error?: Error;
    attempts: number;
    totalTime: number;
}

/**
 * Default retry configuration for LLM API calls
 */
export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseWaitTime: 1000,  // 1 second
    maxWaitTime: 30000,  // 30 seconds
    timeoutMs: 60000,    // 1 minute timeout
    retryOnStatus: [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]
};

/**
 * Calculate exponential backoff time with jitter
 */
export function calculateBackoffTime(attempt: number, baseWaitTime: number, maxWaitTime: number): number {
    // Exponential backoff: baseWaitTime * 2^(attempt-1)
    const exponentialTime = baseWaitTime * Math.pow(2, attempt - 1);
    
    // Add jitter (±25% random variation)
    const jitter = 0.75 + (Math.random() * 0.5); // 0.75 to 1.25
    const waitTime = exponentialTime * jitter;
    
    // Cap at maximum wait time
    return Math.min(waitTime, maxWaitTime);
}

/**
 * Check if an error/status code should trigger a retry
 */
export function shouldRetry(error: any, retryOnStatus: number[]): boolean {
    // Network errors (no response)
    if (!error.response && (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT')) {
        return true;
    }
    
    // HTTP status errors
    if (error.response?.status && retryOnStatus.includes(error.response.status)) {
        return true;
    }
    
    // Fetch API errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
        return true;
    }
    
    return false;
}

/**
 * Sleep utility function
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with exponential backoff retry
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    operationName: string = 'API call'
): Promise<RetryResult<T>> {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    const startTime = Date.now();
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
        try {
            console.log(`🔄 ${operationName}: Attempt ${attempt}/${config.maxRetries + 1}`);
            
            // Create timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Operation timeout after ${config.timeoutMs}ms`)), config.timeoutMs);
            });
            
            // Race between operation and timeout
            const result = await Promise.race([operation(), timeoutPromise]);
            
            const totalTime = Date.now() - startTime;
            console.log(`✅ ${operationName}: Succeeded on attempt ${attempt} (${totalTime}ms total)`);
            
            return {
                success: true,
                result,
                attempts: attempt,
                totalTime
            };
            
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const totalTime = Date.now() - startTime;
            
            console.warn(`⚠️ ${operationName}: Attempt ${attempt} failed:`, lastError.message);
            
            // Don't retry on last attempt
            if (attempt === config.maxRetries + 1) {
                console.error(`❌ ${operationName}: All attempts failed (${totalTime}ms total)`);
                break;
            }
            
            // Check if we should retry this error
            if (!shouldRetry(lastError, config.retryOnStatus)) {
                console.log(`🚫 ${operationName}: Non-retryable error, stopping attempts`);
                return {
                    success: false,
                    error: lastError,
                    attempts: attempt,
                    totalTime
                };
            }
            
            // Calculate and apply backoff
            const waitTime = calculateBackoffTime(attempt, config.baseWaitTime, config.maxWaitTime);
            console.log(`⏳ ${operationName}: Waiting ${Math.round(waitTime)}ms before retry...`);
            await sleep(waitTime);
        }
    }
    
    const totalTime = Date.now() - startTime;
    return {
        success: false,
        error: lastError || new Error('All retry attempts failed'),
        attempts: config.maxRetries + 1,
        totalTime
    };
}

/**
 * Specialized retry function for HTTP fetch operations
 */
export async function withHttpRetry(
    url: string,
    fetchOptions: RequestInit,
    options: Partial<RetryOptions> = {},
    operationName: string = 'HTTP request'
): Promise<RetryResult<Response>> {
    return withRetry(async () => {
        const response = await fetch(url, fetchOptions);
        
        // Check if response status should trigger retry
        if (!response.ok && options.retryOnStatus?.includes(response.status)) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            (error as any).response = { status: response.status };
            throw error;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
    }, options, operationName);
}

/**
 * Enhanced error handling for LLM operations
 */
export function createLLMError(originalError: any, context: string): Error {
    let message = `${context} failed`;
    
    if (originalError?.response?.status) {
        message += ` (HTTP ${originalError.response.status})`;
    }
    
    if (originalError?.message) {
        message += `: ${originalError.message}`;
    }
    
    const error = new Error(message);
    // Store original error in a property that's compatible with older TypeScript
    (error as any).originalError = originalError;
    return error;
}