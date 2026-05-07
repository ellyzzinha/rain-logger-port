import { patcher } from "@vendetta";
import { findByProps, findByName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const unpatchers: (() => void)[] = [];

function init() {
    // Tenta achar por nome (componentes React exportados pelo nome)
    const byName = [
        "Emoji",
        "EmojiComponent", 
        "NativeEmoji",
        "EmojiText",
        "ChatEmoji",
        "ReactionEmoji",
        "MessageEmoji",
    ].map(n => {
        try { return { name: n, mod: findByName(n, { interop: false }) }; }
        catch { return { name: n, mod: null }; }
    });

    const found = byName.filter(x => x.mod != null);
    const notFound = byName.filter(x => x.mod == null);

    // Tenta achar módulos com renderEmoji / renderUnicodeEmoji
    const renderMod = findByProps("renderEmoji") ?? null;
    const renderUniMod = findByProps("renderUnicodeEmoji") ?? null;
    const unicodeMod = findByProps("convertSurrogateToCodePoint") ?? null;
    const nativeMod = findByProps("getEmojiImageURL") ?? null;
    const spritesMod = findByProps("getEmojiSprite") ?? null;

    const msg = [
        "=== findByName ===",
        found.map(x => `✅ ${x.name}`).join("\n") || "nenhum",
        notFound.map(x => `❌ ${x.name}`).join("\n"),
        "",
        "=== outros módulos ===",
        `renderEmoji: ${renderMod ? "✅ keys: " + Object.keys(renderMod).join(", ") : "❌"}`,
        `renderUnicodeEmoji: ${renderUniMod ? "✅ keys: " + Object.keys(renderUniMod).join(", ") : "❌"}`,
        `convertSurrogateToCodePoint: ${unicodeMod ? "✅ keys: " + Object.keys(unicodeMod).join(", ") : "❌"}`,
        `getEmojiImageURL: ${nativeMod ? "✅ keys: " + Object.keys(nativeMod).join(", ") : "❌"}`,
        `getEmojiSprite: ${spritesMod ? "✅ keys: " + Object.keys(spritesMod).join(", ") : "❌"}`,
    ].join("\n");

    alert(msg);
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
