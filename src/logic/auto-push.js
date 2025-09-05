// src/logic/auto-push.js
/* eslint-disable */
const TAG = "[autoPush]";
const PUSH_URL = "http://localhost:8787/push";
const PAYLOAD = { type: "get_last_after" };

// ==== cấu hình ====
const QUIET_MS = 1200;      // im lặng bao lâu thì coi là xong phiên
const MAX_WAIT_MS = 8000;   // cưỡng bức kết thúc phiên sau tối đa N ms

// ======= shared correlation id (burst) =======
const CORR_WINDOW_MS = 500;        // cửa sổ "cùng thời điểm" (tuỳ chỉnh)
let _sharedCorrId = null;
let _sharedCorrExpire = 0;

function getSharedCorrelationId() {
    const now = Date.now();
    if (_sharedCorrId && now < _sharedCorrExpire) return _sharedCorrId;
    _sharedCorrId = `req_${now}`; // có thể thay bằng ULID nếu muốn
    _sharedCorrExpire = now + CORR_WINDOW_MS;
    return _sharedCorrId;
}


// ==== selectors ====
const ROOT_SELECTORS = [
    '[data-message-id][data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
    'article[data-message-author-role="assistant"]',
    '[data-message-author-role="assistant"]',
    'article'
];

const btnSelectors = [
    'button[aria-label*="Phản hồi" i]',
    'button[aria-label*="Sao chép" i]',
    'button[aria-label*="Copy" i]',
    'button[aria-label*="like" i]',
    'button[aria-label*="dislike" i]',
    '[data-testid*="action" i]',
    'button.text-token-text-secondary[aria-label]'
];

// ==== trạng thái toàn cục (gộp theo phiên) ====
// phiên = cụm hoạt động DOM liên quan đến 1 câu trả lời; có thể phát sinh nhiều key khác nhau
const seen = new Map();  // key -> { firstSeen, lastSeen, turnIndex, reason }
let globalTimer = null;
let globalFirst = 0;

// NEW: chốt key đã push (không bao giờ push lại key này trong vòng đời trang)
const pushedKeys = new Set();

// ===== helpers để tìm root và key ổn định =====
function getAssistantRoot(el) {
    if (!el || !el.closest) return null;
    for (const sel of ROOT_SELECTORS) {
        const found = el.closest(sel);
        if (found) return found;
    }
    return null;
}

function getArticleKey(articleEl) {
    if (!articleEl) return "";
    const id =
        articleEl.getAttribute?.("data-message-id") ||
        articleEl.getAttribute?.("data-testid");
    // fallback: gán key ngẫu nhiên cho node này (chỉ dùng khi không có id/testid)
    return (
        id ||
        `__node__${(articleEl.dataset &&
            (articleEl.dataset.autopushKey ||= String(Math.random()).slice(2)))}`
    );
}

// Parse "conversation-turn-<n>" -> n, else -1
function parseTurnIndex(key = "") {
    const m = /conversation-turn-(\d+)/i.exec(key);
    return m ? parseInt(m[1], 10) : -1;
}

function isActionButton(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (btnSelectors.some((sel) => node.matches?.(sel))) return true;
    if (node.tagName === "BUTTON") {
        const label = node.getAttribute("aria-label") || "";
        if (/(phản hồi|sao chép|copy|like|dislike)/i.test(label)) return true;
    }
    return false;
}

// ==== cơ chế gộp phiên (global trailing debounce) ====

// Ghi nhận hoạt động cho 1 key; KHÔNG fetch ngay
function noteActivity(key, reason) {
    if (!key) return;
    if (pushedKeys.has(key)) return; // NEW: bỏ qua key đã từng push

    const now = Date.now();
    const prev =
        seen.get(key) || { firstSeen: now, turnIndex: parseTurnIndex(key) };
    prev.lastSeen = now;
    prev.reason = reason;
    seen.set(key, prev);

    if (!globalFirst) globalFirst = now;

    // reset timer toàn cục mỗi lần có hoạt động mới
    if (globalTimer) clearTimeout(globalTimer);
    globalTimer = setTimeout(tick, QUIET_MS);
}

// Chọn 1 key “thắng cuộc” của phiên:
// 1) ưu tiên turnIndex lớn nhất (conversation-turn-N)
// 2) nếu hòa, lấy lastSeen mới nhất
function pickBestKey() {
    let bestKey = null,
        best = null;
    for (const [k, v] of seen) {
        if (pushedKeys.has(k)) continue; // NEW: không chọn key đã push
        if (!best) {
            bestKey = k;
            best = v;
            continue;
        }
        if (v.turnIndex > best.turnIndex) {
            bestKey = k;
            best = v;
            continue;
        }
        if (v.turnIndex === best.turnIndex && v.lastSeen > best.lastSeen) {
            bestKey = k;
            best = v;
        }
    }
    return bestKey;
}

