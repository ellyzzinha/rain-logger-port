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
    const Image = ReactNative?.Image;
    if (!Image) return null;
    return React.createElement(Image, {
        key: `apple-${surrogate}`,
        source: { uri: CDN + path },
        style: { width: size, height: size },
        resizeMode: "contain",
        accessibilityLabel: surrogate,
        fadeDuration: 0,
    });
}

function patchRules(rules: any) {
    if (!rules?.emoji) return;
    const orig = rules.emoji.react;
    if (typeof orig !== "function") return;
    rules.emoji.react = function(node: any, output: any, state: any) {
        const surrogate =
            node?.surrogate ??
            node?.surrogates ??
            node?.emoji?.surrogates ??
            node?.name;
        if (!surrogate) return orig(node, output, state);
        const size = node?.jumboable ? 48 : 22;
        return appleImg(surrogate, size) ?? orig(node, output, state);
    };
}

const unpatchers: (() => void)[] = [];

function init() {
    const parseMod = findByProps("defaultRules", "createReactRules");
    if (!parseMod) return;

    // Patcha defaultRules direto — sem patcher, só mutação direta
    patchRules(parseMod.defaultRules);

    // Patcha createReactRules também via mutação direta
    const origCreate = parseMod.createReactRules;
    if (typeof origCreate === "function") {
        parseMod.createReactRules = function(...args: any[]) {
            const result = origCreate.apply(this, args);
            patchRules(result);
            return result;
        };
        unpatchers.push(() => {
            parseMod.createReactRules = origCreate;
        });
    }
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
