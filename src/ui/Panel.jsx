// src/ui/Panel.jsx
import React, { useEffect, useRef, useState } from "react";

export default function Panel() {
    const [status, setStatus] = useState("ready");
    const wrapRef = useRef(null);

    useEffect(() => {
        const onMsg = (e) => {
            if (e?.data?.type === "autoPush:ok") setStatus("auto-push ok");
            if (e?.data?.type === "autoPush:error") setStatus("auto-push error");
            if (e?.data?.type === "askChatGPT:info") setStatus(String(e.data.payload || "info"));
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);

    return (
        <div
            ref={wrapRef}
            style={{
                position: "fixed",
                zIndex: 100000,
                right: 12,
                bottom: 12,
                background: "rgba(15, 21, 48, .9)",
                color: "#cfe2ff",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                font: "12px ui-sans-serif, system-ui",
                boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            }}
        >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>ICA Chat Orchestrator</div>
            <div>Trạng thái: {status}</div>
        </div>
    );
}
