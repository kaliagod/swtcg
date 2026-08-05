/**
 * CostDefinition.js
 * コスト定義
 */

import CostTypes from "../constants/CostTypes.js";

export default class CostDefinition {

    constructor({

        type,

        amount = null,

        value = null,

        params = {}

    }) {

        if (
            typeof type !== "string" ||
            type.length === 0
        ) {
            throw new Error(
                "CostDefinition: typeを指定してください。"
            );
        }

        if (!Object.values(CostTypes).includes(type)) {
            throw new Error(
                `CostDefinition: 未対応のtypeです。value=${type}`
            );
        }

        if (
            amount !== null &&
            (!Number.isInteger(amount) || amount < 0)
        ) {
            throw new Error(
                "CostDefinition: amountには0以上の整数を指定してください。"
            );
        }

        this.type = type;

        this.amount = amount;

        this.value = value;

        this.params = { ...params };

        Object.freeze(this.params);

        Object.freeze(this);

    }

}
