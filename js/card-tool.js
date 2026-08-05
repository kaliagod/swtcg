const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const fileList = document.querySelector("#file-list");
const convertButton = document.querySelector("#convert-button");
const messages = document.querySelector("#messages");
const summaryGrid = document.querySelector("#summary-grid");
const statusPill = document.querySelector("#status-pill");
const downloadAll = document.querySelector("#download-all");
const downloadTypes = document.querySelector("#download-types");

const selectedFiles = new Map();
let convertedCards = [];

function fileKey(file) {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function addFiles(files) {
    for (const file of files) {
        if (file.name.toLowerCase().endsWith(".xlsx")) {
            selectedFiles.set(fileKey(file), file);
        }
    }
    renderFiles();
}

function renderFiles() {
    fileList.replaceChildren();
    if (selectedFiles.size === 0) {
        fileList.innerHTML = '<p class="empty-state">まだファイルが選択されていません。</p>';
    } else {
        for (const [key, file] of selectedFiles) {
            const row = document.createElement("div");
            row.className = "file-row";
            const details = document.createElement("div");
            const name = document.createElement("strong");
            name.textContent = file.name;
            const size = document.createElement("small");
            size.textContent = `${(file.size / 1024).toFixed(1)} KB`;
            details.append(name, size);
            const remove = document.createElement("button");
            remove.className = "remove-file";
            remove.type = "button";
            remove.textContent = "削除";
            remove.addEventListener("click", () => {
                selectedFiles.delete(key);
                renderFiles();
            });
            row.append(details, remove);
            fileList.append(row);
        }
    }
    convertButton.disabled = selectedFiles.size === 0;
}

function setStatus(label, state = "") {
    statusPill.textContent = label;
    statusPill.className = `status-pill${state ? ` is-${state}` : ""}`;
}

function downloadJson(data, fileName) {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
        type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function renderResult(results) {
    const allErrors = results.flatMap(result => result.errors.map(error => ({
        ...error,
        fileName: result.fileName
    })));
    const allWarnings = results.flatMap(result => result.warnings.map(message => ({
        message,
        fileName: result.fileName
    })));
    const ids = new Map();
    convertedCards = [];
    for (const result of results) {
        for (const card of result.cards) {
            if (ids.has(card.id)) {
                allErrors.push({
                    fileName: result.fileName,
                    cardId: card.id,
                    message: `複数ファイル間でカードIDが重複しています（${ids.get(card.id)}）。`
                });
            } else {
                ids.set(card.id, result.fileName);
                convertedCards.push(card);
            }
        }
    }

    const typeCount = new Set(convertedCards.map(card => card.type)).size;
    summaryGrid.innerHTML = `
        <div><span>カード</span><strong>${convertedCards.length}</strong></div>
        <div><span>カテゴリ</span><strong>${typeCount}</strong></div>
        <div><span>エラー</span><strong>${allErrors.length}</strong></div>
    `;
    messages.replaceChildren();
    for (const error of allErrors) {
        const row = document.createElement("div");
        row.className = "message-row is-error";
        row.textContent = [
            error.fileName,
            error.sheet,
            error.row ? `${error.row}行` : null,
            error.cardId,
            error.message
        ].filter(Boolean).join(" · ");
        messages.append(row);
    }
    for (const warning of allWarnings) {
        const row = document.createElement("div");
        row.className = "message-row";
        row.textContent = `${warning.fileName} · ${warning.message}`;
        messages.append(row);
    }
    if (allErrors.length === 0 && allWarnings.length === 0) {
        messages.innerHTML = convertedCards.length > 0
            ? '<p class="empty-state">検証エラーはありません。JSONを保存できます。</p>'
            : '<p class="empty-state">出力対象のカードがありません。サンプル行を複製し、enabledをTRUEへ変更してください。</p>';
    }

    const canDownload = convertedCards.length > 0 && allErrors.length === 0;
    downloadAll.disabled = !canDownload;
    downloadTypes.disabled = !canDownload;
    if (allErrors.length) {
        setStatus("要修正", "error");
    } else if (convertedCards.length === 0) {
        setStatus("カードなし");
    } else {
        setStatus("変換完了", "success");
    }
}

async function convert() {
    convertButton.disabled = true;
    downloadAll.disabled = true;
    downloadTypes.disabled = true;
    setStatus("変換中", "working");
    messages.innerHTML = '<p class="empty-state">Excelを読み込み、カード定義を検証しています…</p>';
    try {
        const results = [];
        for (const file of selectedFiles.values()) {
            const response = await fetch("/api/card-tool/convert", {
                method: "POST",
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "X-File-Name": encodeURIComponent(file.name)
                },
                body: file
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(`${file.name}: ${data.error ?? "変換に失敗しました。"}`);
            }
            data.fileName = decodeURIComponent(data.fileName);
            results.push(data);
        }
        renderResult(results);
    } catch (error) {
        convertedCards = [];
        summaryGrid.innerHTML = '<div><span>カード</span><strong>—</strong></div><div><span>カテゴリ</span><strong>—</strong></div><div><span>エラー</span><strong>1</strong></div>';
        messages.innerHTML = `<div class="message-row is-error"></div>`;
        messages.firstElementChild.textContent = error.message;
        setStatus("失敗", "error");
    } finally {
        convertButton.disabled = selectedFiles.size === 0;
    }
}

fileInput.addEventListener("change", () => addFiles(fileInput.files));
for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.add("is-dragging");
    });
}
for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.remove("is-dragging");
    });
}
dropZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
convertButton.addEventListener("click", convert);
downloadAll.addEventListener("click", () => downloadJson(convertedCards, "cards.json"));
downloadTypes.addEventListener("click", () => {
    const byType = new Map();
    for (const card of convertedCards) {
        const cards = byType.get(card.type) ?? [];
        cards.push(card);
        byType.set(card.type, cards);
    }
    for (const [type, cards] of byType) {
        downloadJson(cards, `cards-${type.toLowerCase()}.json`);
    }
});
