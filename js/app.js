import GameBootstrap from "./bootstrap/GameBootstrap.js";
import GamePhaseTypes from "./constants/GamePhaseTypes.js";
import CardTypes from "./constants/CardTypes.js";
import AbilityTypes from "./constants/AbilityTypes.js";
import QuestPhaseStages from "./constants/QuestPhaseStages.js";
import GameCommandTypes from "./constants/GameCommandTypes.js";
import ZoneTypes from "./constants/ZoneTypes.js";
import DeckRules from "./constants/DeckRules.js";
import DeckValidator from "./services/DeckValidator.js";
import GameDataLoader from "./loaders/GameDataLoader.js";
import WebRtcPeerSession from "./network/WebRtcPeerSession.js";
import { loadNetworkConfig } from "./network/NetworkConfig.js";
import P2PConnectionCoordinator from "./network/P2PConnectionCoordinator.js";
import ManualSignalingProvider from "./network/signaling/ManualSignalingProvider.js";
import RoomSignalingProvider from "./network/signaling/RoomSignalingProvider.js";
import { createPublicGameContext } from "./network/PublicGameView.js";

const MAIN_PHASE_CARD_TYPES = new Set([
    CardTypes.QUEST,
    CardTypes.EQUIPMENT,
    CardTypes.ACCESSORY,
    CardTypes.ITEM,
    CardTypes.EVENT
]);

const CARD_IMAGE_PLACEHOLDER = "./assets/cards/placeholder.svg";
const DECK_STORAGE_KEY = "adventure-tcg.deck.v1";
const SCREEN_TYPES = Object.freeze({
    HOME: "HOME",
    DECK_BUILDER: "DECK_BUILDER",
    P2P: "P2P",
    GAME: "GAME"
});

const CARD_TYPE_LABELS = {
    [CardTypes.ADVENTURER]: "冒険者",
    [CardTypes.MAGIC]: "魔法",
    [CardTypes.SKILL]: "特技",
    [CardTypes.TRAIT]: "特徴",
    [CardTypes.QUEST]: "依頼書",
    [CardTypes.EQUIPMENT]: "装備品",
    [CardTypes.ACCESSORY]: "装飾品",
    [CardTypes.ITEM]: "アイテム",
    [CardTypes.EVENT]: "イベント"
};

const PHASE_LABELS = {
    [GamePhaseTypes.MULLIGAN]: "マリガン",
    [GamePhaseTypes.TURN_START]: "ターン開始",
    [GamePhaseTypes.DRAW]: "ドロー",
    [GamePhaseTypes.GROWTH]: "育成",
    [GamePhaseTypes.MAIN]: "メイン",
    [GamePhaseTypes.QUEST]: "依頼",
    [GamePhaseTypes.TURN_END]: "ターン終了"
};

const ABILITY_LABELS = {
    [AbilityTypes.DEXTERITY]: "器用",
    [AbilityTypes.AGILITY]: "敏捷",
    [AbilityTypes.STRENGTH]: "筋力",
    [AbilityTypes.VITALITY]: "生命",
    [AbilityTypes.INTELLIGENCE]: "知力",
    [AbilityTypes.SPIRIT]: "精神"
};

const app = document.querySelector("#game");
const messages = [];
const selectedCandidateIds = new Map();
const selectedCardDetails = new Map();
let context = null;
let nextLocalCommandId = 1;
let activeCardDetailOwnerId = null;
let openCardBrowser = null;
let logExpanded = false;
let zoneGuidesVisible = false;
let growthPickerMinimized = false;
let currentScreen = SCREEN_TYPES.HOME;
let gameData = null;
let cardDefinitionMap = new Map();
let deckDraft = null;
let selectedDeckCardId = null;
let deckNotice = "";
let deckFilters = {
    query: "",
    type: "ALL",
    destination: "ALL"
};
let localPlayerId = null;
let networkSession = null;
let networkRole = null;
let networkStatus = "OFFLINE";
let networkLobby = {
    mode: null,
    signalingMode: "ROOM",
    offerCode: "",
    answerCode: "",
    notice: "",
    diagnostic: "",
    lastRemoteCode: ""
};
let networkConfigPromise = null;
let networkOperationId = 0;
const pendingNetworkCommands = new Map();

