import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const unpatchers: (() => void)[] = [];
let logged = false;

function init() {
    const emojiMod = findByProps("Emoji", "asUnicodeEmoji");
    if (!emojiMod) { alert("emojiMod null"); return; }

    unpatchers.push(
        patcher.instead(emojiMod, "Emoji", function(args: any[], orig: Function) {
            const props = args[0];
            if (!logged) {
                logged = true;
                const surrogate =
                    props?.emoji?.surrogates ??
                    props?.node?.surrogate ??
                    props?.surrogates ??
                    "N/A";
                const Image = ReactNative?.Image;
                alert(
                    "Emoji chamado!\n" +
                    "props keys: " + Object.keys(props ?? {}).join(", ") + "\n" +
                    "surrogate: " + surrogate + "\n" +
                    "ReactNative.Image: " + (Image ? "OK" : "NULL")
                );
            }
            return orig.apply(this, args);
        })
    );
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
