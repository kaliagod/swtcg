import SelectionTypes from "../constants/SelectionTypes.js";
import { freezeSerializable } from "../utils/Serializable.js";

export default class SelectionRequest {
    constructor({
        id,
        type,
        playerId,
        prompt,
        candidates,
        min = 1,
        max = 1,
        context = {}
    }) {
        if (typeof id !== "string" || id.length === 0) {
            throw new Error(
                "SelectionRequest: idを指定してください。"
            );
        }

        if (!Object.values(SelectionTypes).includes(type)) {
            throw new Error(
                `SelectionRequest: 未対応のtypeです。value=${type}`
            );
        }

        if (playerId === null || playerId === undefined) {
            throw new Error(
                "SelectionRequest: playerIdを指定してください。"
            );
        }

        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error(
                "SelectionRequest: candidatesには1件以上の候補を指定してください。"
            );
        }

        if (
            !Number.isInteger(min) ||
            !Number.isInteger(max) ||
            min < 0 ||
            max < min ||
            max > candidates.length
        ) {
            throw new Error(
                "SelectionRequest: minとmaxの範囲が不正です。"
            );
        }

        const candidateIds = candidates.map(
            candidate => candidate.id
        );
        const uniqueIds = new Set(
            candidateIds.map(id => `${typeof id}:${String(id)}`)
        );

        if (
            candidateIds.some(id => id === null || id === undefined) ||
            uniqueIds.size !== candidateIds.length
        ) {
            throw new Error(
                "SelectionRequest: 候補IDは重複しない値である必要があります。"
            );
        }

        this.id = id;
        this.type = type;
        this.playerId = playerId;
        this.prompt = String(prompt ?? "選択してください。");
        this.candidates = freezeSerializable(
            candidates,
            "SelectionRequest.candidates"
        );
        this.min = min;
        this.max = max;
        this.context = freezeSerializable(
            context,
            "SelectionRequest.context"
        );

        Object.freeze(this);
    }
}