async function executeCommand(type, playerId, payload = {}) {
    const command = {
        protocolVersion: 1,
        id: `${networkRole === null
            ? "LOCAL"
            : `P2P_${playerId}`}_${nextLocalCommandId++}`,
        type,
        playerId,
        expectedRevision: context.gameState.revision,
        payload
    };
    if (networkRole === "GUEST") {
        if (playerId !== localPlayerId) {
            return {
                accepted: false,
                reason: "NOT_LOCAL_NETWORK_PLAYER"
            };
        }
        return sendNetworkCommand(command);
    }
    const result = context.commandGateway.execute(command, {
        authenticatedPlayerId: playerId
    });
    if (networkRole === "HOST" && result.accepted) {
        sendGuestState();
    }
    return result;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderCardArtwork(
    card,
    {
        className = "card__image",
        faceUp = true
    } = {}
) {
    if (!card || !faceUp) {
        return `<span class="card__back-label" aria-hidden="true">CARD BACK</span>`;
    }
    const imagePath = card.definition.imagePath ?? CARD_IMAGE_PLACEHOLDER;
    const typeClass = card.definition.type.toLowerCase().replaceAll("_", "-");
    const artworkClasses = card.definition.imagePath === null
        ? `card-artwork card-artwork--placeholder card-artwork--${typeClass}`
        : "card-artwork";
    return `
        <img
            class="${className} ${artworkClasses}"
            src="${escapeHtml(imagePath)}"
            alt=""
            aria-hidden="true"
            draggable="false"
        >
        <span class="visually-hidden">${escapeHtml(card.name)}</span>
    `;
}

function addMessage(message) {
    messages.unshift(message);
    messages.length = Math.min(messages.length, 100);
}

function getCurrentPlayer() {
    return context.gameState.getCurrentPlayer();
}

function getLocalPlayer() {
    if (networkRole === null) {
        return getCurrentPlayer() ?? context.gameState.players[0] ?? null;
    }
    if (localPlayerId !== null) {
        return context.gameState.getPlayer(localPlayerId);
    }
    return context.gameState.players[0] ?? null;
}

function canInspectPrivateCard(player, card) {
    if (player.id !== getLocalPlayer()?.id) {
        return false;
    }
    return [
        ZoneTypes.RESOURCE,
        ZoneTypes.ADVENTURE_DECK
    ].includes(card.zone) || (
        card.zone === ZoneTypes.FIELD &&
        card.faceUp === false
    );
}

function getQuestPreparationPlayer() {
    const preparation = context.gameState.questPreparation;
    if (preparation === null) {
        return null;
    }
    return context.gameState.getPlayer(
        preparation.playerOrder[preparation.currentIndex]
    );
}

function renderAbility(adventurer, type) {
    const normal = adventurer.getCurrentStat(type);
    const questBonus = adventurer.getQuestStat(type) - normal;
    return `
        <strong>${normal}</strong>
        <small>（${questBonus >= 0 ? "+" : ""}${questBonus}）</small>
    `;
}

function renderRequirements(requirements) {
    const parts = [];
    if ((requirements?.minLevel ?? 0) > 0) {
        parts.push(`レベル${requirements.minLevel}以上`);
    }
    for (const [ability, minimum] of Object.entries(
        requirements?.minStats ?? {}
    )) {
        parts.push(`${ABILITY_LABELS[ability] ?? ability}${minimum}以上`);
    }
    for (const tag of requirements?.requiredTags ?? []) {
        parts.push(`タグ「${escapeHtml(tag)}」あり`);
    }
    for (const tag of requirements?.forbiddenTags ?? []) {
        parts.push(`タグ「${escapeHtml(tag)}」なし`);
    }
    return parts.length > 0
        ? `<span class="card__text">条件: ${parts.join("・")}</span>`
        : "";
}

function renderCounters(card) {
    const counters = Object.entries(card.counters ?? {})
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${escapeHtml(name)}: ${count}`);
    return counters.length > 0
        ? `<span class="card__state-badge card__state-badge--counter">${counters.join("・")}</span>`
        : "";
}

function renderStatuses(holder) {
    const counts = new Map();
    for (const status of holder.statuses ?? []) {
        counts.set(
            status.name,
            (counts.get(status.name) ?? 0) + 1
        );
    }
    const labels = [...counts].map(
        ([name, count]) =>
            count > 1
                ? `${escapeHtml(name)}×${count}`
                : escapeHtml(name)
    );
    return labels.length > 0
        ? `<span class="card__state-badge card__state-badge--status">${labels.join("・")}</span>`
        : "";
}

function formatUseRequirementFailures(eligibility) {
    return (eligibility?.requirementResult?.failures ?? []).map(
        failure => {
            switch (failure.type) {
                case "LEVEL_TOO_LOW":
                    return `レベルが不足しています（必要${failure.required}／現在${failure.actual}）`;
                case "STAT_TOO_LOW":
                    return `${ABILITY_LABELS[failure.ability] ?? failure.ability}が不足しています（必要${failure.required}／現在${failure.actual}）`;
                case "REQUIRED_TAG_MISSING":
                    return `「${failure.tag}」タグが必要です`;
                case "FORBIDDEN_TAG_PRESENT":
                    return `「${failure.tag}」タグを持つため使用できません`;
                case "ADVENTURER_NOT_AVAILABLE":
                    return "冒険者が選択されていません";
                default:
                    return "カードの使用条件を満たしていません";
            }
        }
    );
}

function getHandCardAction(card, player) {
    if (
        card.zone !== ZoneTypes.HAND ||
        !MAIN_PHASE_CARD_TYPES.has(card.definition.type)
    ) {
        return null;
    }

    const useEligibility = context.gameEngine.getCardUseEligibility({
        player,
        card
    });
    const reasons = [];
    if (!context.gameState.started) {
        reasons.push("ゲーム開始後に使用できます");
    } else if (context.gameState.ended) {
        reasons.push("ゲームは終了しています");
    } else if (context.gameState.phase !== GamePhaseTypes.MAIN) {
        reasons.push("メインフェイズで使用できます");
    } else if (getCurrentPlayer() !== player) {
        reasons.push("このプレイヤーの手番ではありません");
    } else {
        if (player.zones.resource.size() < card.definition.cost) {
            reasons.push(
                `リソースが不足しています（必要${card.definition.cost}／現在${player.zones.resource.size()}）`
            );
        }
        reasons.push(...formatUseRequirementFailures(useEligibility));
    }

    return {
        allowed: reasons.length === 0,
        action: "play-card",
        label: "このカードを使用",
        reasons
    };
}

function canPlayCardFromHand(card, player) {
    return getHandCardAction(card, player)?.allowed === true;
}

function getGrowthCardAction(card, player) {
    if (
        card.zone !== ZoneTypes.ADVENTURE_DECK ||
        ![
            CardTypes.MAGIC,
            CardTypes.SKILL,
            CardTypes.TRAIT
        ].includes(card.definition.type)
    ) {
        return null;
    }

    const useEligibility = context.gameEngine.getCardUseEligibility({
        player,
        card
    });
    const reasons = [];
    if (!context.gameState.started) {
        reasons.push("ゲーム開始後に育成できます");
    } else if (context.gameState.ended) {
        reasons.push("ゲームは終了しています");
    } else if (context.gameState.phase !== GamePhaseTypes.GROWTH) {
        reasons.push("育成フェイズで使用できます");
    } else if (getCurrentPlayer() !== player) {
        reasons.push("このプレイヤーの手番ではありません");
    } else {
        if (player.zones.resource.size() < card.definition.cost) {
            reasons.push(
                `リソースが不足しています（必要${card.definition.cost}／現在${player.zones.resource.size()}）`
            );
        }
        reasons.push(...formatUseRequirementFailures(useEligibility));
    }

    return {
        allowed: reasons.length === 0,
        action: "play-growth-card",
        label: "このカードで育成",
        reasons
    };
}

function canPlayGrowthCard(card, player) {
    return getGrowthCardAction(card, player)?.allowed === true;
}

function getFieldCardActivation(card, player) {
    const isAdventureAbility = [
        CardTypes.MAGIC,
        CardTypes.SKILL,
        CardTypes.TRAIT
    ].includes(card.definition.type);
    const isActiveAdventureAbility =
        card.definition.type === CardTypes.MAGIC ||
        card.definition.adventureAbilityType === "ACTIVE";
    const isItem = card.definition.type === CardTypes.ITEM;
    if (!isItem && !(isAdventureAbility && isActiveAdventureAbility)) {
        return null;
    }

    const action = isItem
        ? "activate-card"
        : "activate-adventure-card";
    const label = isItem
        ? "このアイテムを使用"
        : "この能力を使用";
    const reasons = [];
    if (
        networkRole !== null &&
        player.id !== getLocalPlayer()?.id
    ) {
        reasons.push("対戦相手のカードは操作できません");
    }
    const useEligibility = context.gameEngine.getCardUseEligibility({
        player,
        card
    });

    if (!context.gameState.started) {
        reasons.push("ゲーム開始後に使用できます");
    } else if (context.gameState.ended) {
        reasons.push("ゲームは終了しています");
    } else if (isItem) {
        const isMainTiming =
            context.gameState.phase === GamePhaseTypes.MAIN &&
            getCurrentPlayer() === player;
        const isPreparationTiming =
            context.gameState.phase === GamePhaseTypes.QUEST &&
            getQuestPreparationPlayer() === player;
        if (!isMainTiming && !isPreparationTiming) {
            reasons.push("自分のメインフェイズまたは依頼準備中に使用できます");
        }
    } else if (
        context.gameState.phase !== GamePhaseTypes.QUEST ||
        getQuestPreparationPlayer() === null
    ) {
        reasons.push("依頼準備中に使用できます");
    } else if (getQuestPreparationPlayer() !== player) {
        reasons.push("このプレイヤーの依頼準備順ではありません");
    }

    if (reasons.length === 0) {
        if (!card.faceUp || card.refreshAtOwnerTurnStart) {
            reasons.push("使用済みのため、次の自分のターン開始まで使用できません");
        }
        if (isItem && card.definition.itemUse === null) {
            reasons.push("このアイテムには使用時の効果がありません");
        }
        if (
            !isItem &&
            card.definition.type === CardTypes.MAGIC &&
            context.gameState.questPreparation
                ?.usedMagicNamesByPlayer?.[player.id]
                ?.includes(card.definition.name)
        ) {
            reasons.push("この依頼では同名の魔法をすでに使用しています");
        }
        reasons.push(...formatUseRequirementFailures(useEligibility));
    }

    return {
        allowed: reasons.length === 0,
        action,
        label,
        reasons
    };
}

function isCardDetailSelected(card, player) {
    const selected = selectedCardDetails.get(player.id);
    return selected?.kind === "CARD" &&
        selected.instanceId === card.instanceId;
}

function isHiddenDetailSelected(player, key) {
    const selected = selectedCardDetails.get(player.id);
    return selected?.kind === "HIDDEN" && selected.key === key;
}

function cardDetailAttributes(card, player) {
    return `
        data-detail-owner-id="${player.id}"
        data-detail-card-instance-id="${escapeHtml(card.instanceId)}"
    `;
}

function hiddenDetailAttributes(player, label, key = label) {
    return `
        data-detail-owner-id="${player.id}"
        data-detail-hidden-label="${escapeHtml(label)}"
        data-detail-hidden-key="${escapeHtml(key)}"
    `;
}

function cardDetailClass(card, player) {
    return isCardDetailSelected(card, player)
        ? "card--detail-selected"
        : "";
}

function hiddenDetailClass(player, key) {
    return isHiddenDetailSelected(player, key)
        ? "card--detail-selected"
        : "";
}

function renderCard(card, player) {
    const selectionCard = renderSelectableCard(card, player);
    if (selectionCard !== null) {
        return selectionCard;
    }
    const canPlay = canPlayCardFromHand(card, player);

    return `
        <button
            type="button"
            class="card card--detail-target ${
                canPlay ? "card--playable" : ""
            } ${cardDetailClass(card, player)}"
            ${cardDetailAttributes(card, player)}
            aria-label="${escapeHtml(card.name)}の詳細を表示"
            aria-pressed="${isCardDetailSelected(card, player)}"
        >
            ${renderCardArtwork(card)}
        </button>
    `;
}

function renderHiddenHandCard() {
    return `
        <div class="card card--back" aria-label="非公開の手札">
            <span class="card__back-label" aria-hidden="true">CARD BACK</span>
        </div>
    `;
}

function renderGrowthCard(card, player) {
    const selectionCard = renderSelectableCard(card, player);
    if (selectionCard !== null) {
        return selectionCard;
    }
    const canPlay = canPlayGrowthCard(card, player);

    return `
        <button
            type="button"
            class="card card--detail-target ${
                canPlay ? "card--playable" : ""
            } ${cardDetailClass(card, player)}"
            ${cardDetailAttributes(card, player)}
            aria-label="${escapeHtml(card.name)}の詳細を表示"
            aria-pressed="${isCardDetailSelected(card, player)}"
        >
            ${renderCardArtwork(card)}
        </button>
    `;
}

function renderStaticCard(
    card,
    player,
    {
        actionAttributes = "",
        revealFaceDown = false
    } = {}
) {
    if (!card) {
        return "";
    }
    const faceUp = revealFaceDown || card.faceUp !== false;
    return `
        <button
            type="button"
            class="card card--static card--detail-target ${
                faceUp ? "" : "card--back"
            } ${
                cardDetailClass(card, player)
            }"
            ${cardDetailAttributes(card, player)}
            ${actionAttributes}
            aria-label="${escapeHtml(
                faceUp ? `${card.name}の詳細を表示` : "裏向きカード"
            )}"
            aria-pressed="${isCardDetailSelected(card, player)}"
        >
            ${renderCardArtwork(card, { faceUp })}
        </button>
    `;
}

function getPendingSelection() {
    return context?.gameState?.pendingSelections?.[0] ?? null;
}

function findSelectionCard(candidate) {
    const instanceId = String(candidate.id);
    for (const player of context.gameState.players) {
        for (const zone of player.zones.getAllZones()) {
            const card = zone.cards.find(
                current => current.instanceId === instanceId
            );
            if (card) {
                return card;
            }
        }
    }
    return null;
}

function getCardSelectionState(card) {
    const request = getPendingSelection();
    if (request === null) {
        return null;
    }
    const candidate = request.candidates.find(
        current => String(current.id) === card.instanceId
    );
    if (!candidate) {
        return null;
    }
    const selected = selectedCandidateIds.get(request.id) ?? new Set();
    return {
        request,
        candidate,
        selected: selected.has(candidate.id),
        order: [...selected].indexOf(candidate.id) + 1
    };
}

function selectionAttributes(state) {
    return `
        data-action="toggle-selection"
        data-request-id="${escapeHtml(state.request.id)}"
        data-candidate-id="${escapeHtml(state.candidate.id)}"
        aria-pressed="${state.selected}"
    `;
}

function renderSelectableCard(card, player) {
    const state = getCardSelectionState(card);
    if (state === null) {
        return null;
    }
    const faceUp = card.faceUp !== false;
    return `
        <button
            type="button"
            class="card card--selection-candidate ${
                faceUp ? "" : "card--back"
            } ${
                state.selected ? "card--selection-selected" : ""
            } ${cardDetailClass(card, player)}"
            ${selectionAttributes(state)}
            ${cardDetailAttributes(card, player)}
        >
            ${renderCardArtwork(card, { faceUp })}
            <span class="selection-order">${
                state.selected ? state.order : "選択"
            }</span>
        </button>
    `;
}

function renderFan(cards, renderer, className = "") {
    if (cards.length === 0) {
        return `<div class="zone-empty">EMPTY</div>`;
    }
    const preceding = Math.max(0, cards.length - 1);
    return `
        <div
            class="fan-cards ${className}"
            style="grid-template-columns:
                repeat(${preceding}, minmax(0, calc(var(--zone-card-width) * .5)))
                var(--zone-card-width);"
        >
            ${cards.map(renderer).join("")}
        </div>
    `;
}

function renderAdaptiveFan(cards, renderer) {
    if (cards.length === 0) {
        return `<div class="zone-empty">EMPTY</div>`;
    }
    const preceding = Math.max(0, cards.length - 1);
    return `
        <div
            class="fan-cards fan-cards--adaptive"
            style="grid-template-columns:
                repeat(${preceding}, minmax(0, var(--zone-card-width)))
                var(--zone-card-width);"
        >
            ${cards.map(renderer).join("")}
        </div>
    `;
}

function renderSpread(cards, renderer) {
    if (cards.length === 0) {
        return `<div class="zone-empty">EMPTY</div>`;
    }
    return `
        <div class="spread-cards">
            ${cards.map(renderer).join("")}
        </div>
    `;
}

function renderPile({
    cards,
    label,
    hidden = false,
    player,
    browseZone = null
}) {
    const topCard = cards.at(-1) ?? null;
    const browseAttributes = browseZone === null
        ? ""
        : `
            data-action="open-card-browser"
            data-player-id="${player.id}"
            data-zone-type="${escapeHtml(browseZone)}"
        `;
    const cardMarkup = topCard === null
        ? browseZone === null
            ? `<div class="card card--pile-empty"></div>`
            : `
                <button
                    type="button"
                    class="card card--pile-empty card--browse-target"
                    ${browseAttributes}
                    aria-label="${escapeHtml(label)}の一覧を表示"
                ></button>
            `
        : hidden
            ? `
                <button
                    type="button"
                    class="card card--back ${
                        browseZone === null
                            ? `card--detail-target ${
                                hiddenDetailClass(player, label)
                            }`
                            : "card--browse-target"
                    }"
                    ${browseZone === null
                        ? hiddenDetailAttributes(player, label)
                        : browseAttributes}
                    aria-label="${escapeHtml(label)}${
                        browseZone === null
                            ? "の詳細を表示"
                            : "の一覧を表示"
                    }"
                    ${browseZone === null
                        ? `aria-pressed="${
                            isHiddenDetailSelected(player, label)
                        }"`
                        : ""}
                >
                    <span>${escapeHtml(label)}</span>
                </button>
            `
            : renderStaticCard(topCard, player, {
                actionAttributes: browseAttributes
            });
    return `
        <div class="card-pile ${topCard === null ? "card-pile--empty" : ""}">
            ${cardMarkup}
            <span class="card-pile__count">${cards.length}</span>
        </div>
    `;
}

function renderResources(cards, player) {
    if (cards.length === 0) {
        return `<div class="zone-empty">EMPTY</div>`;
    }
    const preceding = Math.max(0, cards.length - 1);
    return `
        <div
            class="resource-stack"
            style="grid-template-rows:
                repeat(${preceding}, minmax(0, calc(var(--zone-card-width) * .5)))
                var(--zone-card-width);"
        >
            ${cards.map(card => {
                const state = getCardSelectionState(card);
                const ownerCanInspect =
                    player.id === getLocalPlayer()?.id;
                return `
                <div class="resource-stack__slot">
                    <button
                        type="button"
                        class="card card--back card--resource card--detail-target ${
                            state === null
                                ? ""
                                : "card--selection-candidate"
                        } ${
                            state?.selected
                                ? "card--selection-selected"
                                : ""
                        } ${ownerCanInspect
                            ? cardDetailClass(card, player)
                            : hiddenDetailClass(player, card.instanceId)
                        }"
                        ${state === null ? "" : selectionAttributes(state)}
                        ${ownerCanInspect
                            ? cardDetailAttributes(card, player)
                            : hiddenDetailAttributes(
                                player,
                                "RESOURCE",
                                card.instanceId
                            )}
                        aria-label="リソースカードの詳細を表示"
                    >
                        <span>RESOURCE</span>
                        ${state === null ? "" : `
                            <span class="selection-order">${
                                state.selected ? state.order : "選択"
                            }</span>
                        `}
                    </button>
                </div>
            `;
            }).join("")}
        </div>
    `;
}

function findPlayerCard(player, instanceId) {
    if (player.adventurer.card?.instanceId === instanceId) {
        return player.adventurer.card;
    }
    for (const zone of player.zones.getAllZones()) {
        const card = zone.cards.find(
            current => current.instanceId === instanceId
        );
        if (card) {
            return card;
        }
    }
    return null;
}

function getRequirementLabels(requirements) {
    const labels = [];
    if ((requirements?.minLevel ?? 0) > 0) {
        labels.push(`レベル${requirements.minLevel}以上`);
    }
    for (const [ability, minimum] of Object.entries(
        requirements?.minStats ?? {}
    )) {
        labels.push(`${ABILITY_LABELS[ability] ?? ability}${minimum}以上`);
    }
    for (const tag of requirements?.requiredTags ?? []) {
        labels.push(`「${tag}」タグあり`);
    }
    for (const tag of requirements?.forbiddenTags ?? []) {
        labels.push(`「${tag}」タグなし`);
    }
    return labels;
}

function formatAbilityValues(values, { signed = false } = {}) {
    return Object.entries(values ?? {}).map(([ability, value]) =>
        `${ABILITY_LABELS[ability] ?? ability}${
            signed && value >= 0 ? "+" : ""
        }${value}`
    );
}

function renderCardDetailAction(card, player) {
    let actionState = null;
    if (card.zone === ZoneTypes.ADVENTURE_DECK) {
        actionState = getGrowthCardAction(card, player);
    } else if (card.zone === ZoneTypes.HAND) {
        actionState = getHandCardAction(card, player);
    } else if (card.zone === ZoneTypes.FIELD) {
        actionState = getFieldCardActivation(card, player);
    }
    if (actionState === null) {
        return "";
    }

    if (getPendingSelection() !== null) {
        actionState = {
            ...actionState,
            allowed: false,
            reasons: ["現在の選択を完了してください"]
        };
    }
    const reasonId = `card-action-reason-${card.instanceId}`;
    return `
        <button
            type="button"
            class="button button--primary card-detail__action"
            ${actionState.allowed ? `
                data-action="${actionState.action}"
                data-player-id="${player.id}"
                data-card-instance-id="${escapeHtml(card.instanceId)}"
            ` : `
                disabled
                aria-describedby="${escapeHtml(reasonId)}"
            `}
        >${escapeHtml(actionState.label)}</button>
        ${actionState.allowed ? "" : `
            <p
                class="card-detail__action-reason"
                id="${escapeHtml(reasonId)}"
            >使用不可：${escapeHtml(actionState.reasons.join("／"))}</p>
        `}
    `;
}

function renderHiddenCardDetail(player, label) {
    return `
        <aside class="card-detail" aria-label="${escapeHtml(player.name)}のカード詳細">
            <div class="card-detail__image card-detail__image--hidden">
                <span class="card-detail__type">${escapeHtml(label)}</span>
                <span class="card-detail__symbol" aria-hidden="true">✦</span>
                <strong>非公開カード</strong>
            </div>
            <div class="card-detail__text">
                <span class="card-detail__eyebrow">CARD DETAIL</span>
                <h2>非公開カード</h2>
                <p>この領域にあるカードの内容は公開されていません。</p>
            </div>
        </aside>
    `;
}

function renderCardDetail(player) {
    const selected = selectedCardDetails.get(player.id) ?? null;
    if (selected === null) {
        return `
            <aside class="card-detail card-detail--empty" aria-label="${escapeHtml(player.name)}のカード詳細">
                <div class="card-detail__image">
                    <span class="card-detail__type">CARD DETAIL</span>
                    <span class="card-detail__symbol" aria-hidden="true">◇</span>
                </div>
                <div class="card-detail__text">
                    <span class="card-detail__eyebrow">CARD DETAIL</span>
                    <h2>カードを選択</h2>
                    <p>盤面または手札のカードをクリックすると、ここに詳細が表示されます。</p>
                </div>
            </aside>
        `;
    }
    if (selected.kind === "HIDDEN") {
        return renderHiddenCardDetail(player, selected.label);
    }

    const card = findPlayerCard(player, selected.instanceId);
    if (card === null) {
        selectedCardDetails.delete(player.id);
        return renderCardDetail(player);
    }
    if (
        card.faceUp === false &&
        !canInspectPrivateCard(player, card)
    ) {
        return renderHiddenCardDetail(player, "FACE DOWN");
    }

    const definition = card.definition;
    const useRequirements = getRequirementLabels(
        definition.useRequirements
    );
    const participationRequirements = getRequirementLabels(
        definition.participationRequirements
    );
    const detailLines = [];
    const tags = card.getTags();
    if (tags.length > 0) {
        detailLines.push(["タグ", tags.join("・")]);
    }
    if (definition.type === CardTypes.ADVENTURER) {
        detailLines.push([
            "基礎能力",
            formatAbilityValues(definition.baseStats).join("・")
        ]);
    }
    if (definition.grantedTags.length > 0) {
        detailLines.push([
            "付与タグ",
            definition.grantedTags.join("・")
        ]);
    }
    if (useRequirements.length > 0) {
        detailLines.push(["使用条件", useRequirements.join("・")]);
    }
    if (participationRequirements.length > 0) {
        detailLines.push([
            "参加条件",
            participationRequirements.join("・")
        ]);
    }
    const statModifiers = formatAbilityValues(
        definition.statModifiers,
        { signed: true }
    );
    if (statModifiers.length > 0) {
        detailLines.push(["能力修正", statModifiers.join("・")]);
    }
    const questModifiers = formatAbilityValues(
        definition.activeQuestModifiers,
        { signed: true }
    );
    if (questModifiers.length > 0) {
        detailLines.push(["依頼中修正", questModifiers.join("・")]);
    }
    if (definition.type === CardTypes.QUEST) {
        const requirements = formatAbilityValues(
            card.getQuestRequirements()
        );
        detailLines.push([
            "達成条件",
            requirements.join("・") || "なし"
        ]);
        detailLines.push(["ダメージ", card.getQuestDamage()]);
        detailLines.push([
            "成功報酬",
            `リソース${card.getQuestRewardResources()}`
        ]);
    }
    const counters = Object.entries(card.counters ?? {})
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${name}:${count}`);
    if (counters.length > 0) {
        detailLines.push(["カウンター", counters.join("・")]);
    }
    const statuses = (card.statuses ?? []).map(status => status.name);
    if (statuses.length > 0) {
        detailLines.push(["状態", statuses.join("・")]);
    }

    const metadata = [];
    if (definition.type !== CardTypes.ADVENTURER) {
        metadata.push(`コスト ${definition.cost}`);
    }
    if (definition.levelGain > 0) {
        metadata.push(`成長 +${definition.levelGain}`);
    }
    if (definition.adventureAbilityType) {
        metadata.push(definition.adventureAbilityType);
    }
    const typeClass = definition.type.toLowerCase().replaceAll("_", "-");
    const detailAction = renderCardDetailAction(card, player);

    return `
        <aside class="card-detail" aria-label="${escapeHtml(player.name)}のカード詳細">
            <div class="card-detail__image card-detail__image--${typeClass}">
                ${renderCardArtwork(card, {
                    className: "card-detail__artwork"
                })}
            </div>
            <div class="card-detail__text">
                <span class="card-detail__eyebrow">${escapeHtml(definition.type)}</span>
                <h2>${escapeHtml(card.name)}</h2>
                ${metadata.length > 0 ? `
                    <div class="card-detail__metadata">
                        ${metadata.map(value => `
                            <span>${escapeHtml(value)}</span>
                        `).join("")}
                    </div>
                ` : ""}
                <div class="card-detail__copy">
                    ${definition.text.map(paragraph => `
                        <p>${escapeHtml(paragraph)}</p>
                    `).join("")}
                    ${detailLines.map(([label, value]) => `
                        <p><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</p>
                    `).join("")}
                </div>
                ${detailAction === "" ? "" : `
                    <footer class="card-detail__actions">
                        ${detailAction}
                    </footer>
                `}
            </div>
        </aside>
    `;
}

