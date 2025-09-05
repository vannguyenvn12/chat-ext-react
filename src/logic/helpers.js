// src/logic/helpers.js
/* eslint-disable */

const POST = (type, payload) => window.postMessage({ type, payload }, "*");

function setNativeValue(el, value) {
    const lastValue = el.value;
    el.value = value;
    try { el._valueTracker?.setValue(lastValue); } catch { }
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertTextContentEditable(el, text, { append = false } = {}) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    if (append) {
        range.selectNodeContents(el);
        range.collapse(false);
    } else {
        try { document.execCommand("selectAll", false, null); } catch { }
        try { document.execCommand("delete", false, null); } catch { }
        range.selectNodeContents(el);
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);

    try { document.execCommand("insertText", false, text); } catch { }
    try { el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: text })); } catch { }
    try { el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); } catch { }

    try {
        const endRange = document.createRange();
        endRange.selectNodeContents(el);
        endRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(endRange);
    } catch { }
}

function pickInputBox() {
    const candidates = [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-message-author-role="user"]',
        'div[contenteditable="true"]',
        'form textarea[data-testid="prompt-textarea"]',
        'form textarea[aria-label*="message" i]',
        'form textarea[placeholder*="Message" i]',
        "form textarea",
    ];
    for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) return el;
    }
    return null;
}

function pickSubmitButton(inputEl) {
    const root = inputEl?.closest("form") || document;
    const candidates = [
        '[data-testid="send-button"]',
        'button[data-testid="send-button"]',
        'button[type="submit"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="Gửi" i]',
        "[data-testid=\"send-button\"] *",
    ];
    for (const sel of candidates) {
        const el = root.querySelector(sel);
        if (el) return el.closest("button") || el;
    }
    const any = Array.from(root.querySelectorAll("button")).find(
        (b) => b.offsetParent !== null
    );
    return any || null;
}

export function fillCurrentChat(text, { append = false } = {}) {
    const box = pickInputBox();
    if (!box) throw new Error("Không tìm thấy ô chat.");
    if (box.tagName?.toLowerCase() === "textarea") {
        const next = append ? (box.value || "") + text : text;
        setNativeValue(box, next);
        try { box.selectionStart = box.selectionEnd = box.value.length; } catch { }
    } else {
        insertTextContentEditable(box, text, { append });
    }
    box.focus();
    POST("askChatGPT:info", "Đã điền nội dung vào khung chat hiện tại.");
    return true;
}

export function sendCurrentChat() {
    const box = pickInputBox();
    if (!box) throw new Error("Không tìm thấy ô chat.");

    const btn = pickSubmitButton(box);
    if (btn) {
        const ariaDisabled = btn.getAttribute("aria-disabled");
        const disabled = btn.disabled || ariaDisabled === "true";
        if (!disabled) {
            btn.click();
            setTimeout(() => {
                const rect = btn.getBoundingClientRect();
                const opts = { bubbles: true, clientX: rect.left + 2, clientY: rect.top + 2 };
                btn.dispatchEvent(new MouseEvent("mousedown", opts));
                btn.dispatchEvent(new MouseEvent("mouseup", opts));
                btn.dispatchEvent(new MouseEvent("click", opts));
            }, 30);
        }
    }

    const form = box.closest("form");
    if (form && typeof form.requestSubmit === "function") {
        setTimeout(() => { try { form.requestSubmit(); } catch { } }, 50);
    } else if (form) {
        setTimeout(() => {
            try { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); } catch { }
        }, 50);
    }

    setTimeout(() => {
        const evs = [
            new KeyboardEvent("keydown", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }),
            new KeyboardEvent("keypress", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }),
            new KeyboardEvent("keyup", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }),
        ];
        box.focus();
        evs.forEach((e) => box.dispatchEvent(e));
        evs.forEach((e) => document.dispatchEvent(e));
    }, 75);

    POST("askChatGPT:info", "Đã cố gắng gửi tin nhắn (click/mouse/submit/enter).");
    return true;
}

export function sendToCurrentChat(text, opts = {}) {
    fillCurrentChat(text, opts);
    return sendCurrentChat();
}

// ========= Readers & high-level =========
const DEBUG = false;
const logD = (...args) => { if (DEBUG) console.debug("[ask/log]", ...args); };

