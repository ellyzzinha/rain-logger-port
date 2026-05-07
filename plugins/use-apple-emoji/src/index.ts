import { findByProps } from "@vendetta/metro";

export function onLoad() {
    const mod = findByProps("updateRows");
    const mod2 = findByProps("updateRows", "clearRows");
    const mod3 = findByProps("sendMessage");
    
    alert([
        mod ? `✅ updateRows: ${Object.keys(mod).slice(0,5).join(", ")}` : "❌ updateRows",
        mod2 ? `✅ updateRows+clearRows: ${Object.keys(mod2).slice(0,5).join(", ")}` : "❌ updateRows+clearRows",
        mod3 ? `✅ sendMessage: ${Object.keys(mod3).slice(0,5).join(", ")}` : "❌ sendMessage",
    ].join("\n"));
}

export function onUnload() {}