function renderBoardZone({
    code,
    label,
    className,
    content,
    count = null
}) {
    return `
        <section
            class="play-zone ${className}"
            aria-label="${escapeHtml(label)}"
        >
            <span class="play-zone__label">
                <b>${code}</b> ${escapeHtml(label)}
            </span>
            ${Number.isInteger(count)
                ? `<span class="play-zone__count" aria-label="${count}枚">${count}</span>`
                : ""}
            <div class="play-zone__content">
                ${content}
            </div>
        </section>
    `;
}

function renderFieldCard(card, player) {
    const selectionCard = renderSelectableCard(card, player);
    if (selectionCard !== null) {
        return selectionCard;
    }
    if (card.definition.type === CardTypes.QUEST) {
        const activePlayer = getCurrentPlayer();
        const localCanAct = networkRole === null ||
            activePlayer?.id === getLocalPlayer()?.id;
        const canJoin = localCanAct && context.questManager
            .canDeclareParticipation({
                gameState: context.gameState,
                player: activePlayer,
                questCard: card
            });
        const canResolve = localCanAct && context.questManager.canResolve({
            gameState: context.gameState,
            player: activePlayer,
            questCard: card
        });
        const preparation = context.gameState.questPreparation;
        const questPhase = context.gameState.questPhase;
        const isPreparingThisQuest =
            preparation?.questInstanceId === card.instanceId;
        const canStartPreparation =
            canResolve &&
            questPhase?.stage === QuestPhaseStages.SELECT_QUEST &&
            preparation === null &&
            !card.questPreparationComplete;
        const canCompleteQuest =
            canResolve &&
            questPhase?.stage === QuestPhaseStages.RESOLUTION &&
            questPhase.activeQuestInstanceId === card.instanceId &&
            preparation === null &&
            card.questPreparationComplete;

        return `
            <article
                class="card card--detail-target ${
                    cardDetailClass(card, player)
                }"
                ${cardDetailAttributes(card, player)}
            >
                ${renderCardArtwork(card)}
                <div class="card__actions">
                ${canJoin ? `
                    <button
                        class="button"
                        data-action="join-quest"
                        data-owner-id="${player.id}"
                        data-card-instance-id="${card.instanceId}"
                    >参加宣言</button>
                ` : ""}
                ${isPreparingThisQuest ? `
                    <span class="card__text">依頼準備中</span>
                ` : ""}
                ${canStartPreparation ? `
                    <button
                        class="button button--primary"
                        data-action="start-quest-preparation"
                        data-owner-id="${player.id}"
                        data-card-instance-id="${card.instanceId}"
                    >依頼準備を開始</button>
                ` : ""}
                ${canCompleteQuest ? `
                    <button
                        class="button button--primary"
                        data-action="resolve-quest"
                        data-owner-id="${player.id}"
                        data-card-instance-id="${card.instanceId}"
                    >依頼を攻略</button>
                ` : ""}
                </div>
            </article>
        `;
    }

    const activation = getFieldCardActivation(card, player);

    return `
        <button
            type="button"
            class="card card--detail-target ${
                activation?.allowed ? "card--playable" : ""
            } ${card.faceUp ? "" : "card--back"} ${
                cardDetailClass(card, player)
            }"
            ${cardDetailAttributes(card, player)}
            aria-label="${escapeHtml(
                card.faceUp ? `${card.name}の詳細を表示` : "裏向きカード"
            )}"
            aria-pressed="${isCardDetailSelected(card, player)}"
        >
            ${renderCardArtwork(card, { faceUp: card.faceUp })}
            ${renderCounters(card)}
            ${renderStatuses(card)}
        </button>
    `;
}

function renderPlayer(player) {
    const isCurrent = getCurrentPlayer() === player;
    const isLocal = getLocalPlayer()?.id === player.id;
    const adventurer = player.adventurer;
    const maximumHp = adventurer.getCurrentStat(AbilityTypes.VITALITY);
    const currentHp = Math.max(0, maximumHp - adventurer.damage);
    const maximumMp = adventurer.getCurrentStat(AbilityTypes.SPIRIT);
    const questCards = player.zones.field.cards.filter(
        card => card.definition.type === CardTypes.QUEST
    );
    const adventureCards = player.zones.field.cards.filter(
        card => [
            CardTypes.MAGIC,
            CardTypes.SKILL,
            CardTypes.TRAIT
        ].includes(card.definition.type)
    );
    const mainFieldCards = player.zones.field.cards.filter(
        card => ![
            CardTypes.QUEST,
            CardTypes.MAGIC,
            CardTypes.SKILL,
            CardTypes.TRAIT
        ].includes(card.definition.type)
    );

    return `
        <article
            class="player-board ${isCurrent ? "player-board--current" : ""}"
            aria-label="${escapeHtml(player.name)}のプレイ領域"
        >
            <header class="player-board__identity">
                <span>PLAYER ${player.id}</span>
                <strong>${escapeHtml(player.name)}</strong>
                <em>${isCurrent ? "TURN" : "WAIT"}</em>
            </header>

            ${renderBoardZone({
                code: "A",
                label: "依頼書置き場",
                className: "play-zone--quest",
                content: renderSpread(
                    questCards,
                    card => renderFieldCard(card, player)
                )
            })}

            ${renderBoardZone({
                code: "B",
                label: "メイン設置領域",
                className: "play-zone--main-field",
                content: renderSpread(
                    mainFieldCards,
                    card => renderFieldCard(card, player)
                )
            })}

            ${renderBoardZone({
                code: "C",
                label: "リソース",
                className: "play-zone--resource",
                content: renderResources(
                    player.zones.resource.cards,
                    player
                ),
                count: player.zones.resource.cards.length
            })}

            ${renderBoardZone({
                code: "D",
                label: "墓地",
                className: "play-zone--graveyard",
                content: renderPile({
                    cards: player.zones.graveyard.cards,
                    label: "GRAVEYARD",
                    player,
                    browseZone: isLocal
                        ? ZoneTypes.GRAVEYARD
                        : null
                })
            })}

            ${renderBoardZone({
                code: "E",
                label: "冒険者デッキ",
                className: "play-zone--adventure-deck",
                content: renderPile({
                    cards: player.zones.adventureDeck.cards,
                    label: "ADVENTURE",
                    hidden: true,
                    player,
                    browseZone: isLocal
                        ? ZoneTypes.ADVENTURE_DECK
                        : null
                })
            })}

            <section
                class="play-zone play-zone--adventurer"
                aria-label="冒険者カード"
            >
                <span class="play-zone__label"><b>F</b> 冒険者</span>
                <div class="adventurer-card">
                    <button
                        type="button"
                        class="adventurer-card__visual card--detail-target ${
                            cardDetailClass(adventurer.card, player)
                        }"
                        ${cardDetailAttributes(adventurer.card, player)}
                        aria-label="${escapeHtml(adventurer.card?.name ?? "冒険者")}のカード画像"
                        aria-pressed="${isCardDetailSelected(adventurer.card, player)}"
                    >
                        ${renderCardArtwork(adventurer.card, {
                            className: "adventurer-card__image"
                        })}
                    </button>

                    <aside class="adventurer-card__status" aria-label="冒険者の能力値">
                        <dl class="adventurer-card__stats">
                            <div><dt>器用</dt><dd>${renderAbility(adventurer, AbilityTypes.DEXTERITY)}</dd></div>
                            <div><dt>敏捷</dt><dd>${renderAbility(adventurer, AbilityTypes.AGILITY)}</dd></div>
                            <div><dt>筋力</dt><dd>${renderAbility(adventurer, AbilityTypes.STRENGTH)}</dd></div>
                            <div><dt>生命</dt><dd>${renderAbility(adventurer, AbilityTypes.VITALITY)}</dd></div>
                            <div><dt>知力</dt><dd>${renderAbility(adventurer, AbilityTypes.INTELLIGENCE)}</dd></div>
                            <div><dt>精神</dt><dd>${renderAbility(adventurer, AbilityTypes.SPIRIT)}</dd></div>
                        </dl>
                    </aside>

                    <div class="adventurer-card__vitals" aria-label="冒険者のレベル、HP、MP">
                        <div class="adventurer-card__level">
                            <span>LEVEL</span>
                            <strong>${adventurer.level}</strong>
                        </div>
                        <div class="adventurer-card__meter adventurer-card__meter--hp">
                            <span>HP</span>
                            <strong>${currentHp}/${maximumHp}</strong>
                        </div>
                        <div class="adventurer-card__meter adventurer-card__meter--mp">
                            <span>MP</span>
                            <strong>${adventurer.availableMp}/${maximumMp}</strong>
                        </div>
                    </div>
                </div>
            </section>

            ${renderBoardZone({
                code: "G",
                label: "冒険者能力",
                className: "play-zone--adventure-field",
                content: renderFan(
                    adventureCards,
                    card => renderFieldCard(card, player)
                )
            })}

            ${renderBoardZone({
                code: "H",
                label: "手札",
                className: "play-zone--hand",
                content: renderAdaptiveFan(
                    player.zones.hand.cards,
                    card => isLocal
                        ? renderCard(card, player)
                        : renderHiddenHandCard()
                ),
                count: player.zones.hand.cards.length
            })}

            ${renderBoardZone({
                code: "I",
                label: "メインデッキ",
                className: "play-zone--deck",
                content: renderPile({
                    cards: player.zones.deck.cards,
                    label: "MAIN DECK",
                    hidden: true,
                    player
                })
            })}
        </article>
    `;
}

