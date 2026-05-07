import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

let logged = false;
let origEmoji: any = null;
let emojiMod: any = null;

function init() {
    emojiMod = findByProps("Emoji", "asUnicodeEmoji");
    if (!emojiMod?.Emoji) { alert("emojiMod null"); return; }

    origEmoji = emojiMod.Emoji;

    emojiMod.Emoji = function(props: any) {
        if (!logged) {
            logged = true;
            const surrogate =
                props?.emoji?.surrogates ??
                props?.node?.surrogate ??
                props?.surrogates ??
                "N/A";
            alert(
                "Emoji chamado!\n" +
                "props keys: " + Object.keys(props ?? {}).join(", ") + "\n" +
                "surrogate: " + surrogate + "\n" +
                "Image: " + (ReactNative?.Image ? "OK" : "NULL")
            );
        }
        return origEmoji(props);
    };
}

init();

export const onUnload = () => {
    if (emojiMod && origEmoji) {
        emojiMod.Emoji = origEmoji;
    }
};
