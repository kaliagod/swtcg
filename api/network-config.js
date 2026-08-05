import { createPublicNetworkConfig } from
    "../server/network/createPublicNetworkConfig.js";

export default function handler(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({
            error: {
                code: "METHOD_NOT_ALLOWED",
                message: "GETメソッドを使用してください。"
            }
        });
        return;
    }
    try {
        response.status(200).json(createPublicNetworkConfig());
    } catch (error) {
        response.status(500).json({
            error: {
                code: "INVALID_NETWORK_CONFIG",
                message: error.message
            }
        });
    }
}