function renderGrowthPicker() {
    if (
        context.gameState.phase !== GamePhaseTypes.GROWTH ||
        context.gameState.ended ||
        (
            networkRole !== null &&
            getCurrentPlayer()?.id !== getLocalPlayer()?.id
        )
    ) {
        growthPickerMinimized = false;
        return "";
    }
    if (growthPickerMinimized) {
        return "";
    }
    const player = getCurrentPlayer();
    return `
        <section class="growth-picker" aria-label="冒険者デッキ選択">
            <header>
                <span>冒険者デッキ</span>
                <strong>育成するカードを選択</strong>
            </header>
            <div class="growth-picker__actions">
                <button
                    type="button"
                    class="button growth-picker__minimize"
                    data-action="minimize-growth-picker"
                >最小化</button>
                <button
                    class="button button--primary growth-picker__advance"
                    data-action="advance-phase"
                >次のフェイズへ</button>
            </div>
            ${renderSpread(
                player.zones.adventureDeck.cards,
                card => renderGrowthCard(card, player)
            )}
        </section>
    `;
}

function renderCardBrowser() {
    if (openCardBrowser === null) {
        return "";
    }
    const player = context.gameState.getPlayer(
        openCardBrowser.playerId
    );
    if (
        player === null ||
        player.id !== getLocalPlayer()?.id ||
        ![
            ZoneTypes.ADVENTURE_DECK,
            ZoneTypes.GRAVEYARD
        ].includes(openCardBrowser.zoneType)
    ) {
        openCardBrowser = null;
        return "";
    }
    const zone = player.zones.getZone(openCardBrowser.zoneType);
    const label = openCardBrowser.zoneType === ZoneTypes.ADVENTURE_DECK
        ? "冒険者デッキ"
        : "墓地";

    return `
        <section class="card-browser" aria-label="${label}一覧">
            <header class="card-browser__header">
                <div>
                    <span>${escapeHtml(player.name)}</span>
                    <strong>${label}一覧</strong>
                    <small>${zone.cards.length}枚</small>
                </div>
                <button
                    type="button"
                    class="button card-browser__close"
                    data-action="close-card-browser"
                >閉じる</button>
            </header>
            <div class="card-browser__cards">
                ${renderSpread(
                    zone.cards,
                    card => renderStaticCard(card, player, {
                        revealFaceDown: true
                    })
                )}
            </div>
        </section>
    `;
}

function renderLogPanel() {
    if (!logExpanded) {
        return "";
    }
    const entries = messages.length > 0
        ? messages
        : ["ゲームを準備しました。"];

    return `
        <section class="log-panel" aria-label="ゲームログ">
            <header class="log-panel__header">
                <div>
                    <span>LOG</span>
                    <strong>ゲームログ</strong>
                    <small>${entries.length}件</small>
                </div>
                <button
                    type="button"
                    class="button"
                    data-action="toggle-log"
                >閉じる</button>
            </header>
            <ol class="log-panel__list">
                ${entries.map((message, index) => `
                    <li>
                        <span>${entries.length - index}</span>
                        <p>${escapeHtml(message)}</p>
                    </li>
                `).join("")}
            </ol>
        </section>
    `;
}

function renderControls() {
    const gameState = context.gameState;

    const pendingSelection = gameState.pendingSelections[0] ?? null;
    if (pendingSelection !== null) {
        if (pendingSelection.pending === true) {
            return `<span class="hint">対戦相手が選択を行っています。</span>`;
        }
        const selected = selectedCandidateIds.get(pendingSelection.id) ??
            new Set();
        const candidateCards = pendingSelection.candidates.map(
            candidate => findSelectionCard(candidate)
        );
        const directCardSelection =
            candidateCards.length > 0 &&
            candidateCards.every(card =>
                card !== null &&
                [
                    ZoneTypes.HAND,
                    ZoneTypes.FIELD,
                    ZoneTypes.RESOURCE
                ].includes(card.zone)
            );
        if (directCardSelection) {
            return `
                <div class="selection-panel selection-panel--board">
                    <strong>${escapeHtml(pendingSelection.prompt)}</strong>
                    <span class="selection-panel__progress">
                        選択中 ${selected.size} / ${
                            pendingSelection.min === pendingSelection.max
                                ? pendingSelection.max
                                : `${pendingSelection.min}〜${pendingSelection.max}`
                        }
                    </span>
                    <span class="hint">盤面の光っているカードを直接クリックしてください。</span>
                    <button
                        class="button button--primary"
                        data-action="resolve-selection"
                        data-request-id="${pendingSelection.id}"
                        data-player-id="${pendingSelection.playerId}"
                        ${selected.size < pendingSelection.min ||
                            selected.size > pendingSelection.max
                            ? "disabled"
                            : ""}
                    >選択を確定</button>
                </div>
            `;
        }
        return `
            <div class="selection-panel">
                <strong>${escapeHtml(pendingSelection.prompt)}</strong>
                ${pendingSelection.candidates.map(candidate => {
                    const selectedOrder =
                        [...selected].indexOf(candidate.id);
                    const orderLabel = selectedOrder === -1
                        ? ""
                        : `${selectedOrder + 1}. `;
                    return `
                    <button
                        class="button ${selected.has(candidate.id)
                            ? "button--primary"
                            : ""}"
                        data-action="toggle-selection"
                        data-request-id="${pendingSelection.id}"
                        data-candidate-id="${candidate.id}"
                    >${orderLabel}${escapeHtml(candidate.name ?? candidate.cardId ?? candidate.id)}</button>
                `;
                }).join("")}
                <button
                    class="button button--primary"
                    data-action="resolve-selection"
                    data-request-id="${pendingSelection.id}"
                    data-player-id="${pendingSelection.playerId}"
                    ${selected.size < pendingSelection.min ||
                        selected.size > pendingSelection.max
                        ? "disabled"
                        : ""}
                >選択を確定</button>
            </div>
        `;
    }

    if (!gameState.started) {
        if (networkRole !== null) {
            const localPlayer = getLocalPlayer();
            const isFirstPlayer = getCurrentPlayer()?.id === localPlayer?.id;
            return `
                ${isFirstPlayer ? `
                    <button class="button button--primary" data-action="begin-game">
                        マリガンを終了してゲーム開始
                    </button>
                ` : `<span class="hint">プレイヤー1のゲーム開始を待っています。</span>`}
                <button class="button" data-action="mulligan" data-player-id="${localPlayer.id}">
                    自分の手札をマリガン
                </button>
            `;
        }
        return `
            <button class="button button--primary" data-action="begin-game">
                マリガンを終了してゲーム開始
            </button>
            ${gameState.players.map(player => `
                <button class="button" data-action="mulligan" data-player-id="${player.id}">
                    ${escapeHtml(player.name)}がマリガン
                </button>
            `).join("")}
        `;
    }

    if (gameState.ended) {
        const names = gameState.winnerIds
            .map(id => gameState.getPlayer(id)?.name ?? id)
            .join("、");
        return `
            <strong>${gameState.winnerIds.length > 1
                ? `引き分け：${names}`
                : `${names}の勝利`}</strong>
            <span class="hint">レベル11到達によりゲームが終了しました。</span>
        `;
    }


    const preparationPlayer = getQuestPreparationPlayer();
    if (preparationPlayer !== null) {
        if (
            networkRole !== null &&
            preparationPlayer.id !== getLocalPlayer()?.id
        ) {
            return `<span class="hint">${escapeHtml(preparationPlayer.name)}の依頼準備を待っています。</span>`;
        }
        return `
            <button
                class="button button--primary"
                data-action="pass-quest-preparation"
                data-player-id="${preparationPlayer.id}"
            >${preparationPlayer.name}が依頼準備を終了</button>
            <span class="hint">
                ${preparationPlayer.name}は場のアイテムを任意の回数使用してからパスできます。
            </span>
        `;
    }

    if (
        gameState.phase === GamePhaseTypes.QUEST &&
        gameState.questPhase?.stage === QuestPhaseStages.PARTICIPATION
    ) {
        if (
            networkRole !== null &&
            getCurrentPlayer()?.id !== getLocalPlayer()?.id
        ) {
            return `<span class="hint">対戦相手の参加宣言を待っています。</span>`;
        }
        return `
            <button
                class="button button--primary"
                data-action="complete-quest-participation"
            >全依頼への参加宣言を終了</button>
            <span class="hint">参加する依頼をすべて選んでから終了してください。終了後は追加できません。</span>
        `;
    }

    if (
        gameState.phase === GamePhaseTypes.QUEST &&
        gameState.questPhase?.stage === QuestPhaseStages.SELECT_QUEST &&
        gameState.questPhase.resolvableQuestInstanceIds.length > 0
    ) {
        return `<span class="hint">次に処理する依頼書を1件選び、依頼準備を開始してください。</span>`;
    }

    return `
        <span class="hint">
            ${networkRole !== null &&
                getCurrentPlayer()?.id !== getLocalPlayer()?.id
                ? "対戦相手の操作を待っています。"
                : gameState.phase === GamePhaseTypes.MAIN
                ? "光っているイベントカードを使用できます。"
                : "フェイズを進めてメインフェイズへ移動します。"}
        </span>
        ${networkRole !== null &&
            getCurrentPlayer()?.id !== getLocalPlayer()?.id
            ? ""
            : `
                <button class="button button--primary" data-action="advance-phase">
                    次のフェイズへ
                </button>
            `}
    `;
}

function createStarterDeckDraft() {
    return {
        version: 1,
        name: "マイデッキ",
        mainDeck: [...gameData.starterDeck],
        adventureDeck: [...gameData.starterAdventureDeck]
    };
}

function normalizeDeckData(value) {
    if (!value || typeof value !== "object") {
        throw new Error("デッキデータの形式が正しくありません。");
    }
    const mainDeck = value.mainDeck;
    const adventureDeck = value.adventureDeck;
    if (!Array.isArray(mainDeck) || !Array.isArray(adventureDeck)) {
        throw new Error("メインデッキと冒険者デッキを指定してください。");
    }
    const unknownId = [...mainDeck, ...adventureDeck].find(
        cardId => !cardDefinitionMap.has(cardId)
    );
    if (unknownId !== undefined) {
        throw new Error(`未登録のカードIDです：${unknownId}`);
    }
    return {
        version: 1,
        name: typeof value.name === "string" && value.name.trim() !== ""
            ? value.name.trim().slice(0, 40)
            : "名称未設定デッキ",
        mainDeck: [...mainDeck],
        adventureDeck: [...adventureDeck]
    };
}

function loadSavedDeck() {
    try {
        const saved = localStorage.getItem(DECK_STORAGE_KEY);
        return saved === null
            ? null
            : normalizeDeckData(JSON.parse(saved));
    } catch (error) {
        console.warn("保存済みデッキを読み込めませんでした。", error);
        return null;
    }
}

function getDeckValidation(draft = deckDraft) {
    const validator = new DeckValidator();
    const resolve = cardIds => cardIds.map(
        cardId => cardDefinitionMap.get(cardId)
    );
    const mainDeck = validator.validateMainDeck(
        resolve(draft.mainDeck)
    );
    const adventureDeck = validator.validateAdventureDeck(
        resolve(draft.adventureDeck)
    );
    return {
        valid: mainDeck.valid && adventureDeck.valid,
        mainDeck,
        adventureDeck
    };
}

function formatDeckError(error) {
    switch (error.code) {
        case "DECK_TOO_SMALL":
            return `メインデッキが${error.minimum}枚未満です（現在${error.actual}枚）`;
        case "INVALID_DECK_SIZE":
            return `冒険者デッキは${error.expected}枚必要です（現在${error.actual}枚）`;
        case "TOO_MANY_COPIES":
            return `同名カードが上限${error.maximum}枚を超えています`;
        case "INVALID_ADVENTURER_COUNT":
            return `冒険者カードは${error.expected}枚必要です（現在${error.actual}枚）`;
        case "INVALID_CARD_TYPE_FOR_DECK":
            return "投入先がカード種別と一致していません";
        default:
            return "デッキ構成に不正な項目があります";
    }
}

