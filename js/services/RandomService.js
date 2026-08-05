/**
 * ゲーム内の乱数を一元管理する。
 * seedを指定すると同じ乱数列を再現できる。
 */

export default class RandomService {

    constructor({
        seed = null,
        randomFunction = null
    } = {}) {
        if (
            randomFunction !== null &&
            typeof randomFunction !== "function"
        ) {
            throw new Error(
                "RandomService: randomFunctionには関数を指定してください。"
            );
        }

        if (
            seed !== null &&
            !Number.isInteger(seed)
        ) {
            throw new Error(
                "RandomService: seedには整数を指定してください。"
            );
        }

        this.seed = seed;
        this.state = seed === null ? null : seed >>> 0;
        this.randomFunction = randomFunction;
    }

    random() {
        if (this.randomFunction) {
            return this.randomFunction();
        }

        if (this.state === null) {
            return Math.random();
        }

        // Mulberry32
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let value = this.state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    randomInt(min, max) {
        if (
            !Number.isInteger(min) ||
            !Number.isInteger(max) ||
            min > max
        ) {
            throw new Error(
                "RandomService.randomInt(): minとmaxにはmin <= maxとなる整数を指定してください。"
            );
        }

        return Math.floor(
            this.random() * (max - min + 1)
        ) + min;
    }

    choice(array) {
        if (!Array.isArray(array)) {
            throw new Error(
                "RandomService.choice(): arrayには配列を指定してください。"
            );
        }

        if (array.length === 0) {
            return null;
        }

        return array[
            this.randomInt(0, array.length - 1)
        ];
    }

    shuffle(array) {
        if (!Array.isArray(array)) {
            throw new Error(
                "RandomService.shuffle(): arrayには配列を指定してください。"
            );
        }

        const result = [...array];

        for (let index = result.length - 1; index > 0; index--) {
            const randomIndex = this.randomInt(0, index);
            [result[index], result[randomIndex]] =
                [result[randomIndex], result[index]];
        }

        return result;
    }

    getState() {
        return {
            seed: this.seed,
            state: this.state
        };
    }

}
