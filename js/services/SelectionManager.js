import GameState from "../models/GameState.js";
import SelectionRequest from "../models/SelectionRequest.js";
import { freezeSerializable } from "../utils/Serializable.js";

export default class SelectionManager {
    constructor(gameState, actionLog = null) {
        if (!(gameState instanceof GameState)) {
            throw new Error(
                "SelectionManager: gameStateにはGameStateを指定してください。"
            );
        }

        if (
            actionLog !== null &&
            typeof actionLog.append !== "function"
        ) {
            throw new Error(
                "SelectionManager: actionLogにはActionLogを指定してください。"
            );
        }

        this.gameState = gameState;
        this.actionLog = actionLog;
    }

    request(parameters) {
        if (!this.gameState.getPlayer(parameters.playerId)) {
            throw new Error(
                `SelectionManager.request(): プレイヤー '${parameters.playerId}' は存在しません。`
            );
        }

        const request = new SelectionRequest({
            ...parameters,
            id: `SEL_${this.gameState.nextSelectionId++}`
        });

        this.gameState.pendingSelections.push(request);
        this.actionLog?.append({
            type: "SELECTION_REQUESTED",
            playerId: request.playerId,
            payload: {
                requestId: request.id,
                selectionType: request.type,
                min: request.min,
                max: request.max
            }
        });

        return request;
    }

    resolve({
        requestId,
        playerId,
        selectedIds
    }) {
        const index = this.gameState.pendingSelections.findIndex(
            request => request.id === requestId
        );

        if (index === -1) {
            throw new Error(
                `SelectionManager.resolve(): 選択要求 '${requestId}' は存在しません。`
            );
        }

        const request = this.gameState.pendingSelections[index];

        if (request.playerId !== playerId) {
            throw new Error(
                "SelectionManager.resolve(): 選択を行えるプレイヤーではありません。"
            );
        }

        if (!Array.isArray(selectedIds)) {
            throw new Error(
                "SelectionManager.resolve(): selectedIdsには配列を指定してください。"
            );
        }

        const selectionKeys = selectedIds.map(
            id => `${typeof id}:${String(id)}`
        );

        if (new Set(selectionKeys).size !== selectionKeys.length) {
            throw new Error(
                "SelectionManager.resolve(): 同じ候補を複数回選択できません。"
            );
        }

        if (
            selectedIds.length < request.min ||
            selectedIds.length > request.max
        ) {
            throw new Error(
                "SelectionManager.resolve(): 選択数が許可範囲外です。"
            );
        }

        const candidateKeys = new Set(
            request.candidates.map(
                candidate => `${typeof candidate.id}:${String(candidate.id)}`
            )
        );

        if (selectionKeys.some(key => !candidateKeys.has(key))) {
            throw new Error(
                "SelectionManager.resolve(): 候補に存在しない値が選択されています。"
            );
        }

        this.gameState.pendingSelections.splice(index, 1);

        const resolution = freezeSerializable({
            requestId,
            type: request.type,
            playerId,
            selectedIds,
            context: request.context
        }, "SelectionManager.resolution");

        this.actionLog?.append({
            type: "SELECTION_RESOLVED",
            playerId,
            payload: {
                requestId,
                selectedIds
            }
        });

        return resolution;
    }

    getPendingForPlayer(playerId) {
        return this.gameState.pendingSelections.filter(
            request => request.playerId === playerId
        );
    }
}
