/* eslint-disable */
import { createRoot } from "react-dom/client";

import { connectWS } from "./logic/ws-listener";
import { installAutoPush } from "./logic/auto-push";
import Panel from "./ui/Panel";
import { connectSocketIO } from "./logic/ws-listener-sio";

// 1) Cài logic (WS + auto-push)
connectSocketIO();
installAutoPush();

// 2) Gắn 1 panel React nhỏ (không đụng UI ChatGPT)
(function mountPanel() {
    const host = document.createElement("div");
    host.id = "ica-orchestrator-panel-host";
    document.documentElement.appendChild(host);

    const root = createRoot(host);
    root.render(<Panel />);
})();
