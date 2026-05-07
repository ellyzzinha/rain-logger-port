import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/";

function toPath(surrogate: string): string | null {
    if (!surrogate) return null;
    const pts: string[] = [];
    for (let i = 0; i < surrogate.length;) {
        const cp = surrogate.codePointAt(i);
        if (cp === undefined) break;
        if (cp !== 0xfe0f) pts.push(cp.toString(16));
        i += cp > 0xffff ? 2 : 1;
    }
    return pts.length ? pts.join("-") + ".png" : null;
}

function appleImg(surrogate: string, size: number): any {
    const path = toPath(surrogate);
    if (!path) return null;
    const url = CDN + path;
    const Image = ReactNative?.Image;
    if (!Image) return null;
    return React.createElement(Image, {
        source: { uri: url },
        style: { width: size, height: size },
        resizeMode: "contain",
        accessibilityLabel: surrogate,
        fadeDuration: 0,
    });
}

const unpatchers: (() => void)[] = [];

function init() {
    const parseMod = findByProps("defaultRules", "createReactRules");
    if (!parseMod) {
        alert("parseMod não encontrado");
        return;
    }

    const rules = parseMod.defaultRules;
    if (!rules) {
        alert("defaultRules null\nkeys: " + Object.keys(parseMod).join(", "));
        return;
    }

    // Mostra as keys das regras para confirmar que existe "emoji"
    alert("defaultRules keys:\n" + Object.keys(rules).join(", "));
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
