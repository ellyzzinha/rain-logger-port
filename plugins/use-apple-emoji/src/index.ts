import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

let origCreateReactRules: any = null;
let parseMod: any = null;

function init() {
    parseMod = findByProps("defaultRules", "createReactRules");
    if (!parseMod) {
        alert("parseMod null");
        return;
    }

    const keys = Object.keys(parseMod).join(", ");

    // Testa se createReactRules é função
    const isFunc = typeof parseMod.createReactRules === "function";

    // Testa se defaultRules === o que createReactRules retorna
    let sameObj = false;
    let createdKeys = "";
    if (isFunc) {
        try {
            const created = parseMod.createReactRules();
            sameObj = created === parseMod.defaultRules;
            createdKeys = Object.keys(created ?? {}).slice(0, 6).join(", ");
        } catch(e: any) {
            createdKeys = "erro: " + e?.message;
        }
    }

    alert(
        "parseMod keys: " + keys +
        "\n\ncreateReactRules é função: " + isFunc +
        "\ncreated === defaultRules: " + sameObj +
        "\ncreated keys: " + createdKeys
    );
}

init();

export const onUnload = () => {};
