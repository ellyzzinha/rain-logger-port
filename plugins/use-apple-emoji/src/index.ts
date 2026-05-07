import { findByProps } from "@vendetta/metro";

export function onLoad() {
    const candidates = [
        "updateRows",
        "appendRows", 
        "setRows",
        "receiveRows",
        "loadRows",
        "pushRows",
        "addRows",
        "renderRows",
    ];
    
    const results = candidates.map(name => {
        const mod = findByProps(name);
        return mod ? `✅ ${name}` : `❌ ${name}`;
    });
    
    alert(results.join("\n"));
}

export function onUnload() {}