function getDefinitionDetailLines(definition) {
    const lines = [];
    const requirements = getRequirementLabels(definition.useRequirements);
    const participation = getRequirementLabels(
        definition.participationRequirements
    );
    if (definition.tags.length > 0) {
        lines.push(["タグ", definition.tags.join("・")]);
    }
    if (definition.type === CardTypes.ADVENTURER) {
        lines.push([
            "基礎能力",
            formatAbilityValues(definition.baseStats).join("・")
        ]);
    }
    if (definition.grantedTags.length > 0) {
        lines.push(["付与タグ", definition.grantedTags.join("・")]);
    }
    if (requirements.length > 0) {
        lines.push(["使用条件", requirements.join("・")]);
    }
    if (participation.length > 0) {
        lines.push(["参加条件", participation.join("・")]);
    }
    const stats = formatAbilityValues(
        definition.statModifiers,
        { signed: true }
    );
    if (stats.length > 0) {
        lines.push(["能力修正", stats.join("・")]);
    }
    const activeStats = formatAbilityValues(
        definition.activeQuestModifiers,
        { signed: true }
    );
    if (activeStats.length > 0) {
        lines.push(["依頼中修正", activeStats.join("・")]);
    }
    if (definition.type === CardTypes.QUEST) {
        lines.push([
            "達成条件",
            formatAbilityValues(definition.questRequirements).join("・") ||
                "なし"
        ]);
        lines.push(["ダメージ", definition.questDamage]);
        lines.push([
            "成功報酬",
            `リソース${definition.questRewardResources}`
        ]);
    }
    return lines;
}

function renderDeckCardDetail(definition) {
    if (!definition) {
        return `
            <aside class="card-detail card-detail--empty">
                <div class="card-detail__image">
                    <span class="card-detail__type">CARD DETAIL</span>
                    <span class="card-detail__symbol" aria-hidden="true">◇</span>
                </div>
                <div class="card-detail__text">
                    <span class="card-detail__eyebrow">CARD DETAIL</span>
                    <h2>カードを選択</h2>
                    <p>デッキまたは検索結果のカードを選択すると詳細を表示します。</p>
                </div>
            </aside>
        `;
    }
    const typeClass = definition.type.toLowerCase().replaceAll("_", "-");
    const imagePath = definition.imagePath ?? CARD_IMAGE_PLACEHOLDER;
    const metadata = [];
    if (definition.type !== CardTypes.ADVENTURER) {
        metadata.push(`コスト ${definition.cost}`);
    }
    if (definition.levelGain > 0) {
        metadata.push(`成長 +${definition.levelGain}`);
    }
    if (definition.adventureAbilityType) {
        metadata.push(definition.adventureAbilityType);
    }
    const detailLines = getDefinitionDetailLines(definition);
    return `
        <aside class="card-detail">
            <div class="card-detail__image card-detail__image--${typeClass}">
                <img
                    class="card-detail__artwork"
                    src="${escapeHtml(imagePath)}"
                    alt="${escapeHtml(definition.name)}"
                    draggable="false"
                >
            </div>
            <div class="card-detail__text">
                <span class="card-detail__eyebrow">${escapeHtml(CARD_TYPE_LABELS[definition.type])}</span>
                <h2>${escapeHtml(definition.name)}</h2>
                ${metadata.length === 0 ? "" : `
                    <div class="card-detail__metadata">
                        ${metadata.map(value => `<span>${escapeHtml(value)}</span>`).join("")}
                    </div>
                `}
                <div class="card-detail__copy">
                    ${definition.text.map(text => `<p>${escapeHtml(text)}</p>`).join("")}
                    ${detailLines.map(([label, value]) => `
                        <p><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</p>
                    `).join("")}
                </div>
            </div>
        </aside>
    `;
}

function groupDeckCards(cardIds) {
    const groups = new Map();
    for (const cardId of cardIds) {
        groups.set(cardId, (groups.get(cardId) ?? 0) + 1);
    }
    return [...groups.entries()].map(([cardId, count]) => ({
        definition: cardDefinitionMap.get(cardId),
        count
    }));
}

function getNameCopyCount(definition) {
    return deckDraft[getDeckDestination(definition)]
        .map(cardId => cardDefinitionMap.get(cardId))
        .filter(candidate => candidate?.nameKey === definition.nameKey)
        .length;
}

function getDeckDestination(definition) {
    return DeckRules.MAIN_DECK_CARD_TYPES.includes(definition.type)
        ? "mainDeck"
        : "adventureDeck";
}

function canAddDeckCard(definition) {
    const destination = getDeckDestination(definition);
    const maxCopies = destination === "mainDeck"
        ? DeckRules.MAIN_DECK_MAX_COPIES
        : DeckRules.ADVENTURE_DECK_MAX_COPIES;
    if (getNameCopyCount(definition) >= maxCopies) {
        return { allowed: false, reason: `同名カードは${maxCopies}枚までです` };
    }
    if (
        destination === "adventureDeck" &&
        deckDraft.adventureDeck.length >= DeckRules.ADVENTURE_DECK_SIZE
    ) {
        return { allowed: false, reason: "冒険者デッキは15枚までです" };
    }
    if (
        definition.type === CardTypes.ADVENTURER &&
        deckDraft.adventureDeck.some(cardId =>
            cardDefinitionMap.get(cardId)?.type === CardTypes.ADVENTURER
        )
    ) {
        return { allowed: false, reason: "冒険者カードは1枚までです" };
    }
    return { allowed: true, reason: "" };
}

function renderDeckList(cardIds, deckKey) {
    const groups = groupDeckCards(cardIds);
    if (groups.length === 0) {
        return `<p class="deck-zone__empty">カードがありません。</p>`;
    }
    return `
        <div class="deck-card-list">
            ${groups.map(({ definition, count }) => `
                <article class="deck-card-row">
                    <button
                        type="button"
                        class="deck-card-row__card"
                        data-action="select-deck-card"
                        data-card-id="${escapeHtml(definition.id)}"
                        aria-label="${escapeHtml(definition.name)}の詳細を表示"
                    >
                        <img
                            src="${escapeHtml(definition.imagePath ?? CARD_IMAGE_PLACEHOLDER)}"
                            alt=""
                            draggable="false"
                        >
                        <span>
                            <strong>${escapeHtml(definition.name)}</strong>
                            <small>${escapeHtml(CARD_TYPE_LABELS[definition.type])}</small>
                        </span>
                    </button>
                    <strong class="deck-card-row__count">×${count}</strong>
                    <button
                        type="button"
                        class="deck-card-row__remove"
                        data-action="remove-deck-card"
                        data-deck-key="${deckKey}"
                        data-card-id="${escapeHtml(definition.id)}"
                        aria-label="${escapeHtml(definition.name)}を1枚外す"
                    >−</button>
                </article>
            `).join("")}
        </div>
    `;
}

function getFilteredDefinitions() {
    const query = deckFilters.query.trim().toLocaleLowerCase("ja");
    return gameData.cardDefinitions.filter(definition => {
        const destination = getDeckDestination(definition);
        if (
            deckFilters.destination !== "ALL" &&
            destination !== deckFilters.destination
        ) {
            return false;
        }
        if (
            deckFilters.type !== "ALL" &&
            definition.type !== deckFilters.type
        ) {
            return false;
        }
        if (query === "") {
            return true;
        }
        const searchable = [
            definition.id,
            definition.name,
            CARD_TYPE_LABELS[definition.type],
            ...definition.tags,
            ...definition.text
        ].join(" ").toLocaleLowerCase("ja");
        return searchable.includes(query);
    });
}

function renderSearchResults() {
    const definitions = getFilteredDefinitions();
    if (definitions.length === 0) {
        return `<p class="deck-zone__empty">条件に一致するカードはありません。</p>`;
    }
    return `
        <div class="deck-search-results__grid">
            ${definitions.map(definition => {
                const addition = canAddDeckCard(definition);
                return `
                    <article class="deck-search-card">
                        <button
                            type="button"
                            class="deck-search-card__preview"
                            data-action="select-deck-card"
                            data-card-id="${escapeHtml(definition.id)}"
                            aria-label="${escapeHtml(definition.name)}の詳細を表示"
                        >
                            <img
                                src="${escapeHtml(definition.imagePath ?? CARD_IMAGE_PLACEHOLDER)}"
                                alt=""
                                draggable="false"
                            >
                            <strong>${escapeHtml(definition.name)}</strong>
                            <small>${escapeHtml(CARD_TYPE_LABELS[definition.type])}</small>
                        </button>
                        <button
                            type="button"
                            class="button deck-search-card__add"
                            data-action="add-deck-card"
                            data-card-id="${escapeHtml(definition.id)}"
                            ${addition.allowed ? "" : `disabled title="${escapeHtml(addition.reason)}"`}
                        >追加</button>
                    </article>
                `;
            }).join("")}
        </div>
    `;
}

function renderHome() {
    const savedDeck = loadSavedDeck();
    app.innerHTML = `
        <div class="home-screen">
            <section class="home-hero">
                <p class="eyebrow">ADVENTURE TCG</p>
                <h1>冒険者たちの物語を始めよう</h1>
                <p>ホーム画面は仮実装です。今後、世界観・お知らせ・対戦メニューを追加します。</p>
            </section>
            <nav class="home-menu" aria-label="メインメニュー">
                <button type="button" class="home-menu__card" data-action="start-test-play">
                    <span>TEST PLAY</span>
                    <strong>テストプレイ</strong>
                    <small>${savedDeck ? `保存中：「${escapeHtml(savedDeck.name)}」を使用` : "スターターデッキを使用"}</small>
                </button>
                <button type="button" class="home-menu__card" data-action="open-deck-builder">
                    <span>DECK</span>
                    <strong>デッキ構築</strong>
                    <small>カードを検索し、2種類のデッキを編集</small>
                </button>
                <button type="button" class="home-menu__card" data-action="open-p2p">
                    <span>ONLINE</span>
                    <strong>対戦</strong>
                    <small>ルームIDまたは接続コードでP2P対戦</small>
                </button>
            </nav>
            <p class="home-screen__status">${escapeHtml(deckNotice)}</p>
        </div>
    `;
}

function getNetworkDeck() {
    return loadSavedDeck() ?? createStarterDeckDraft();
}

