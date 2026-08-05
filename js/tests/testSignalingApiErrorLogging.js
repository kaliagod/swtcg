import assert from "node:assert/strict";

import signalingHandler from "../../api/signaling.js";
import {
    logSignalingFailure
} from "../../server/signaling/signalingErrors.js";
import {
    createErrorResponse
} from "../../server/signaling/signalingHttp.js";

const secret = "SECRET_VALUE_THAT_MUST_NOT_APPEAR";
const sessionToken = "SESSION_TOKEN_THAT_MUST_NOT_APPEAR";
const logged = [];
const diagnosticError = new Error(
    `request failed with Bearer ${secret} sessionToken=${sessionToken}`
);
diagnosticError.name = "UpstashRestError";
diagnosticError.code = "UPSTASH_REST_ERROR";
diagnosticError.statusCode = 503;
diagnosticError.failureStage = "room-save";
diagnosticError.upstashHttpStatus = 401;
diagnosticError.upstashErrorType = "WRONGPASS";
diagnosticError.upstashResponseSummary = {
    payloadType: "object",
    hasError: true,
    hasResult: false,
    errorFields: []
};

const entry = logSignalingFailure(diagnosticError, {
    action: "CREATE",
    sensitiveValues: [secret, sessionToken],
    logger: (...args) => logged.push(args)
});
assert.equal(logged.length, 1);
assert.equal(logged[0][0], "[signaling] request failed");
assert.equal(entry.errorName, "UpstashRestError");
assert.equal(entry.errorCode, "UPSTASH_REST_ERROR");
assert.equal(entry.signalingAction, "CREATE");
assert.equal(entry.upstashHttpStatus, 401);
assert.equal(entry.upstashErrorType, "WRONGPASS");
assert.equal(entry.failureStage, "room-save");
const serializedEntry = JSON.stringify(entry);
assert.equal(serializedEntry.includes(secret), false);
assert.equal(serializedEntry.includes(sessionToken), false);
assert.equal(serializedEntry.includes("Authorization"), false);

assert.deepEqual(createErrorResponse(diagnosticError), {
    statusCode: 500,
    body: {
        error: {
            code: "INTERNAL_ERROR",
            message: "シグナリング処理に失敗しました。"
        }
    }
});

const environmentNames = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "SIGNALING_SECRET"
];
const previousEnvironment = Object.fromEntries(
    environmentNames.map(name => [name, process.env[name]])
);
process.env.KV_REST_API_URL = "https://redis.example.test";
process.env.KV_REST_API_TOKEN = secret;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.SIGNALING_SECRET;

const apiLogs = [];
const originalConsoleError = console.error;
console.error = (...args) => apiLogs.push(args);
const response = {
    statusCode: null,
    payload: null,
    headers: {},
    setHeader(name, value) {
        this.headers[name] = value;
    },
    status(statusCode) {
        this.statusCode = statusCode;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
};
try {
    await signalingHandler({
        method: "POST",
        headers: {},
        body: { action: "CREATE", offer: {} },
        socket: { remoteAddress: "127.0.0.1" }
    }, response);
} finally {
    console.error = originalConsoleError;
    for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
}

assert.equal(response.statusCode, 500);
assert.equal(response.payload.error.code, "INTERNAL_ERROR");
assert.equal(apiLogs.length, 1);
assert.equal(apiLogs[0][0], "[signaling] request failed");
assert.equal(apiLogs[0][1].signalingAction, "CREATE");
assert.equal(apiLogs[0][1].failureStage, "environment-validation");
assert.equal(apiLogs[0][1].errorCode, "SIGNALING_SECRET_INVALID");
assert.equal(JSON.stringify(apiLogs).includes(secret), false);

console.log("Signaling API error logging tests: OK");
