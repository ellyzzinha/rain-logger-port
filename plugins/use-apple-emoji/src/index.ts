import { findByProps } from "@vendetta/metro";

export function onLoad() {
    const mod = findByProps("updateRows");
    alert(`keys: ${Object.keys(mod).join(", ")}`);
}

export function onUnload() {}