function getCardCatalogSignature() {
    const source = JSON.stringify(gameData.cardDefinitions);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `CATALOG_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getNetworkStatusLabel() {
    const labels = {
        OFFLINE: "未接続",
        GATHERING: "接続情報を作成中",
        WAITING_ANSWER: "参加者を待っています",
        CONNECTING: "接続中",
        ICE_CHECKING: "通信経路を確認中",
        CHANNEL_OPEN: "デッキ情報を確認中",
        CONNECTED: "接続済み",
        DISCONNECTED: "接続が切れました",
        CLOSED: "終了しました",
        CANCELLED: "キャンセルしました",
        ERROR: "通信エラー",
        INVALID_MESSAGE: "不正な通信を受信"
    };
    return labels[networkStatus] ?? networkStatus;
}

function renderP2PLobby() {
    const savedDeck = loadSavedDeck();
    const deckLabel = savedDeck
        ? `保存デッキ「${escapeHtml(savedDeck.name)}」`
        : "スターターデッキ";
    const mode = networkLobby.mode;
    const roomSignaling = networkLobby.signalingMode === "ROOM";
    const connectionBusy = [
        "GATHERING",
        "WAITING_ANSWER",
        "CONNECTING",
        "ICE_CHECKING"
    ].includes(networkStatus);
    const canRetry = networkStatus === "ERROR" && mode !== null;
    app.innerHTML = `
        <div class="p2p-screen">
            <header class="p2p-header">
                <button type="button" class="button" data-action="go-home">ホームへ戻る</button>
                <div>
                    <p class="eyebrow">P2P MATCH</p>
                    <h1>通信対戦</h1>
                </div>
                <span class="p2p-status p2p-status--${networkStatus.toLowerCase()}">
                    ${escapeHtml(getNetworkStatusLabel())}
                </span>
            </header>

            ${mode === null ? `
                <section class="p2p-choice">
                    <h2>対戦の始め方を選択</h2>
                    <p>使用デッキ：${deckLabel}</p>
                    <div class="p2p-method" aria-label="接続方法">
                        <button type="button" class="button ${roomSignaling ? "button--primary" : ""}" data-action="p2p-set-signaling" data-signaling-mode="ROOM">ルームID</button>
                        <button type="button" class="button ${roomSignaling ? "" : "button--primary"}" data-action="p2p-set-signaling" data-signaling-mode="MANUAL">手動コード</button>
                    </div>
                    <div class="p2p-role-options">
                        <button type="button" class="p2p-choice__card" data-action="p2p-host">
                            <span>PLAYER 1</span>
                            <strong>対戦を募集する</strong>
                            <small>${roomSignaling
                                ? "ルームIDを相手へ送り、参加を待ちます。"
                                : "募集コードを相手へ送り、返された参加コードを入力します。"}</small>
                        </button>
                        <button type="button" class="p2p-choice__card" data-action="p2p-guest">
                            <span>PLAYER 2</span>
                            <strong>対戦へ参加する</strong>
                            <small>相手から受け取った${roomSignaling ? "ルームID" : "募集コード"}を入力します。</small>
                        </button>
                    </div>
                </section>
            ` : `
                <section class="p2p-connect" aria-label="P2P接続設定">
                    <div class="p2p-connect__steps">
                        <span>${mode === "HOST" ? "対戦を募集" : "対戦へ参加"}</span>
                        <h2>${mode === "HOST"
                            ? `${roomSignaling ? "ルームID" : "募集コード"}を相手へ送ってください`
                            : `相手の${roomSignaling ? "ルームID" : "募集コード"}を入力してください`}</h2>
                        <p>${roomSignaling
                            ? "ルームの有効期限は10分です。接続後、各自のデッキはホスト側で構築条件を検証します。"
                            : "接続コードにはカード内容は含まれません。接続後、各自のデッキはホスト側で構築条件を検証します。"}</p>
                    </div>

                    ${mode === "HOST" ? `
                        <label class="p2p-code-field">
                            <span>${roomSignaling ? "ルームID" : "1. 募集コード"}</span>
                            <textarea id="p2p-local-code" readonly placeholder="作成中…">${escapeHtml(networkLobby.offerCode)}</textarea>
                        </label>
                        <button type="button" class="button" data-action="p2p-copy-code" ${networkLobby.offerCode ? "" : "disabled"}>${roomSignaling ? "ルームID" : "募集コード"}をコピー</button>
                        ${roomSignaling ? "" : `
                            <label class="p2p-code-field">
                                <span>2. 相手から返された参加コード</span>
                                <textarea id="p2p-remote-code" placeholder="参加コードを貼り付け"></textarea>
                            </label>
                            <button type="button" class="button button--primary" data-action="p2p-accept-answer" ${networkLobby.offerCode ? "" : "disabled"}>参加コードを確定</button>
                        `}
                    ` : `
                        <label class="p2p-code-field">
                            <span>${roomSignaling ? "ルームID" : "1. 相手から受け取った募集コード"}</span>
                            <textarea id="p2p-remote-code" placeholder="${roomSignaling ? "ルームIDを入力" : "募集コードを貼り付け"}"></textarea>
                        </label>
                        <button type="button" class="button button--primary" data-action="p2p-create-answer">${roomSignaling ? "ルームへ参加" : "参加コードを作成"}</button>
                        ${roomSignaling ? "" : `
                            <label class="p2p-code-field">
                                <span>2. 作成した参加コード</span>
                                <textarea id="p2p-local-code" readonly placeholder="募集コードを読み込むと表示されます">${escapeHtml(networkLobby.answerCode)}</textarea>
                            </label>
                            <button type="button" class="button" data-action="p2p-copy-code" ${networkLobby.answerCode ? "" : "disabled"}>参加コードをコピー</button>
                        `}
                    `}

                    <footer>
                        <div class="p2p-feedback">
                            <p>${escapeHtml(networkLobby.notice)}</p>
                            ${networkLobby.diagnostic
                                ? `<small>診断: ${escapeHtml(networkLobby.diagnostic)}</small>`
                                : ""}
                        </div>
                        <div class="p2p-footer-actions">
                            ${connectionBusy
                                ? `<button type="button" class="button" data-action="p2p-cancel">接続をキャンセル</button>`
                                : ""}
                            ${canRetry
                                ? `<button type="button" class="button button--primary" data-action="p2p-retry">再試行</button>`
                                : ""}
                            <button type="button" class="button" data-action="p2p-reset">役割選択へ戻る</button>
                        </div>
                    </footer>
                </section>
            `}

            <aside class="p2p-notes">
                <h2>接続について</h2>
                <ul>
                    <li>通信はWebRTCで暗号化され、ゲーム状態はホストが管理します。</li>
                    <li>${roomSignaling
                        ? "ルームIDは招待する対戦相手だけへ共有してください。"
                        : "接続コードには通信接続情報が含まれるため、対戦相手以外へ公開しないでください。"}</li>
                    <li>相手の手札・リソース・冒険者デッキは公開状態から除外されます。</li>
                    <li>初版では切断後の再接続と観戦には対応していません。</li>
                    <li>ネットワーク環境によっては直接接続できない場合があります。</li>
                </ul>
            </aside>
        </div>
    `;
}

function closeNetworkSession() {
    networkOperationId++;
    networkSession?.close();
    networkSession = null;
    networkRole = null;
    networkStatus = "OFFLINE";
    localPlayerId = null;
    for (const pending of pendingNetworkCommands.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("P2P対戦を終了しました。"));
    }
    pendingNetworkCommands.clear();
}

function handleNetworkStatus(status) {
    networkStatus = status;
    if (status === "CHANNEL_OPEN" && networkRole === "GUEST") {
        networkSession.send({
            type: "HELLO",
            deck: getNetworkDeck(),
            catalogSignature: getCardCatalogSignature()
        });
    }
    if (
        currentScreen === SCREEN_TYPES.GAME &&
        ["DISCONNECTED", "ERROR", "INVALID_MESSAGE"].includes(status)
    ) {
        addMessage(`P2P通信：${getNetworkStatusLabel()}`);
    }
    render();
}

async function createNetworkSession(
    role,
    signalingMode = networkLobby.signalingMode
) {
    networkSession?.close();
    const operationId = ++networkOperationId;
    networkRole = role;
    networkStatus = "CONNECTING";
    networkConfigPromise ??= loadNetworkConfig();
    const networkConfig = await networkConfigPromise;
    if (networkConfig.source === "DEFAULT") {
        networkConfigPromise = null;
    }
    if (operationId !== networkOperationId) {
        const error = new Error("接続処理をキャンセルしました。");
        error.code = "CONNECTION_CANCELLED";
        throw error;
    }
    if (networkConfig.warning) {
        networkLobby.diagnostic = networkConfig.warning;
    }
    const peerSession = new WebRtcPeerSession({
        role,
        iceServers: networkConfig.iceServers,
        iceTransportPolicy: networkConfig.iceTransportPolicy,
        iceGatheringTimeoutMs: networkConfig.iceGatheringTimeoutMs,
        connectionTimeoutMs: networkConfig.connectionTimeoutMs,
        onStatus: handleNetworkStatus,
        onDiagnostic: error => {
            networkLobby.diagnostic = formatNetworkDiagnostic(error);
            render();
        },
        onMessage: message => {
            handleNetworkMessage(message).catch(error => {
                console.error(error);
                networkLobby.notice = error.message;
                networkStatus = "ERROR";
                render();
            });
        }
    });
    networkSession = new P2PConnectionCoordinator({
        peerSession,
        signalingProvider: signalingMode === "ROOM"
            ? new RoomSignalingProvider({
                requestTimeoutMs: networkConfig.requestTimeoutMs
            })
            : new ManualSignalingProvider()
    });
    return networkSession;
}

function formatNetworkDiagnostic(error) {
    const code = error?.code ?? "UNKNOWN_ERROR";
    const status = error?.status ? ` / HTTP ${error.status}` : "";
    const retry = error?.retryAfterSeconds
        ? ` / ${error.retryAfterSeconds}秒後に再試行`
        : "";
    return `${code}${status}${retry}`;
}

function applyNetworkError(error) {
    networkStatus = error?.code === "CONNECTION_CANCELLED"
        ? "CANCELLED"
        : "ERROR";
    networkLobby.notice = error?.message ?? "接続に失敗しました。";
    networkLobby.diagnostic = formatNetworkDiagnostic(error);
}

async function waitForRoomResponse(session, roomId) {
    try {
        await session.acceptResponse(roomId);
        if (networkSession !== session) {
            return;
        }
        networkStatus = "CONNECTING";
        networkLobby.notice = "参加者を確認しました。接続しています。";
        await session.waitForConnection();
    } catch (error) {
        if (networkSession !== session) {
            return;
        }
        applyNetworkError(error);
    }
    render();
}

function applyGuestPublicState(publicState) {
    context = createPublicGameContext(
        publicState,
        cardDefinitionMap
    );
}

function sendGuestState() {
    if (
        networkRole === "HOST" &&
        networkSession?.channel?.readyState === "open" &&
        context?.commandGateway
    ) {
        networkSession.send({
            type: "STATE",
            publicState: context.commandGateway.getPublicState(2)
        });
    }
}

function sendNetworkCommand(command) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingNetworkCommands.delete(command.id);
            reject(new Error("相手からの応答がタイムアウトしました。"));
        }, 12000);
        pendingNetworkCommands.set(command.id, {
            resolve,
            reject,
            timeoutId
        });
        try {
            networkSession.send({
                type: "COMMAND",
                command
            });
        } catch (error) {
            clearTimeout(timeoutId);
            pendingNetworkCommands.delete(command.id);
            reject(error);
        }
    });
}

async function handleNetworkMessage(message) {
    if (message.type === "HELLO" && networkRole === "HOST") {
        if (message.catalogSignature !== getCardCatalogSignature()) {
            networkSession.send({
                type: "ERROR",
                reason: "カードデータのバージョンが対戦相手と一致しません。"
            });
            return;
        }
        const guestDeck = normalizeDeckData(message.deck);
        if (!getDeckValidation(guestDeck).valid) {
            networkSession.send({
                type: "ERROR",
                reason: "参加者のデッキが構築条件を満たしていません。"
            });
            return;
        }
        const hostDeck = getNetworkDeck();
        context = await new GameBootstrap().createGame({
            player1DeckList: hostDeck.mainDeck,
            player1AdventureDeckList: hostDeck.adventureDeck,
            player2DeckList: guestDeck.mainDeck,
            player2AdventureDeckList: guestDeck.adventureDeck
        });
        resetGameUiState();
        localPlayerId = 1;
        currentScreen = SCREEN_TYPES.GAME;
        networkStatus = "CONNECTED";
        addMessage("P2P対戦を開始しました。プレイヤー1がホストです。");
        networkSession.send({
            type: "WELCOME",
            playerId: 2,
            catalogSignature: getCardCatalogSignature(),
            publicState: context.commandGateway.getPublicState(2)
        });
        render();
        return;
    }
    if (message.type === "WELCOME" && networkRole === "GUEST") {
        if (message.catalogSignature !== getCardCatalogSignature()) {
            throw new Error(
                "カードデータのバージョンがホストと一致しません。"
            );
        }
        localPlayerId = message.playerId;
        applyGuestPublicState(message.publicState);
        resetGameUiState();
        currentScreen = SCREEN_TYPES.GAME;
        networkStatus = "CONNECTED";
        addMessage("P2P対戦へ参加しました。あなたはプレイヤー2です。");
        render();
        return;
    }
    if (message.type === "COMMAND" && networkRole === "HOST") {
        const result = context.commandGateway.execute(message.command, {
            authenticatedPlayerId: 2
        });
        networkSession.send({
            type: "COMMAND_RESULT",
            result
        });
        if (result.accepted) {
            addMessage("プレイヤー2の操作を受信しました。");
        }
        render();
        return;
    }
    if (message.type === "COMMAND_RESULT" && networkRole === "GUEST") {
        const pending = pendingNetworkCommands.get(
            message.result?.commandId
        );
        if (!pending) {
            return;
        }
        clearTimeout(pending.timeoutId);
        pendingNetworkCommands.delete(message.result.commandId);
        applyGuestPublicState(message.result.publicState);
        pending.resolve(message.result);
        return;
    }
    if (message.type === "STATE" && networkRole === "GUEST") {
        applyGuestPublicState(message.publicState);
        render();
        return;
    }
    if (message.type === "ERROR") {
        throw new Error(message.reason ?? "P2P通信でエラーが発生しました。");
    }
}

function renderDeckBuilder() {
    const validation = getDeckValidation();
    const errors = [
        ...validation.mainDeck.errors,
        ...validation.adventureDeck.errors
    ];
    const selected = cardDefinitionMap.get(selectedDeckCardId) ?? null;
    app.innerHTML = `
        <div class="deck-builder-screen">
            <section class="deck-builder-actions" aria-label="デッキ操作">
                <div class="deck-builder-actions__title">
                    <button type="button" class="button" data-action="go-home">ホームへ戻る</button>
                    <label>
                        <span>デッキ名</span>
                        <input id="deck-name" maxlength="40" value="${escapeHtml(deckDraft.name)}">
                    </label>
                </div>
                <div class="deck-builder-actions__buttons">
                    <button type="button" class="button" data-action="reset-deck">スターターに戻す</button>
                    <button type="button" class="button" data-action="import-deck">インポート</button>
                    <input id="deck-import-file" hidden type="file" accept="application/json,.json">
                    <button type="button" class="button" data-action="export-deck">エクスポート</button>
                    <button
                        type="button"
                        class="button button--primary"
                        data-action="save-deck"
                        ${validation.valid ? "" : "disabled"}
                    >保存</button>
                </div>
                <div class="deck-builder-actions__validation ${validation.valid ? "is-valid" : "is-invalid"}">
                    <strong>${validation.valid ? "構築条件を満たしています" : "構築条件を確認してください"}</strong>
                    <span>${errors.length === 0
                        ? "保存するとテストプレイのプレイヤー1に反映されます。"
                        : errors.map(formatDeckError).join("／")}</span>
                    ${deckNotice ? `<em>${escapeHtml(deckNotice)}</em>` : ""}
                </div>
            </section>

            <section class="deck-builder-detail" aria-label="カード詳細">
                ${renderDeckCardDetail(selected)}
            </section>

            <section class="deck-builder-main" aria-label="メインデッキ">
                <header>
                    <div><span>MAIN DECK</span><h2>メインデッキ</h2></div>
                    <strong>${deckDraft.mainDeck.length}枚 <small>40枚以上</small></strong>
                </header>
                ${renderDeckList(deckDraft.mainDeck, "mainDeck")}
            </section>

            <section class="deck-builder-adventure" aria-label="冒険者デッキ">
                <header>
                    <div><span>ADVENTURE DECK</span><h2>冒険者デッキ</h2></div>
                    <strong>${deckDraft.adventureDeck.length}/15枚 <small>冒険者1枚</small></strong>
                </header>
                ${renderDeckList(deckDraft.adventureDeck, "adventureDeck")}
            </section>

            <section class="deck-builder-filters" aria-label="カード検索条件">
                <div><span>CARD SEARCH</span><h2>カード検索</h2></div>
                <label>
                    <span>カード名・本文</span>
                    <input id="deck-search-query" value="${escapeHtml(deckFilters.query)}" placeholder="キーワードを入力">
                </label>
                <label>
                    <span>投入先</span>
                    <select id="deck-search-destination">
                        <option value="ALL" ${deckFilters.destination === "ALL" ? "selected" : ""}>すべて</option>
                        <option value="mainDeck" ${deckFilters.destination === "mainDeck" ? "selected" : ""}>メインデッキ</option>
                        <option value="adventureDeck" ${deckFilters.destination === "adventureDeck" ? "selected" : ""}>冒険者デッキ</option>
                    </select>
                </label>
                <label>
                    <span>カード種別</span>
                    <select id="deck-search-type">
                        <option value="ALL">すべて</option>
                        ${Object.values(CardTypes).map(type => `
                            <option value="${type}" ${deckFilters.type === type ? "selected" : ""}>${escapeHtml(CARD_TYPE_LABELS[type])}</option>
                        `).join("")}
                    </select>
                </label>
                <button type="button" class="button button--primary" data-action="apply-deck-filters">検索</button>
            </section>

            <section class="deck-builder-results" aria-label="カード検索結果">
                <header>
                    <h2>検索結果</h2>
                    <span>${getFilteredDefinitions().length}種類</span>
                </header>
                ${renderSearchResults()}
            </section>
        </div>
    `;
}

function renderGame() {
    const gameState = context.gameState;
    const currentPlayer = getCurrentPlayer();
    const localPlayer = getLocalPlayer();
    const opponent = gameState.players.find(
        player => player.id !== localPlayer?.id
    ) ?? null;
    const detailOwner = gameState.getPlayer(activeCardDetailOwnerId) ??
        localPlayer;

    app.innerHTML = `
        <div class="game-table ${zoneGuidesVisible
            ? "game-table--zone-guides"
            : ""}">
            <div class="card-detail-dock">
                ${renderCardDetail(detailOwner)}
            </div>

            <div class="player-board-slot player-board-slot--opponent">
                <div class="player-board-rotation">
                    ${opponent ? renderPlayer(opponent) : ""}
                </div>
            </div>

            <section class="table-center" aria-label="ゲーム進行">
                <div class="game-status">
                    <span>TURN <strong>${gameState.turn}</strong></span>
                    <span>PHASE <strong>${PHASE_LABELS[gameState.phase] ?? gameState.phase}</strong></span>
                    <span>ACTIVE <strong>${escapeHtml(currentPlayer.name)}</strong></span>
                </div>
                <div class="control-bar">
                    ${renderControls()}
                </div>
                <div class="table-tools">
                    ${networkRole === null ? "" : `
                        <span class="network-game-status" title="P2P通信状態">
                            ${networkRole === "HOST" ? "HOST" : "GUEST"}
                            <b>${escapeHtml(getNetworkStatusLabel())}</b>
                        </span>
                    `}
                    <button
                        type="button"
                        class="zone-guide-toggle"
                        data-action="go-home"
                        aria-label="ホームへ戻る"
                    >HOME</button>
                    ${gameState.phase === GamePhaseTypes.GROWTH &&
                        growthPickerMinimized
                        ? `
                            <button
                                type="button"
                                class="zone-guide-toggle"
                                data-action="restore-growth-picker"
                                aria-label="育成一覧を再表示"
                            >育成</button>
                        `
                        : ""}
                    <button
                        type="button"
                        class="zone-guide-toggle"
                        data-action="toggle-zone-guides"
                        aria-pressed="${zoneGuidesVisible}"
                        aria-label="ゾーンガイドを${zoneGuidesVisible ? "隠す" : "表示する"}"
                    >GUIDE</button>
                    <button
                        type="button"
                        class="log-toggle"
                        data-action="toggle-log"
                        aria-expanded="${logExpanded}"
                        aria-label="ゲームログを${logExpanded ? "閉じる" : "開く"}"
                    >
                        <span>LOG</span>
                        <strong>${messages.length}</strong>
                    </button>
                </div>
            </section>

            <div class="player-board-slot player-board-slot--local">
                ${renderPlayer(localPlayer)}
            </div>

            ${renderGrowthPicker()}
            ${renderCardBrowser()}
            ${renderLogPanel()}
        </div>
    `;
}

function render() {
    if (currentScreen === SCREEN_TYPES.HOME) {
        renderHome();
        return;
    }
    if (currentScreen === SCREEN_TYPES.DECK_BUILDER) {
        renderDeckBuilder();
        return;
    }
    if (currentScreen === SCREEN_TYPES.P2P) {
        renderP2PLobby();
        return;
    }
    renderGame();
}

function resetGameUiState() {
    messages.length = 0;
    selectedCandidateIds.clear();
    selectedCardDetails.clear();
    nextLocalCommandId = 1;
    activeCardDetailOwnerId = null;
    openCardBrowser = null;
    logExpanded = false;
    growthPickerMinimized = false;
}

async function startTestPlay() {
    const savedDeck = loadSavedDeck();
    if (savedDeck !== null && !getDeckValidation(savedDeck).valid) {
        throw new Error(
            "保存済みデッキが現在の構築条件を満たしていません。デッキ構築画面で確認してください。"
        );
    }
    app.innerHTML = `
        <section class="loading-panel">
            <p class="eyebrow">TEST PLAY</p>
            <h1>テスト卓を準備しています</h1>
            <p>カードとデッキを読み込んでいます。</p>
        </section>
    `;
    context = await new GameBootstrap().createGame({
        player1DeckList: savedDeck?.mainDeck ?? null,
        player1AdventureDeckList: savedDeck?.adventureDeck ?? null
    });
    resetGameUiState();
    addMessage("2人分の初期手札5枚とリソース3枚を準備しました。");
    currentScreen = SCREEN_TYPES.GAME;
    render();
}

function downloadDeck() {
    const data = JSON.stringify(deckDraft, null, 2);
    const url = URL.createObjectURL(new Blob([data], {
        type: "application/json"
    }));
    const link = document.createElement("a");
    const safeName = deckDraft.name.replace(/[\\/:*?"<>|]/g, "_");
    link.href = url;
    link.download = `${safeName || "deck"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    deckNotice = "デッキJSONをエクスポートしました。";
}

