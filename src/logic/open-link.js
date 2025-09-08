// src/logic/open-link.js
/* eslint-disable */
let _openedOnce = false;  // bảo đảm chỉ mở 1 lần/phiên trang
let _inflight = null;     // tránh mở trùng nếu đang mở

export function hasOpenedWarmup() {
    return _openedOnce;
}

/**
 * Mở 1 URL trước khi push. Trả về Promise resolve khi tab đã 'complete' hoặc timeout.
 * - Chỉ mở 1 lần/phiên: lần sau gọi sẽ skip và resolve ngay.
 * - Có thể override url nếu muốn (tham số).
 */
export function openLinkBeforePush(url) {
    if (_openedOnce) return Promise.resolve({ ok: true, reason: "already-opened" });
    if (_inflight) return _inflight;

    _inflight = new Promise((resolve) => {
        try {
            if (!chrome?.runtime?.sendMessage) {
                // fallback (dev/test trong context trang): cố gắng window.open
                try {
                    window.open(url || "https://example.com/warmup", "_blank", "noopener");
                    _openedOnce = true;
                    _inflight = null;
                    resolve({ ok: true, reason: "fallback-window-open" });
                } catch (e) {
                    _inflight = null;
                    resolve({ ok: false, error: String(e) });
                }
                return;
            }

            chrome.runtime.sendMessage({ type: "open_link", url }, (res) => {
                _inflight = null;
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                if (res?.ok) {
                    _openedOnce = true;
                    resolve(res);
                } else {
                    resolve({ ok: false, error: res?.error || "unknown" });
                }
            });
        } catch (e) {
            _inflight = null;
            resolve({ ok: false, error: String(e) });
        }
    });

    return _inflight;
}
