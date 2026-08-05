import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
);

async function pathExists(candidate) {
    try {
        await access(candidate);
        return true;
    } catch {
        return false;
    }
}

async function findBrowserExecutable() {
    const candidates = [
        process.env.UI_TEST_BROWSER_EXECUTABLE,
        process.platform === "win32"
            ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
            : null,
        process.platform === "win32"
            ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
            : null,
        process.platform === "win32"
            ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
            : null,
        process.platform === "win32"
            ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
            : null,
        process.platform === "darwin"
            ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            : null,
        process.platform === "darwin"
            ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
            : null,
        process.platform === "linux"
            ? "/usr/bin/google-chrome"
            : null,
        process.platform === "linux"
            ? "/usr/bin/microsoft-edge"
            : null,
        process.platform === "linux"
            ? "/usr/bin/chromium"
            : null,
        process.platform === "linux"
            ? "/usr/bin/chromium-browser"
            : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        "UIテスト用のEdgeまたはChromeが見つかりません。" +
        "UI_TEST_BROWSER_EXECUTABLEに実行ファイルのパスを指定してください。"
    );
}

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object"
                ? address.port
                : null;
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}

async function waitForServer(url, serverProcess) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (serverProcess.exitCode !== null) {
            throw new Error(
                `テスト用サーバーが終了しました。exitCode=${serverProcess.exitCode}`
            );
        }
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // 起動直後は接続できないため、短時間待って再試行する。
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("テスト用サーバーの起動待ちがタイムアウトしました。");
}

async function stopServer(serverProcess) {
    if (serverProcess.exitCode !== null) {
        return;
    }
    serverProcess.kill();
    await Promise.race([
        new Promise(resolve => serverProcess.once("exit", resolve)),
        new Promise(resolve => setTimeout(resolve, 2000))
    ]);
}

async function assertText(locator, expected) {
    assert.equal((await locator.textContent())?.trim(), expected);
}

async function assertPhase(page, expectedPhase) {
    const phase = page.locator(".game-status strong").nth(1);
    await assertText(phase, expectedPhase);
}

async function assertDisabledWithReason(
    button,
    page,
    expectedReason
) {
    assert.equal(await button.count(), 1);
    assert.equal(await button.isDisabled(), true);
    const reason = page.locator(
        ".card-detail-dock .card-detail__action-reason"
    );
    assert.ok(
        (await reason.textContent())?.includes(expectedReason),
        `使用不可理由に「${expectedReason}」が含まれていません。`
    );
}

async function advanceToGrowth(page) {
    await page.getByRole("button", {
        name: "マリガンを終了してゲーム開始",
        exact: true
    }).click();

    const progress = page.getByRole("region", {
        name: "ゲーム進行",
        exact: true
    });
    for (let step = 0; step < 2; step++) {
        await progress.getByRole("button", {
            name: "次のフェイズへ",
            exact: true
        }).click();
    }
}

