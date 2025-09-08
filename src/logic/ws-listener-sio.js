// src/logic/ws-listener-sio.js
/* eslint-disable */
import { io } from 'socket.io-client';
import { askAndGetBlock, getLastAnswerAfter } from './helpers';

// const SIO_URL = 'http://localhost:8787'; // host server
const SIO_URL = 'https://api-chat.vannguyenv12.com';
const PATH = '/ws';                       // cùng path với server
let socket;

function emit(type, payload) {
    if (!socket) return;
    socket.emit(type, payload);
}

async function handlePush(msg) {
    const id = msg.id || `m-${Date.now()}`;

    // Giống logic cũ
    if (msg.type === 'ask_block') {
        if (!msg.prompt) {
            return emit('client_result', { id, type: 'error', reason: 'missing prompt' });
        }
        const block = await askAndGetBlock(msg.prompt, msg.opts || {});
        return emit('client_result', {
            id,
            type: 'ask_block_result',
            ok: true,
            text: block?.text || '',
            count: block?.count || 0
        });
    }

    if (msg.type === 'get_last_after') {
        const last = await getLastAnswerAfter(msg.anchors || undefined);
        return emit('client_result', {
            id,
            type: 'get_last_after_result',
            ok: true,
            text: last?.text || '',
            count: last?.count || 0
        });
    }

    // fallback: nếu chỉ có prompt (không có type)
    if (typeof msg.prompt === 'string') {
        const block = await askAndGetBlock(msg.prompt, msg.opts || {});
        return emit('client_result', {
            id,
            type: 'result',
            ok: true,
            text: block?.text || '',
            count: block?.count || 0
        });
    }
}

export function connectSocketIO() {
    socket = io(SIO_URL, {
        path: PATH,
        transports: ['websocket'], // ưu tiên websocket
    });

    socket.on('connect', () => {
        emit('ext_ready', { href: location.href, t: Date.now() });
    });

    // Nhận lệnh từ server
    socket.on('server_push', async (msg) => {
        try { await handlePush(msg); }
        catch (e) {
            const id = msg?.id;
            emit('client_result', { id, type: 'error', reason: String(e && e.message || e) });
        }
    });

    socket.on('new_url', async (msg) => {
        window.location.href = `https://chatgpt.com/g/g-6896f631a844819185157596b78e754c-ai-consular-officer-spouse-fiance-e`
    })

    // (tùy chọn) nghe push_result để tự hiển thị trong DevTools
    socket.on('push_result', (payload) => {
        // console.debug('[push_result]', payload);
        // Bạn cũng có thể window.postMessage để đẩy vào UI panel
        try { window.postMessage({ type: 'push_result', payload }, '*'); } catch { }
    });
}
