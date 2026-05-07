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

// Guarda os originais para restaurar no onUnload
let origEmojiReact: any = null;
let origCustomEmojiReact: any = null;
let emojiRule: any = null;
let customEmojiRule: any = null;

function init() {
    const parseMod = findByProps("defaultRules", "createReactRules");
    if (!parseMod?.defaultRules) return;

    const rules = parseMod.defaultRules;

    // ── emoji nativo (unicode) ─────────────────────────────────────────────
    // node: { type: "emoji", surrogate, jumboable }
    if (rules.emoji) {
        emojiRule = rules.emoji;
        origEmojiReact = rules.emoji.react;

        rules.emoji.react = (node: any, output: any, state: any) => {
            const surrogate = node?.surrogate ?? node?.surrogates ?? node?.emoji?.surrogates;
            if (!surrogate) return origEmojiReact(node, output, state);
            const size = node?.jumboable ? 48 : 22;
            return appleImg(surrogate, size) ?? origEmojiReact(node, output, state);
        };
    }

    // ── customEmoji (emojis de servidor) ──────────────────────────────────
    // customEmoji usa URL própria — deixa passar o original
    // mas se quiser substituir também, descomenta abaixo
    // if (rules.customEmoji) { ... }
}

init();

export const onUnload = () => {
    if (emojiRule && origEmojiReact) {
        emojiRule.react = origEmojiReact;
    }
};
