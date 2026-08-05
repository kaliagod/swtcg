export function cloneSerializable(
    value,
    parameterName = "value"
) {
    try {
        assertSerializable(
            value,
            parameterName,
            new WeakSet()
        );

        const json = JSON.stringify(value);

        if (json === undefined) {
            throw new Error("JSONへ変換できません。");
        }

        return JSON.parse(json);
    } catch (error) {
        throw new Error(
            `${parameterName}にはJSONへ変換可能な値を指定してください。`,
            { cause: error }
        );
    }
}

function assertSerializable(
    value,
    path,
    visited
) {
    if (value === null) {
        return;
    }

    const valueType = typeof value;

    if (
        valueType === "undefined" ||
        valueType === "function" ||
        valueType === "symbol" ||
        valueType === "bigint"
    ) {
        throw new Error(
            `${path}にJSON化できない値が含まれています。type=${valueType}`
        );
    }

    if (
        valueType === "number" &&
        !Number.isFinite(value)
    ) {
        throw new Error(
            `${path}に有限でない数値が含まれています。`
        );
    }

    if (valueType !== "object") {
        return;
    }

    if (visited.has(value)) {
        throw new Error(
            `${path}に循環参照が含まれています。`
        );
    }

    visited.add(value);

    if (Array.isArray(value)) {
        value.forEach((child, index) =>
            assertSerializable(
                child,
                `${path}[${index}]`,
                visited
            )
        );
    } else {
        for (const [key, child] of Object.entries(value)) {
            assertSerializable(
                child,
                `${path}.${key}`,
                visited
            );
        }
    }

    visited.delete(value);
}

export function freezeSerializable(
    value,
    parameterName = "value"
) {
    return deepFreeze(
        cloneSerializable(value, parameterName)
    );
}

function deepFreeze(value) {
    if (!value || typeof value !== "object") {
        return value;
    }

    for (const child of Object.values(value)) {
        deepFreeze(child);
    }

    return Object.freeze(value);
}
