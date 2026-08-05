const SAFE_ERROR_TYPE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SAFE_ERROR_FIELDS = new Set([
    "type",
    "code",
    "name",
    "message",
    "status"
]);

function normalizeLogValue(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function redactText(value, sensitiveValues = []) {
    let text = String(value ?? "");
    for (const sensitiveValue of sensitiveValues) {
        const secret = String(sensitiveValue ?? "");
        if (secret.length >= 4) {
            text = text.split(secret).join("[REDACTED]");
        }
    }
    return text
        .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
        .replace(
            /((?:host|guest|session)[_-]?token\s*[:=]\s*)[^\s,;]+/gi,
            "$1[REDACTED]"
        );
}

export function annotateFailureStage(error, failureStage) {
    const failure = error instanceof Error
        ? error
        : new Error("Unknown signaling failure", { cause: error });
    if (!failure.failureStage) {
        failure.failureStage = failureStage;
    }
    return failure;
}

export function extractUpstashErrorType(value) {
    const candidates = value && typeof value === "object"
        ? [value.type, value.code, value.name]
        : [String(value ?? "").trim().split(/[\s:]/, 1)[0]];
    const candidate = candidates.find(item =>
        SAFE_ERROR_TYPE.test(String(item ?? ""))
    );
    return candidate ? String(candidate) : "UPSTASH_ERROR";
}

export function summarizeUpstashPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {
            payloadType: Array.isArray(payload) ? "array" : typeof payload,
            hasError: false,
            hasResult: false,
            errorFields: []
        };
    }
    const errorValue = payload.error;
    return {
        payloadType: "object",
        hasError: Object.hasOwn(payload, "error"),
        hasResult: Object.hasOwn(payload, "result"),
        errorFields: errorValue && typeof errorValue === "object"
            ? Object.keys(errorValue)
                .filter(key => SAFE_ERROR_FIELDS.has(key))
                .slice(0, 12)
            : []
    };
}

export class UpstashRestError extends Error {
    constructor({
        cause = null,
        failureStage = "upstash-request",
        httpStatus = null,
        errorType = "UPSTASH_ERROR",
        responseSummary = null
    } = {}) {
        super("Upstash REST API request failed", cause ? { cause } : {});
        this.name = "UpstashRestError";
        this.code = "UPSTASH_REST_ERROR";
        this.statusCode = 503;
        this.failureStage = failureStage;
        this.upstashHttpStatus = Number.isInteger(httpStatus)
            ? httpStatus
            : null;
        this.upstashErrorType = extractUpstashErrorType(errorType);
        this.upstashResponseSummary = responseSummary;
    }
}

export function logSignalingFailure(error, {
    action = "UNKNOWN",
    failureStage = "unknown",
    sensitiveValues = [],
    logger = console.error
} = {}) {
    const failure = error instanceof Error
        ? error
        : new Error("Unknown signaling failure");
    const entry = {
        event: "signaling-error",
        errorName: redactText(
            normalizeLogValue(failure.name, "Error"),
            sensitiveValues
        ),
        errorMessage: redactText(
            normalizeLogValue(failure.message, "Unknown signaling failure"),
            sensitiveValues
        ),
        errorCode: redactText(
            normalizeLogValue(failure.code, "UNCLASSIFIED_ERROR"),
            sensitiveValues
        ),
        stack: redactText(
            normalizeLogValue(failure.stack, "Stack unavailable"),
            sensitiveValues
        ),
        signalingAction: /^[A-Z_]{1,32}$/.test(action)
            ? action
            : "UNKNOWN",
        upstashHttpStatus: Number.isInteger(failure.upstashHttpStatus)
            ? failure.upstashHttpStatus
            : null,
        upstashErrorType: failure.upstashErrorType
            ? redactText(failure.upstashErrorType, sensitiveValues)
            : null,
        failureStage: failure.failureStage ?? failureStage,
        ...(failure.upstashResponseSummary
            ? { upstashResponseSummary: failure.upstashResponseSummary }
            : {})
    };
    logger("[signaling] request failed", entry);
    return entry;
}
