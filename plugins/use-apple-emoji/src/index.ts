import { findByProps } from "@vendetta/metro";

function init() {
    const checks = [
        "patchRows",
        "rows",
        "ContentRow",
        "iterateRows",
        "messageRows",
        "useRows",
        "getRows",
    ];

    const results = checks.map(key => {
        try {
            const mod = findByProps(key);
            if (!mod) return `❌ ${key}`;
            return `✅ ${key} → ${Object.keys(mod).slice(0, 6).join(", ")}`;
        } catch {
            return `❌ ${key}`;
        }
    });

    // Tenta achar pelo window global
    const hasPatchRows = typeof (globalThis as any).patchRows === "function";
    results.push("globalThis.patchRows: " + hasPatchRows);

    // Tenta pelo vendetta global
    const v = (globalThis as any).vendetta;
    const vKeys = v ? Object.keys(v).join(", ") : "null";
    results.push("vendetta keys: " + vKeys);

    alert(results.join("\n"));
}

init();

export const onUnload = () => {};
