import { findByProps } from "@vendetta/metro";

function init() {
    // Tenta achar o módulo que tem as rows de mensagem
    const checks = [
        "patchRows",
        "updateRows", 
        "processRows",
        "renderRows",
        "MessageStore",
        "getMessages",
        "updateMessage",
    ];

    const results = checks.map(key => {
        try {
            const mod = findByProps(key);
            if (!mod) return `❌ ${key}`;
            return `✅ ${key} → ${Object.keys(mod).slice(0, 5).join(", ")}`;
        } catch {
            return `❌ ${key}`;
        }
    });

    // Tenta achar pelo tipo de row
    const rowMod = findByProps("updateRows") ?? findByProps("setRows") ?? null;
    results.push("rowMod: " + (rowMod ? Object.keys(rowMod).join(", ") : "null"));

    alert(results.join("\n"));
}

init();

export const onUnload = () => {};
