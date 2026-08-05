/**
 * TargetDefinition.js
 * 対象定義
 */

import TargetTypes from "../constants/TargetTypes.js";
import CardTypes from "../constants/CardTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

export default class TargetDefinition {

    constructor({

        type,

        amount = null,

        filter = null,

        params = {}

    }) {

        if (
            typeof type !== "string" ||
            type.length === 0
        ) {
            throw new Error(
                "TargetDefinition: typeを指定してください。"
            );
        }

        if (!Object.values(TargetTypes).includes(type)) {
            throw new Error(
                `TargetDefinition: 未対応のtypeです。value=${type}`
            );
        }

        if (
            amount !== null &&
            (!Number.isInteger(amount) || amount < 0)
        ) {
            throw new Error(
                "TargetDefinition: amountには0以上の整数を指定してください。"
            );
        }

        if (
            filter !== null &&
            (typeof filter !== "object" || Array.isArray(filter))
        ) {
            throw new Error(
                "TargetDefinition: filterにはオブジェクトを指定してください。"
            );
        }
        if (filter !== null) {
            const allowedFilterKeys = new Set([
                "cardTypes",
                "zones",
                "controller",
                "faceUp",
                "tags",
                "top"
            ]);
            if (Object.keys(filter).some(key =>
                !allowedFilterKeys.has(key)
            )) {
                throw new Error(
                    "TargetDefinition: filterに未対応の項目があります。"
                );
            }
            this._validateFilterArray(
                filter.cardTypes,
                Object.values(CardTypes),
                "cardTypes"
            );
            this._validateFilterArray(
                filter.zones,
                Object.values(ZoneTypes),
                "zones"
            );
            this._validateFilterArray(
                filter.tags,
                null,
                "tags"
            );
            if (
                filter.controller !== undefined &&
                !["SELF", "OPPONENT", "ANY"].includes(
                    filter.controller
                )
            ) {
                throw new Error(
                    "TargetDefinition: filter.controllerが不正です。"
                );
            }
            if (
                filter.faceUp !== undefined &&
                typeof filter.faceUp !== "boolean"
            ) {
                throw new Error(
                    "TargetDefinition: filter.faceUpには真偽値を指定してください。"
                );
            }
            if (
                filter.top !== undefined &&
                (!Number.isInteger(filter.top) || filter.top < 1)
            ) {
                throw new Error(
                    "TargetDefinition: filter.topには1以上の整数を指定してください。"
                );
            }
        }

        if (
            params === null ||
            typeof params !== "object" ||
            Array.isArray(params)
        ) {
            throw new Error(
                "TargetDefinition: paramsにはオブジェクトを指定してください。"
            );
        }

        this.type = type;

        this.amount = amount;

        this.filter = filter === null
            ? null
            : Object.freeze({
                ...filter,
                cardTypes: filter.cardTypes
                    ? Object.freeze([...filter.cardTypes])
                    : undefined,
                zones: filter.zones
                    ? Object.freeze([...filter.zones])
                    : undefined,
                tags: filter.tags
                    ? Object.freeze([...filter.tags])
                    : undefined,
                top: filter.top
            });

        this.params = { ...params };

        Object.freeze(this.params);

        Object.freeze(this);

    }

    _validateFilterArray(value, allowedValues, propertyName) {
        if (value === undefined) {
            return;
        }
        if (
            !Array.isArray(value) ||
            value.some(item =>
                typeof item !== "string" ||
                item.length === 0 ||
                (allowedValues && !allowedValues.includes(item))
            ) ||
            new Set(value).size !== value.length
        ) {
            throw new Error(
                `TargetDefinition: filter.${propertyName}が不正です。`
            );
        }
    }

}
