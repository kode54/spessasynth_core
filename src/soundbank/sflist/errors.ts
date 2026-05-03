/**
 * Base error class for SFList-related errors.
 */
export class SFListError extends Error {
    public constructor(message: string) {
        super(`SFList Error: ${message}`);
        this.name = "SFListError";
    }
}

/**
 * Error thrown when SFList parsing fails.
 */
export class SFListParseError extends SFListError {
    public constructor(message: string, line?: number, column?: number) {
        const fullMessage =
            line === undefined
                ? message
                : `Line ${line}${column === undefined ? "" : `:${column}`}: ${message}`;
        super(fullMessage);
        this.name = "SFListParseError";
    }
}

/**
 * Error thrown when SFList JSON validation fails.
 */
export class SFListValidationError extends SFListError {
    public constructor(message: string, path?: string) {
        const fullMessage =
            path === undefined ? message : `At ${path}: ${message}`;
        super(fullMessage);
        this.name = "SFListValidationError";
    }
}

/**
 * Error thrown when SFList processing fails (e.g., loading referenced files).
 */
export class SFListProcessingError extends SFListError {
    public constructor(message: string, fileName?: string, cause?: Error) {
        let fullMessage = message;
        if (fileName !== undefined) {
            fullMessage = `File '${fileName}': ${message}`;
        }
        if (cause !== undefined) {
            fullMessage += ` (Caused by: ${cause.message})`;
        }
        super(fullMessage);
        this.name = "SFListProcessingError";
    }
}
