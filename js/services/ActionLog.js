import { freezeSerializable } from "../utils/Serializable.js";

export default class ActionLog {
    constructor() {
        this.records = [];
        this.nextSequence = 1;
    }

    append({
        type,
        playerId = null,
        payload = {},
        result = null
    }) {
        if (typeof type !== "string" || type.length === 0) {
            throw new Error(
                "ActionLog.append(): typeを指定してください。"
            );
        }

        const record = freezeSerializable({
            sequence: this.nextSequence,
            type,
            playerId,
            payload,
            result
        }, "ActionLog.record");

        this.nextSequence++;
        this.records.push(record);
        return record;
    }

    getRecords() {
        return [...this.records];
    }

    clear() {
        this.records = [];
        this.nextSequence = 1;
    }
}