async function waitForInputValue(locator, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await locator.inputValue();
        if (value.trim() !== "") {
            return value;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("接続コードの作成がタイムアウトしました。");
}

async function assertP2PRoleSelectionVisible(page) {
    const choiceBox = await page.locator(".p2p-choice").boundingBox();
    const methodBox = await page.locator(".p2p-method").boundingBox();
    const hostBox = await page.locator('[data-action="p2p-host"]').boundingBox();
    const guestBox = await page.locator('[data-action="p2p-guest"]').boundingBox();

    assert.ok(choiceBox && methodBox && hostBox && guestBox);
    const choiceBottom = choiceBox.y + choiceBox.height;
    for (const roleBox of [hostBox, guestBox]) {
        assert.ok(
            roleBox.y >= choiceBox.y &&
            roleBox.y + roleBox.height <= choiceBottom + 1,
            "P2Pの募集・参加ボタンは選択パネル内に表示される必要があります。"
        );
    }
    assert.ok(
        methodBox.height < choiceBox.height / 3,
        "接続方法ボタンが選択パネルを占有しすぎています。"
    );
}

async function runP2PBrowserFlow(
    browser,
    baseUrl,
    browserErrors,
    signalingMode
) {
    const host = await browser.newPage({
        viewport: { width: 1280, height: 720 }
    });
    const guest = await browser.newPage({
        viewport: { width: 1280, height: 720 }
    });
    for (const page of [host, guest]) {
        page.setDefaultTimeout(20000);
        page.on("pageerror", error => browserErrors.push(error.message));
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await page.locator('[data-action="open-p2p"]').click();
        if (signalingMode === "MANUAL") {
            await page.locator(
                '[data-signaling-mode="MANUAL"]'
            ).click();
        }
        await assertP2PRoleSelectionVisible(page);
    }

    await host.locator('[data-action="p2p-host"]').click();
    const offerCode = await waitForInputValue(
        host.locator("#p2p-local-code")
    );

    await guest.locator('[data-action="p2p-guest"]').click();
    await guest.locator("#p2p-remote-code").fill(offerCode);
    await guest.locator('[data-action="p2p-create-answer"]').click();
    let answerCode = "";
    if (signalingMode === "MANUAL") {
        answerCode = await waitForInputValue(
            guest.locator("#p2p-local-code")
        );
        await host.locator("#p2p-remote-code").fill(answerCode);
        await host.locator('[data-action="p2p-accept-answer"]').click();
    }

    const hostBoard = host.getByRole("article", {
        name: "プレイヤー1のプレイ領域",
        exact: true
    });
    const guestBoard = guest.getByRole("article", {
        name: "プレイヤー2のプレイ領域",
        exact: true
    });
    const connectionDeadline = Date.now() + 20000;
    while (
        Date.now() < connectionDeadline &&
        (
            await hostBoard.count() === 0 ||
            await guestBoard.count() === 0
        )
    ) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (
        await hostBoard.count() === 0 ||
        await guestBoard.count() === 0
    ) {
        const hostStatus = await host.locator(".p2p-status").textContent()
            .catch(() => "画面遷移済み");
        const guestStatus = await guest.locator(".p2p-status").textContent()
            .catch(() => "画面遷移済み");
        const hostNotice = await host.locator(".p2p-connect footer p")
            .textContent().catch(() => "");
        const guestNotice = await guest.locator(".p2p-connect footer p")
            .textContent().catch(() => "");
        let candidateSummary = "room-signaling";
        if (signalingMode === "MANUAL") {
            const offerDescription = JSON.parse(
                Buffer.from(offerCode, "base64").toString("utf8")
            ).description;
            const answerDescription = JSON.parse(
                Buffer.from(answerCode, "base64").toString("utf8")
            ).description;
            const offerCandidateCount = (
                offerDescription.sdp.match(/a=candidate:/g) ?? []
            ).length;
            const answerCandidateCount = (
                answerDescription.sdp.match(/a=candidate:/g) ?? []
            ).length;
            const candidateTypes = [
                ...offerDescription.sdp.matchAll(/ typ ([a-z]+)/g),
                ...answerDescription.sdp.matchAll(/ typ ([a-z]+)/g)
            ].map(match => match[1]).join(",");
            candidateSummary = `${offerCandidateCount}/${
                answerCandidateCount
            }:${candidateTypes}`;
        }
        throw new Error(
            `${signalingMode} P2P接続が完了しませんでした。host=${hostStatus}/${hostNotice} ` +
            `guest=${guestStatus}/${guestNotice} ` +
            `candidates=${candidateSummary} ` +
            `errors=${browserErrors.join(" | ")}`
        );
    }

    assert.equal(
        await host.locator(".network-game-status").textContent()
            .then(text => text.includes("HOST")),
        true
    );
    assert.equal(
        await guest.locator(".network-game-status").textContent()
            .then(text => text.includes("GUEST")),
        true
    );
    const guestOpponentHand = guest.getByRole("article", {
        name: "プレイヤー1のプレイ領域",
        exact: true
    }).getByRole("region", {
        name: "手札",
        exact: true
    });
    assert.equal(
        await guestOpponentHand.locator(".card--back").count(),
        5,
        "参加者側で相手の手札が伏せられていません。"
    );
    assert.equal(
        await guestOpponentHand.getByRole("button").count(),
        0,
        "参加者側から相手の手札を操作できてはいけません。"
    );

    await guest.getByRole("button", {
        name: "自分の手札をマリガン",
        exact: true
    }).click();
    const guestLogCount = guest.locator(".log-toggle strong");
    const commandDeadline = Date.now() + 12000;
    while (
        Date.now() < commandDeadline &&
        Number((await guestLogCount.textContent())?.trim()) < 2
    ) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(
        Number((await guestLogCount.textContent())?.trim()) >= 2,
        "参加者のコマンド応答が届きませんでした。"
    );

    const startButtonOptions = {
        name: "マリガンを終了してゲーム開始",
        exact: true
    };
    const hostStarts = await host.getByRole(
        "button",
        startButtonOptions
    ).count() > 0;
    const startingPage = hostStarts ? host : guest;
    const waitingPage = hostStarts ? guest : host;
    await startingPage.getByRole(
        "button",
        startButtonOptions
    ).click();
    const waitingPhase = waitingPage.locator(
        ".game-status strong"
    ).nth(1);
    const deadline = Date.now() + 12000;
    while (
        Date.now() < deadline &&
        (await waitingPhase.textContent())?.trim() !== "ターン開始"
    ) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await assertText(waitingPhase, "ターン開始");
    assert.equal(
        await waitingPage.getByRole("button", {
            name: "次のフェイズへ",
            exact: true
        }).count(),
        0,
        "参加者は相手ターンのフェイズを進められてはいけません。"
    );

    await host.close();
    await guest.close();
}

async function runUiTests() {
    const port = await getAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}/`;
    const browserExecutable = await findBrowserExecutable();
    const serverProcess = spawn(
        process.execPath,
        ["server.js"],
        {
            cwd: projectRoot,
            env: {
                ...process.env,
                PORT: String(port)
            },
            stdio: ["ignore", "pipe", "pipe"]
        }
    );
    let browser = null;

    try {
        await waitForServer(baseUrl, serverProcess);
        browser = await chromium.launch({
            executablePath: browserExecutable,
            headless: true,
            args: ["--disable-features=WebRtcHideLocalIpsWithMdns"]
        });
        const page = await browser.newPage({
            viewport: { width: 1280, height: 720 }
        });
        page.setDefaultTimeout(5000);
        const browserErrors = [];
        page.on("pageerror", error => {
            browserErrors.push(error.message);
        });
        page.on("console", message => {
            const sourceUrl = message.location().url ?? "";
            if (
                message.type() === "error" &&
                !sourceUrl.endsWith("/favicon.ico")
            ) {
                browserErrors.push(
                    sourceUrl.length > 0
                        ? `${message.text()} (${sourceUrl})`
                        : message.text()
                );
            }
        });

        await page.goto(baseUrl, { waitUntil: "networkidle" });

        assert.equal(
            await page.getByRole("heading", {
                name: "冒険者たちの物語を始めよう",
                exact: true
            }).count(),
            1
        );
        assert.equal(
            await page.locator('[data-action="open-p2p"]').isEnabled(),
            true
        );
        await page.locator('[data-action="open-p2p"]').click();
        assert.equal(
            await page.getByRole("heading", {
                name: "通信対戦",
                exact: true
            }).count(),
            1
        );
        assert.equal(
            await page.getByRole("button", {
                name: /対戦を募集する/
            }).count(),
            1
        );
        await page.getByRole("button", {
            name: "ホームへ戻る",
            exact: true
        }).click();

        await page.locator('[data-action="open-deck-builder"]').click();
        for (const regionName of [
            "デッキ操作",
            "カード詳細",
            "メインデッキ",
            "冒険者デッキ",
            "カード検索条件",
            "カード検索結果"
        ]) {
            assert.equal(
                await page.getByRole("region", {
                    name: regionName,
                    exact: true
                }).count(),
                1,
                `${regionName}が表示されていません。`
            );
        }
        await assertText(
            page.locator(".deck-builder-main header > strong"),
            "40枚 40枚以上"
        );
        await assertText(
            page.locator(".deck-builder-adventure header > strong"),
            "15/15枚 冒険者1枚"
        );

        await page.getByLabel("カード名・本文", {
            exact: true
        }).fill("冒険者の地図");
        await page.getByRole("button", {
            name: "検索",
            exact: true
        }).click();
        const searchResults = page.getByRole("region", {
            name: "カード検索結果",
            exact: true
        });
        await searchResults.getByRole("button", {
            name: "冒険者の地図の詳細を表示",
            exact: true
        }).click();
        await assertText(
            page.locator(".deck-builder-detail h2"),
            "冒険者の地図"
        );
        await searchResults.getByRole("button", {
            name: "追加",
            exact: true
        }).click();
        await assertText(
            page.locator(".deck-builder-main header > strong"),
            "41枚 40枚以上"
        );
        await page.getByRole("button", {
            name: "保存",
            exact: true
        }).click();
        assert.ok(
            (await page.locator(
                ".deck-builder-actions__validation"
            ).textContent())?.includes("マイデッキ")
        );
        await page.getByRole("button", {
            name: "ホームへ戻る",
            exact: true
        }).click();
        await page.locator('[data-action="start-test-play"]').click();

        const localBoard = page.locator(
            ".player-board-slot--local article"
        );
        const opponentBoard = page.locator(
            ".player-board-slot--opponent article"
        );
        await localBoard.waitFor({ state: "visible" });
        assert.equal(await localBoard.count(), 1);
        assert.equal(await opponentBoard.count(), 1);

        const hand = localBoard.getByRole("region", {
            name: "手札",
            exact: true
        });
        const handCards = hand.getByRole("button");
        assert.equal(await handCards.count(), 5);
        await handCards.first().click();
        await assertDisabledWithReason(
            page.locator(".card-detail-dock .card-detail__action"),
            page,
            "ゲーム開始後に使用できます"
        );

        await advanceToGrowth(page);
        await assertPhase(page, "育成");

        await page.getByRole("button", {
            name: "渾身の一撃の詳細を表示",
            exact: true
        }).click();
        await assertDisabledWithReason(
            page.locator(".card-detail-dock .card-detail__action"),
            page,
            "レベルが不足しています（必要2／現在1）"
        );

        const growthPicker = page.getByRole("region", {
            name: "冒険者デッキ選択",
            exact: true
        });
        await growthPicker.getByRole("button", {
            name: "最小化",
            exact: true
        }).click();
        assert.equal(await growthPicker.count(), 0);
        await page.getByRole("button", {
            name: "育成一覧を再表示",
            exact: true
        }).click();
        assert.equal(await growthPicker.count(), 1);

        await page.getByRole("button", {
            name: "探索の心得の詳細を表示",
            exact: true
        }).click();
        const availableGrowthAction = page.getByRole("button", {
            name: "このカードで育成",
            exact: true
        });
        assert.equal(await availableGrowthAction.isEnabled(), true);
        await availableGrowthAction.click();

        const resourceCards = localBoard.getByRole("region", {
            name: "リソース",
            exact: true
        }).getByRole("button", {
            name: "リソースカードの詳細を表示",
            exact: true
        });
        assert.equal(await resourceCards.count(), 3);
        await resourceCards.last().click();
        await page.getByRole("button", {
            name: "選択を確定",
            exact: true
        }).click();

        await assertText(
            localBoard.locator(".adventurer-card__level strong"),
            "2"
        );
        await assertText(
            localBoard.locator(
                ".play-zone--resource .play-zone__count"
            ),
            "2"
        );
        await assertText(
            localBoard.locator(
                ".play-zone--adventure-deck .card-pile__count"
            ),
            "13"
        );

        await page.getByRole("button", {
            name: "日々の鍛錬の詳細を表示",
            exact: true
        }).click();
        const detailCopy = page.locator(
            ".card-detail-dock .card-detail__copy"
        );
        const fixedAction = page.locator(
            ".card-detail-dock .card-detail__action"
        );
        const scrollMetrics = await detailCopy.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight
        }));
        assert.ok(
            scrollMetrics.scrollHeight > scrollMetrics.clientHeight,
            "長文カードの説明欄がスクロール可能である必要があります。"
        );
        const actionBeforeScroll = await fixedAction.boundingBox();
        await detailCopy.evaluate(element => {
            element.scrollTo({
                top: element.scrollHeight,
                behavior: "instant"
            });
        });
        const actionAfterScroll = await fixedAction.boundingBox();
        assert.equal(
            Math.round(actionAfterScroll.y),
            Math.round(actionBeforeScroll.y),
            "説明をスクロールしても使用ボタンは移動しません。"
        );

        await growthPicker.getByRole("button", {
            name: "次のフェイズへ",
            exact: true
        }).click();
        await assertPhase(page, "メイン");
        const mainHandCards = hand.getByRole("button");
        assert.ok(await mainHandCards.count() > 0);
        await mainHandCards.first().click();
        assert.equal(
            await page.getByRole("button", {
                name: "このカードを使用",
                exact: true
            }).isEnabled(),
            true
        );

        assert.deepEqual(
            browserErrors,
            [],
            `ブラウザエラーが発生しました: ${browserErrors.join(" | ")}`
        );

        await runP2PBrowserFlow(
            browser,
            baseUrl,
            browserErrors,
            "ROOM"
        );
        await runP2PBrowserFlow(
            browser,
            baseUrl,
            browserErrors,
            "MANUAL"
        );
        assert.deepEqual(
            browserErrors,
            [],
            `P2Pブラウザエラーが発生しました: ${browserErrors.join(" | ")}`
        );
    } finally {
        await browser?.close();
        await stopServer(serverProcess);
    }
}

runUiTests()
    .then(() => {
        console.log("UI basic operation tests: OK");
    })
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