async function handleApplicationAction(button) {
    const action = button.dataset.action;
    if (action === "go-home") {
        closeNetworkSession();
        currentScreen = SCREEN_TYPES.HOME;
        context = null;
        deckNotice = "";
        networkLobby = {
            mode: null,
            signalingMode: "ROOM",
            offerCode: "",
            answerCode: "",
            notice: "",
            diagnostic: "",
            lastRemoteCode: ""
        };
        render();
        return true;
    }
    if (action === "open-p2p") {
        currentScreen = SCREEN_TYPES.P2P;
        networkLobby = {
            mode: null,
            signalingMode: "ROOM",
            offerCode: "",
            answerCode: "",
            notice: "",
            diagnostic: "",
            lastRemoteCode: ""
        };
        render();
        return true;
    }
    if (action === "p2p-reset") {
        const signalingMode = networkLobby.signalingMode;
        closeNetworkSession();
        networkLobby = {
            mode: null,
            signalingMode,
            offerCode: "",
            answerCode: "",
            notice: "",
            diagnostic: "",
            lastRemoteCode: ""
        };
        currentScreen = SCREEN_TYPES.P2P;
        render();
        return true;
    }
    if (action === "p2p-cancel") {
        networkOperationId++;
        networkSession?.cancel?.();
        networkSession = null;
        networkRole = null;
        networkStatus = "CANCELLED";
        networkLobby.notice = "接続処理をキャンセルしました。";
        networkLobby.diagnostic = "CONNECTION_CANCELLED";
        render();
        return true;
    }
    if (action === "p2p-retry") {
        const { mode, signalingMode, lastRemoteCode } = networkLobby;
        closeNetworkSession();
        networkLobby.diagnostic = "";
        if (mode === "HOST") {
            networkLobby.mode = null;
            networkLobby.signalingMode = signalingMode;
            return handleApplicationAction({
                dataset: { action: "p2p-host" }
            });
        }
        networkLobby = {
            mode: "GUEST",
            signalingMode,
            offerCode: "",
            answerCode: "",
            notice: "ルームへ再接続します。",
            diagnostic: "",
            lastRemoteCode
        };
        render();
        const remoteInput = document.querySelector("#p2p-remote-code");
        if (remoteInput) {
            remoteInput.value = lastRemoteCode ?? "";
        }
        return handleApplicationAction({
            dataset: { action: "p2p-create-answer" }
        });
    }
    if (action === "p2p-set-signaling") {
        networkLobby.signalingMode = button.dataset.signalingMode === "MANUAL"
            ? "MANUAL"
            : "ROOM";
        render();
        return true;
    }
    if (action === "p2p-host") {
        const signalingMode = networkLobby.signalingMode;
        const roomSignaling = signalingMode === "ROOM";
        networkLobby = {
            mode: "HOST",
            signalingMode,
            offerCode: "",
            answerCode: "",
            notice: `${roomSignaling ? "ルーム" : "募集コード"}を作成しています。`,
            diagnostic: "",
            lastRemoteCode: ""
        };
        networkStatus = "GATHERING";
        render();
        try {
            const session = await createNetworkSession("HOST", signalingMode);
            networkStatus = "GATHERING";
            networkLobby.offerCode = await session.createInvitation();
            networkStatus = "WAITING_ANSWER";
            networkLobby.notice = roomSignaling
                ? "ルームIDを相手へ送り、そのまま参加をお待ちください。"
                : "募集コードを相手へ送り、返された参加コードを入力してください。";
            if (roomSignaling) {
                void waitForRoomResponse(
                    session,
                    networkLobby.offerCode
                );
            }
        } catch (error) {
            applyNetworkError(error);
        }
        render();
        return true;
    }
    if (action === "p2p-guest") {
        const signalingMode = networkLobby.signalingMode;
        const roomSignaling = signalingMode === "ROOM";
        closeNetworkSession();
        networkLobby = {
            mode: "GUEST",
            signalingMode,
            offerCode: "",
            answerCode: "",
            notice: `${roomSignaling ? "ルームID" : "募集コード"}を入力してください。`,
            diagnostic: "",
            lastRemoteCode: ""
        };
        currentScreen = SCREEN_TYPES.P2P;
        render();
        return true;
    }
    if (action === "p2p-create-answer") {
        const code = document.querySelector("#p2p-remote-code")
            ?.value.trim();
        if (!code) {
            networkLobby.notice = `${
                networkLobby.signalingMode === "ROOM"
                    ? "ルームID"
                    : "募集コード"
            }を入力してください。`;
            render();
            return true;
        }
        networkLobby.lastRemoteCode = code;
        networkLobby.diagnostic = "";
        try {
            const session = await createNetworkSession(
                "GUEST",
                networkLobby.signalingMode
            );
            networkStatus = "GATHERING";
            networkLobby.answerCode = await session.createResponse(code);
            networkStatus = "CONNECTING";
            networkLobby.notice = networkLobby.signalingMode === "ROOM"
                ? "参加情報を送信しました。ホストへ接続しています。"
                : "参加コードを相手へ返してください。相手が確定すると接続します。";
            if (networkLobby.signalingMode === "ROOM") {
                void session.waitForConnection().catch(error => {
                    if (networkSession !== session) {
                        return;
                    }
                    applyNetworkError(error);
                    render();
                });
            }
        } catch (error) {
            applyNetworkError(error);
        }
        render();
        return true;
    }
    if (action === "p2p-accept-answer") {
        const code = document.querySelector("#p2p-remote-code")
            ?.value.trim();
        if (!code) {
            networkLobby.notice = "参加コードを入力してください。";
            render();
            return true;
        }
        try {
            await networkSession.acceptResponse(code);
            networkStatus = "CONNECTING";
            networkLobby.notice = "対戦相手へ接続しています。";
            await networkSession.waitForConnection();
        } catch (error) {
            applyNetworkError(error);
        }
        render();
        return true;
    }
    if (action === "p2p-copy-code") {
        const code = document.querySelector("#p2p-local-code")?.value;
        try {
            await navigator.clipboard.writeText(code ?? "");
            networkLobby.notice = networkLobby.signalingMode === "ROOM"
                ? "ルームIDをコピーしました。"
                : "接続コードをコピーしました。";
        } catch {
            networkLobby.notice =
                "自動コピーできませんでした。コードを選択してコピーしてください。";
        }
        render();
        return true;
    }
    if (action === "open-deck-builder") {
        deckDraft = loadSavedDeck() ?? createStarterDeckDraft();
        selectedDeckCardId = deckDraft.mainDeck[0] ??
            deckDraft.adventureDeck[0] ?? null;
        deckNotice = "";
        currentScreen = SCREEN_TYPES.DECK_BUILDER;
        render();
        return true;
    }
    if (action === "start-test-play") {
        try {
            await startTestPlay();
        } catch (error) {
            console.error(error);
            deckNotice = `テストプレイを開始できません：${error.message}`;
            currentScreen = SCREEN_TYPES.HOME;
            render();
        }
        return true;
    }
    if (currentScreen !== SCREEN_TYPES.DECK_BUILDER) {
        return false;
    }

    switch (action) {
        case "select-deck-card": {
            selectedDeckCardId = button.dataset.cardId;
            break;
        }
        case "add-deck-card": {
            const definition = cardDefinitionMap.get(button.dataset.cardId);
            const addition = canAddDeckCard(definition);
            if (!addition.allowed) {
                deckNotice = addition.reason;
                break;
            }
            deckDraft[getDeckDestination(definition)].push(definition.id);
            selectedDeckCardId = definition.id;
            deckNotice = `「${definition.name}」を追加しました。`;
            break;
        }
        case "remove-deck-card": {
            const cardIds = deckDraft[button.dataset.deckKey];
            const index = cardIds.lastIndexOf(button.dataset.cardId);
            if (index >= 0) {
                const definition = cardDefinitionMap.get(cardIds[index]);
                cardIds.splice(index, 1);
                selectedDeckCardId = definition.id;
                deckNotice = `「${definition.name}」を1枚外しました。`;
            }
            break;
        }
        case "reset-deck": {
            const name = deckDraft.name;
            deckDraft = createStarterDeckDraft();
            deckDraft.name = name;
            selectedDeckCardId = deckDraft.mainDeck[0];
            deckNotice = "スターターデッキの内容に戻しました。";
            break;
        }
        case "save-deck": {
            if (!getDeckValidation().valid) {
                deckNotice = "構築条件を満たしていないため保存できません。";
                break;
            }
            localStorage.setItem(
                DECK_STORAGE_KEY,
                JSON.stringify(deckDraft)
            );
            deckNotice = `「${deckDraft.name}」を保存しました。`;
            break;
        }
        case "export-deck": {
            downloadDeck();
            break;
        }
        case "import-deck": {
            document.querySelector("#deck-import-file")?.click();
            return true;
        }
        case "apply-deck-filters": {
            const query = document.querySelector("#deck-search-query");
            const type = document.querySelector("#deck-search-type");
            const destination = document.querySelector(
                "#deck-search-destination"
            );
            deckFilters = {
                query: query?.value ?? "",
                type: type?.value ?? "ALL",
                destination: destination?.value ?? "ALL"
            };
            deckNotice = "";
            break;
        }
        default:
            return false;
    }
    render();
    return true;
}

