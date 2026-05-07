import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const unpatchers: (() => void)[] = [];

function init() {
    const emojiMod = findByProps("Emoji", "asUnicodeEmoji");

    if (!emojiMod) {
        alert("emojiMod NULL");
        return;
    }

    const info = Object.keys(emojiMod).map(k => {
        const v = emojiMod[k];
        const type = typeof v;
        const extra = type === "function"
            ? ` | body: ${v.toString().slice(0, 100)}`
            : ` | val: ${JSON.stringify(v)?.slice(0, 60)}`;
        return `${k} [${type}]${extra}`;
    }).join("\n\n");

    alert("emojiMod:\n\n" + info);
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
