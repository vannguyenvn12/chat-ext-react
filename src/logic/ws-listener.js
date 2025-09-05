// src/logic/ws-listener.js
/* eslint-disable */
import { askAndGetBlock, getLastAnswerAfter } from "./helpers";

const WS_URL = "ws://localhost:8787/ws";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const haveHelpers = () =>
    typeof window.askAndGetBlock === "function" &&
    typeof window.getLastAnswerAfter === "function";

function wsSend(ws, obj) {
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch { }
}

async function ensureHelpers(maxMs = 8000) {
    const t0 = Date.now();
    while (!haveHelpers() && Date.now() - t0 < maxMs) await sleep(200);
    return haveHelpers();
}

async function handleMessage(ws, msg) {
    const id = msg.id || `m-${Date.now()}`;

    if (msg.type === "ask_block") {
        if (!msg.prompt) return wsSend(ws, { id, type: "error", reason: "missing prompt" });
        const block = await askAndGetBlock(msg.prompt, msg.opts || {});
        return wsSend(ws, { id, type: "ask_block_result", ok: true, text: block?.text || "", count: block?.count || 0 });
    }

    if (msg.type === "get_last_after") {
        const last = await getLastAnswerAfter();
        return wsSend(ws, { id, type: "get_last_after_result", ok: true, text: last?.text || "", count: last?.count || 0 });
    }

    if (typeof msg.prompt === "string") {
        const block = await askAndGetBlock(msg.prompt, msg.opts || {});
        return wsSend(ws, { id, type: "result", ok: true, text: block?.text || "", count: block?.count || 0 });
    }
}

export function connectWS() {
    let ws;
    let closed = false;

    const open = () => {
        ws = new WebSocket(WS_URL);
        ws.addEventListener("open", async () => {
            wsSend(ws, { type: "ext_ready", href: location.href, t: Date.now() });
            await ensureHelpers();
        });
        ws.addEventListener("message", async (ev) => {
            let msg; try { msg = JSON.parse(ev.data); } catch { return; }
            try { await handleMessage(ws, msg); }
            catch (e) { wsSend(ws, { id: msg.id, type: "error", reason: String((e && e.message) || e) }); }
        });
        ws.addEventListener("close", async () => {
            if (closed) return;
            await new Promise((r) => setTimeout(r, 1500));
            open();
        });
        ws.addEventListener("error", () => {
            try { ws.close(); } catch { }
        });
    };

    open();
    return () => {
        closed = true;
        try { ws && ws.close(); } catch { }
    };
}