app.addEventListener("input", event => {
    if (currentScreen !== SCREEN_TYPES.DECK_BUILDER) {
        return;
    }
    if (event.target.id === "deck-name") {
        deckDraft.name = event.target.value.slice(0, 40);
    }
    if (event.target.id === "deck-search-query") {
        deckFilters.query = event.target.value;
    }
});

app.addEventListener("change", async event => {
    if (
        currentScreen !== SCREEN_TYPES.DECK_BUILDER ||
        event.target.id !== "deck-import-file"
    ) {
        return;
    }
    const [file] = event.target.files;
    if (!file) {
        return;
    }
    try {
        deckDraft = normalizeDeckData(JSON.parse(await file.text()));
        selectedDeckCardId = deckDraft.mainDeck[0] ??
            deckDraft.adventureDeck[0] ?? null;
        deckNotice = `「${deckDraft.name}」を読み込みました。保存前に構築条件を確認してください。`;
    } catch (error) {
        deckNotice = `インポートできません：${error.message}`;
    }
    render();
});

app.addEventListener("click", async event => {
    const applicationButton = event.target.closest("[data-action]");
    if (
        applicationButton &&
        await handleApplicationAction(applicationButton)
    ) {
        return;
    }
    if (currentScreen !== SCREEN_TYPES.GAME) {
        return;
    }
    const detailTarget = event.target.closest(
        "[data-detail-owner-id]"
    );
    if (detailTarget) {
        const ownerId = Number(detailTarget.dataset.detailOwnerId);
        activeCardDetailOwnerId = ownerId;
        selectedCardDetails.clear();
        if (detailTarget.dataset.detailCardInstanceId) {
            selectedCardDetails.set(ownerId, {
                kind: "CARD",
                instanceId: detailTarget.dataset.detailCardInstanceId
            });
        } else if (detailTarget.dataset.detailHiddenLabel) {
            selectedCardDetails.set(ownerId, {
                kind: "HIDDEN",
                label: detailTarget.dataset.detailHiddenLabel,
                key: detailTarget.dataset.detailHiddenKey
            });
        }
    }

    const button = event.target.closest("[data-action]");
    if (!button) {
        if (detailTarget) {
            render();
        }
        return;
    }

    try {
        switch (button.dataset.action) {
            case "minimize-growth-picker": {
                growthPickerMinimized = true;
                break;
            }

            case "restore-growth-picker": {
                growthPickerMinimized = false;
                break;
            }

            case "toggle-zone-guides": {
                zoneGuidesVisible = !zoneGuidesVisible;
                break;
            }

            case "toggle-log": {
                logExpanded = !logExpanded;
                break;
            }

            case "open-card-browser": {
                const playerId = Number(button.dataset.playerId);
                const zoneType = button.dataset.zoneType;
                if (
                    playerId !== getLocalPlayer()?.id ||
                    ![
                        ZoneTypes.ADVENTURE_DECK,
                        ZoneTypes.GRAVEYARD
                    ].includes(zoneType)
                ) {
                    throw new Error(
                        "この領域のカード一覧は確認できません。"
                    );
                }
                openCardBrowser = {
                    playerId,
                    zoneType
                };
                break;
            }

            case "close-card-browser": {
                openCardBrowser = null;
                break;
            }

            case "toggle-selection": {
                const requestId = button.dataset.requestId;
                const request = context.gameState.pendingSelections.find(
                    candidate => candidate.id === requestId
                );
                const candidate = request.candidates.find(item =>
                    String(item.id) === button.dataset.candidateId
                );
                const selected = selectedCandidateIds.get(requestId) ??
                    new Set();
                if (selected.has(candidate.id)) {
                    selected.delete(candidate.id);
                } else if (selected.size < request.max) {
                    selected.add(candidate.id);
                }
                selectedCandidateIds.set(requestId, selected);
                break;
            }

            case "resolve-selection": {
                const requestId = button.dataset.requestId;
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const selected = [
                    ...(selectedCandidateIds.get(requestId) ?? [])
                ];
                const result = await executeCommand(
                    GameCommandTypes.RESOLVE_SELECTION,
                    player.id,
                    { requestId, selectedIds: selected }
                );
                selectedCandidateIds.delete(requestId);
                addMessage(result.accepted
                    ? "選択を確定し、処理を続行しました。"
                    : `選択を解決できません：${result.reason}`
                );
                break;
            }

            case "begin-game": {
                const result = await executeCommand(
                    GameCommandTypes.BEGIN_GAME,
                    getCurrentPlayer().id
                );
                addMessage(result.accepted
                    ? "ゲームを開始しました。"
                    : `ゲームを開始できません：${result.reason}`
                );
                break;
            }

            case "mulligan": {
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const result = await executeCommand(
                    GameCommandTypes.MULLIGAN,
                    player.id
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が手札を引き直しました。`
                        : `${player.name}は依頼書を持っているためマリガンできません。`
                );
                break;
            }

            case "advance-phase": {
                const player = getCurrentPlayer();
                const result = await executeCommand(
                    GameCommandTypes.ADVANCE_PHASE,
                    player.id
                );
                addMessage(result.accepted
                    ? `${player.name}：${PHASE_LABELS[context.gameState.phase]}フェイズへ進みました。`
                    : `フェイズを進められません：${result.reason}`
                );
                break;
            }

            case "play-card": {
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const card = player.zones.hand.cards.find(
                    candidate =>
                        candidate.instanceId ===
                        button.dataset.cardInstanceId
                );
                const result = await executeCommand(
                    GameCommandTypes.PLAY_CARD,
                    player.id,
                    { cardInstanceId: card.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が「${card.name}」を使用しました。`
                        : `カードを使用できません：${result.reason}`
                );
                break;
            }

            case "play-growth-card": {
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const card = player.zones.adventureDeck.cards.find(
                    candidate =>
                        candidate.instanceId ===
                        button.dataset.cardInstanceId
                );
                const result = await executeCommand(
                    GameCommandTypes.PLAY_GROWTH_CARD,
                    player.id,
                    { cardInstanceId: card.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が「${card.name}」でレベル${player.adventurer.level}になりました。`
                        : `育成カードを使用できません：${result.reason}`
                );
                break;
            }

            case "activate-card": {
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const card = player.zones.field.cards.find(
                    candidate =>
                        candidate.instanceId ===
                        button.dataset.cardInstanceId
                );
                const result = await executeCommand(
                    GameCommandTypes.ACTIVATE_CARD,
                    player.id,
                    { cardInstanceId: card.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が「${card.name}」を起動しました。`
                        : `アイテムを起動できません：${result.reason}`
                );
                break;
            }

            case "activate-adventure-card": {
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const card = player.zones.field.cards.find(
                    candidate =>
                        candidate.instanceId ===
                        button.dataset.cardInstanceId
                );
                const result = await executeCommand(
                    GameCommandTypes.ACTIVATE_ADVENTURE_CARD,
                    player.id,
                    { cardInstanceId: card.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が「${card.name}」を使用しました。`
                        : `冒険者能力を使用できません：${result.reason}`
                );
                break;
            }

            case "join-quest": {
                const owner = context.gameState.getPlayer(
                    Number(button.dataset.ownerId)
                );
                const questCard = owner.zones.field.cards.find(
                    card =>
                        card.instanceId ===
                        button.dataset.cardInstanceId
                );
                const player = getCurrentPlayer();
                const result = await executeCommand(
                    GameCommandTypes.DECLARE_QUEST_PARTICIPATION,
                    player.id,
                    { questInstanceId: questCard.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が「${questCard.name}」へ参加しました。`
                        : `参加宣言できません：${result.reason}`
                );
                break;
            }

            case "complete-quest-participation": {
                const player = getCurrentPlayer();
                const result = await executeCommand(
                    GameCommandTypes.COMPLETE_QUEST_PARTICIPATION,
                    player.id
                );
                addMessage(result.accepted
                    ? "すべての依頼への参加宣言を確定しました。"
                    : `参加宣言を終了できません：${result.reason}`
                );
                break;
            }

            case "start-quest-preparation": {
                const owner = context.gameState.getPlayer(
                    Number(button.dataset.ownerId)
                );
                const questCard = owner.zones.field.cards.find(
                    card =>
                        card.instanceId ===
                        button.dataset.cardInstanceId
                );
                const actor = getCurrentPlayer();
                const result = await executeCommand(
                    GameCommandTypes.START_QUEST_PREPARATION,
                    actor.id,
                    { questInstanceId: questCard.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `「${questCard.name}」の依頼準備を開始しました。`
                        : `依頼準備を開始できません：${result.reason}`
                );
                break;
            }

            case "pass-quest-preparation": {
                const player = context.gameState.getPlayer(
                    Number(button.dataset.playerId)
                );
                const result = await executeCommand(
                    GameCommandTypes.PASS_QUEST_PREPARATION,
                    player.id
                );
                addMessage(
                    result.accepted
                        ? `${player.name}が依頼準備を終了しました。`
                        : `依頼準備を終了できません：${result.reason}`
                );
                break;
            }

            case "resolve-quest": {
                const owner = context.gameState.getPlayer(
                    Number(button.dataset.ownerId)
                );
                const questCard = owner.zones.field.cards.find(
                    card =>
                        card.instanceId ===
                        button.dataset.cardInstanceId
                );
                const actor = getCurrentPlayer();
                const result = await executeCommand(
                    GameCommandTypes.RESOLVE_QUEST,
                    actor.id,
                    { questInstanceId: questCard.instanceId }
                );
                addMessage(
                    result.accepted
                        ? `「${questCard.name}」：${questCard.questResolution?.outcome ?? "解決中"}`
                        : `依頼を解決できません：${result.reason}`
                );
                break;
            }
        }
    } catch (error) {
        console.error(error);
        addMessage(`エラー：${error.message}`);
    }

    render();
});

async function initialize() {
    try {
        gameData = await new GameDataLoader().load();
        cardDefinitionMap = new Map(
            gameData.cardDefinitions.map(definition => [
                definition.id,
                definition
            ])
        );
        render();
    } catch (error) {
        console.error(error);
        app.innerHTML = `
            <section class="loading-panel loading-panel--error">
                <p class="eyebrow">STARTUP ERROR</p>
                <h1>ホーム画面を開始できませんでした</h1>
                <p>${escapeHtml(error.message)}</p>
                <p>このページはHTTPサーバー経由で開いてください。</p>
            </section>
        `;
    }
}

initialize();
