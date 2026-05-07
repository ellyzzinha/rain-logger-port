import { findByProps } from "@vendetta/metro";

export function onLoad() {
    const mod = findByProps("updateRows", "sendMessage");
    alert(mod ? `✅ achou: ${Object.keys(mod).slice(0, 8).join(", ")}` : "❌ não achou");
}

export function onUnload() {}