// Bắn API đúng 1 lần cho key thắng rồi dọn phiên
async function fireFinalPush(key, tag = "final") {
    // NEW: phòng hộ
    if (!key || pushedKeys.has(key)) {
        seen.clear();
        globalFirst = 0;
        globalTimer = null;
        return;
    }
    pushedKeys.add(key); // NEW: đánh dấu đã push

    try {
        await fetch(PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...PAYLOAD, correlation_id: Date.now() }),
        });
        console.log("[autoPush] PUSHED", { key, reason: tag, PAYLOAD });
        window.postMessage(
            { type: "autoPush:ok", payload: { ...PAYLOAD, key, reason: tag } },
            "*"
        );
    } catch (e) {
        window.postMessage({ type: "autoPush:error", payload: String(e) }, "*");
    } finally {
        // reset phiên (KHÔNG xóa pushedKeys)
        seen.clear();
        globalFirst = 0;
        globalTimer = null;
    }
}

// Kiểm tra điều kiện kết thúc phiên: im lặng đủ lâu hoặc quá MAX_WAIT_MS
function tick() {
    const now = Date.now();
    if (seen.size === 0) {
        globalTimer = null;
        return;
    }

    const sinceLastMax = Math.max(
        ...[...seen.values()].map((v) => now - v.lastSeen)
    );
    const sinceFirst = now - globalFirst;

    if (sinceLastMax >= QUIET_MS || sinceFirst >= MAX_WAIT_MS) {
        const key = pickBestKey();
        if (key)
            return void fireFinalPush(
                key,
                sinceLastMax >= QUIET_MS ? "quiet" : "max-wait"
            );
    }

    // chưa đủ điều kiện → hẹn lại
    const next = Math.min(QUIET_MS, Math.max(120, MAX_WAIT_MS - sinceFirst));
    globalTimer = setTimeout(tick, next);
}

// ==== scan & observer ====
function scanNow(reason = "scan") {
    const buttons = document.querySelectorAll(btnSelectors.join(","));
    const seenKeys = new Set();
    buttons.forEach((btn) => {
        const root = getAssistantRoot(btn);
        const key = getArticleKey(root);
        if (root && key && !seenKeys.has(key)) {
            seenKeys.add(key);
            // chỉ gộp (không push ngay)
            noteActivity(key, reason);
        }
    });
}

async function pushOnceForArticle(articleEl, reason = "detected") {
    if (!articleEl) return;
    const key = getArticleKey(articleEl);
    if (!key) return;

    // Nếu bạn chỉ muốn trigger khi "added-nodes", bật guard này:
    // if (reason !== "added-nodes") return;

    // GỘP THEO PHIÊN: dù key có thay đổi liên tục, cuối cùng vẫn chỉ PUSH 1 lần
    noteActivity(key, reason);
}

export function installAutoPush() {
    try {
        // gom nhiều mutation vào 1 nhịp quét
        let scheduled = false;
        const scheduleScan = (why) => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                scanNow(why);
            });
        };

        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.addedNodes?.length) {
                    for (const node of m.addedNodes) {
                        if (!(node instanceof HTMLElement)) continue;
                        if (
                            isActionButton(node) ||
                            node.querySelector?.(btnSelectors.join(","))
                        ) {
                            // thay vì fetch ngay → ghi nhận hoạt động
                            scheduleScan("added-nodes");
                            break;
                        }
                    }
                }
                if (m.type === "attributes") {
                    const t = m.target;
                    if (t instanceof HTMLElement) {
                        if (t.closest?.('[data-message-author-role="assistant"], article')) {
                            scheduleScan("attr-change");
                        }
                    }
                }
            }
        });

        obs.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-state", "aria-hidden", "aria-disabled", "class"],
        });

        // quét khởi động + vài lần sớm
        setTimeout(() => scanNow("t+300ms"), 300);
        setTimeout(() => scanNow("t+1000ms"), 1000);
        setTimeout(() => scanNow("t+2000ms"), 2000);

        let ticks = 0;
        const iv = setInterval(() => {
            scanNow("interval");
            if (++ticks >= 7) clearInterval(iv);
        }, 1500);

        console.debug(TAG, "installed");
    } catch (e) {
        console.warn(TAG, "observer error", e);
    }
}
