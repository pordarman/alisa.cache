/**
 * Custom error class for AlisaCache errors.
 * Provides clearer and more specific error messages for cache-related issues.
 */
class CacheError extends Error {
    /**
     * @param {string} message - Error message
     */
    constructor(message) {
        super(`[AlisaCache] ${message}`);
        this.name = "CacheError";
    }
}

export default CacheError;
