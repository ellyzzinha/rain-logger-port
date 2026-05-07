import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const unpatchers: (() => void)[] = [];

function init() {
    try {
        const parseMod = findByProps("defaultRules", "createReactRules");
        if (!parseMod) {
            alert("parseMod null");
            return;
        }

        if (typeof parseMod.createReactRules !== "function") {
            alert("createReactRules não é função: " + typeof parseMod.createReactRules);
            return;
        }

        unpatchers.push(
            patcher.instead(parseMod, "createReactRules", (args, orig) => {
                return orig(...args);
            })
        );

        alert("ok — patcher funcionou");
    } catch (e: any) {
        alert("ERRO: " + e?.message + "\n" + e?.stack?.slice(0, 200));
    }
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
