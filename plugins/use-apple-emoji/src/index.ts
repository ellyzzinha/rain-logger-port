import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

let origEmojiReact: any = null;
let emojiRule: any = null;

function init() {
    const parseMod = findByProps("defaultRules", "createReactRules");
    if (!parseMod?.defaultRules) {
        alert("parseMod não encontrado");
        return;
    }

    const rules = parseMod.defaultRules;

    if (!rules.emoji) {
        alert("rules.emoji não existe");
        return;
    }

    emojiRule = rules.emoji;
    origEmojiReact = rules.emoji.react;

    let logged = false;

    rules.emoji.react = (node: any, output: any, state: any) => {
        // Loga só uma vez para não spammar
        if (!logged) {
            logged = true;
            alert("emoji node keys:\n" + Object.keys(node ?? {}).join(", ") + "\n\nnode JSON:\n" + JSON.stringify(node)?.slice(0, 300));
        }
        return origEmojiReact(node, output, state);
    };
}

init();

export const onUnload = () => {
    if (emojiRule && origEmojiReact) {
        emojiRule.react = origEmojiReact;
    }
};