function getAllTurns() {
    const sels = [
        "article[data-message-author-role]",
        '[data-testid^="conversation-turn-"]',
        "article",
    ];
    for (const s of sels) {
        const nodes = Array.from(document.querySelectorAll(s));
        if (nodes.length) return nodes;
    }
    return [];
}
function getAssistantTurns() {
    const sels = [
        '[data-message-author-role="assistant"]',
        '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
        'article[data-message-author-role="assistant"]',
        "article",
    ];
    for (const s of sels) {
        const nodes = Array.from(document.querySelectorAll(s));
        if (nodes.length) return nodes;
    }
    return [];
}
function getLastUserTurn() {
    const turns = getAllTurns();
    for (let i = turns.length - 1; i >= 0; i--) {
        const role = turns[i].getAttribute("data-message-author-role");
        if (role === "user") return turns[i];
    }
    return null;
}
function getAssistantArticlesAfter(userTurnEl) {
    if (!userTurnEl) return [];
    const turns = getAllTurns();
    const startIdx = turns.indexOf(userTurnEl);
    if (startIdx === -1) return [];
    const out = [];
    for (let i = startIdx + 1; i < turns.length; i++) {
        const role = turns[i].getAttribute("data-message-author-role");
        if (role === "user") break;
        if (role === "assistant") out.push(turns[i]);
    }
    return out;
}
function extractAssistantContent(turnEl, { as = "text" } = {}) {
    if (!turnEl) return "";
    const innerCandidates = [
        '[data-testid="markdown"]',
        '[data-role="message-content"]',
        "[data-message-id]",
        "[aria-live]",
        ".markdown.prose",
        ".prose",
        "article",
    ];
    for (const sel of innerCandidates) {
        const node = turnEl.querySelector(sel) || turnEl;
        if (as === "html") return (node.innerHTML || "").trim();
        return (node.innerText || node.textContent || "").trim();
    }
    return "";
}
async function waitTextStableOnTurn(turnEl, { quietMs = 1200, maxWait = 120000 } = {}) {
    if (!turnEl) throw new Error("No assistant turn to watch");
    let last = extractAssistantContent(turnEl, { as: "text" });
    let lastChange = performance.now();
    const start = performance.now();

    const obs = new MutationObserver(() => {
        const cur = extractAssistantContent(turnEl, { as: "text" });
        if (cur !== last) { last = cur; lastChange = performance.now(); logD("text change len=", cur.length); }
    });
    obs.observe(turnEl, { childList: true, subtree: true, characterData: true });

    return await new Promise((resolve, reject) => {
        (function tick() {
            const now = performance.now();
            const cur = extractAssistantContent(turnEl, { as: "text" });
            if (cur !== last) { last = cur; lastChange = now; }
            if (cur && (now - lastChange) >= quietMs) { try { obs.disconnect(); } catch { } return resolve(cur); }
            if (now - start > maxWait) { try { obs.disconnect(); } catch { } return reject(new Error("Timeout: nội dung không ổn định.")); }
            setTimeout(tick, 200);
        })();
    });
}
async function waitTurnAppearOrGrow(prevCount, prevLastTurn, { timeout = 90000 } = {}) {
    const start = performance.now();
    if (prevLastTurn) prevLastTurn._snapLen = extractAssistantContent(prevLastTurn, { as: "text" }).length;

    return await new Promise((resolve, reject) => {
        const obs = new MutationObserver(() => {
            const turns = getAssistantTurns();
            if (!turns.length) return;
            const last = turns[turns.length - 1];

            if (turns.length > prevCount) { try { obs.disconnect(); } catch { } logD("new turn detected"); return resolve(last); }
            const curLen = extractAssistantContent(last, { as: "text" }).length;
            const prevLen = (prevLastTurn && last === prevLastTurn) ? (prevLastTurn._snapLen || 0) : 0;
            if (curLen > prevLen) { try { obs.disconnect(); } catch { } logD("stream detected len=", curLen); return resolve(last); }
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });

        (function guard() {
            if (performance.now() - start > timeout) { try { obs.disconnect(); } catch { } return reject(new Error("Timeout: không nhận được phản hồi.")); }
            setTimeout(guard, 500);
        })();
    });
}

export async function askAndGetText(question, opts = {}) {
    const before = getAssistantTurns();
    const prevCount = before.length;
    const prevLast = before[prevCount - 1] || null;

    fillCurrentChat(question, opts);
    sendCurrentChat();

    const answeringTurn = await waitTurnAppearOrGrow(prevCount, prevLast, { timeout: 90000 });
    const text = await waitTextStableOnTurn(answeringTurn, { quietMs: 1200, maxWait: 120000 });

    try { window.postMessage({ type: "askChatGPT:result", payload: text }, "*"); } catch { }
    return text;
}

