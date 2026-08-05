function firstNonEmpty(...values) {
    return values.find(value =>
        typeof value === "string" && value.trim().length > 0
    );
}

export default function resolveUpstashConnection(
    environment = process.env
) {
    return {
        url: firstNonEmpty(
            environment.UPSTASH_REDIS_REST_URL,
            environment.KV_REST_API_URL
        ),
        token: firstNonEmpty(
            environment.UPSTASH_REDIS_REST_TOKEN,
            environment.KV_REST_API_TOKEN
        )
    };
}