export async function askAndGetBlock(question, opts = {}) {
    const beforeLastUserTurn = getLastUserTurn();
    fillCurrentChat(question, opts);
    sendCurrentChat();

    const beforeAssist = getAssistantTurns();
    const answeringTurn = await waitTurnAppearOrGrow(
        beforeAssist.length,
        beforeAssist[beforeAssist.length - 1] || null,
        { timeout: 90000 }
    );
    await waitTextStableOnTurn(answeringTurn, { quietMs: 1200, maxWait: 120000 });

    const userTurnRef = getLastUserTurn() || beforeLastUserTurn;
    const articles = getAssistantArticlesAfter(userTurnRef);

    const texts = articles.map(a => extractAssistantContent(a, { as: "text" }));
    const htmls = articles.map(a => extractAssistantContent(a, { as: "html" }));
    const allText = texts.join("\n\n");

    const result = { texts, htmls, text: allText, count: articles.length };
    try { window.postMessage({ type: "askChatGPT:block", payload: result }, "*"); } catch { }
    return result;
}

const norm = (s) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
function getRole(art) {
    const attr = art.getAttribute("data-message-author-role");
    if (attr) return attr;
    const sr = art.querySelector("h6.sr-only, [class*=\"sr-only\"], [aria-label]");
    const txt = norm((sr?.innerText || sr?.textContent || art.innerText || "").slice(0, 200));
    if (/(chatgpt|assistant|đã nói:|bot|ai)/.test(txt)) return "assistant";
    if (/(bạn đã nói|you said|user)/.test(txt)) return "user";
    if (art.querySelector('[data-testid="markdown"], .markdown.prose, [data-role="message-content"]')) return "assistant";
    return null;
}
function findAnchorArticle(anchorTexts) {
    const anchors = (Array.isArray(anchorTexts) ? anchorTexts : [anchorTexts])
        .filter(Boolean).map((s) => s.toLowerCase().normalize("NFC").trim());
    anchors.sort((a, b) => (b.includes("chatgpt đã nói") ? 1 : 0) - (a.includes("chatgpt đã nói") ? 1 : 0));
    const arts = Array.from(document.querySelectorAll("article"));
    for (let i = arts.length - 1; i >= 0; i--) {
        const txt = (arts[i].innerText || arts[i].textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!txt) continue;
        if (anchors.some((a) => txt.includes(a))) {
            if (/^ai consular officer\b/i.test(txt)) continue;
            return arts[i];
        }
    }
    return null;
}
function collectAssistantBlockFrom(startArt) {
    const res = [];
    let cur = startArt;
    const startRole = getRole(startArt);
    if (startRole === "assistant") res.push(startArt);
    while (cur && (cur = cur.nextElementSibling)) {
        if (cur.tagName?.toLowerCase() !== "article") continue;
        const role = getRole(cur);
        if (role === "user") break;
        if (role === "assistant") res.push(cur);
    }
    return res;
}
export function getLastAnswerAfter(anchorTexts = ["tôi đã nói", "bạn đã nói", "chatgpt đã nói", "you said"]) {
    const anchorArt = findAnchorArticle(anchorTexts);
    if (!anchorArt) {
        return { anchorArticle: null, lastArticle: null, text: "", html: "" };
    }
    const block = collectAssistantBlockFrom(anchorArt);
    if (!block.length) {
        return { anchorArticle: anchorArt, lastArticle: null, text: "", html: "" };
    }
    const last = block[block.length - 1];
    const text = extractAssistantContent(last, { as: "text" });
    const html = extractAssistantContent(last, { as: "html" });
    return { anchorArticle: anchorArt, lastArticle: last, text, html, count: block.length };
}

// expose để tương thích với code bên ngoài (nếu bạn gọi từ console)
window.fillCurrentChat = fillCurrentChat;
window.sendCurrentChat = sendCurrentChat;
window.sendToCurrentChat = sendToCurrentChat;
window.askAndGetText = askAndGetText;
window.askAndGetBlock = askAndGetBlock;
window.getLastAnswerAfter = getLastAnswerAfter;

POST("askChatGPT:info", "Helpers loaded. Ready.");
