import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const unpatchers: (() => void)[] = [];

function init() {
    const checks: [string, string[]][] = [
        // Renderização de mensagem/texto
        ["parseText", ["parseText"]],
        ["renderContent", ["renderContent"]],
        ["renderMessage", ["renderMessage"]],
        ["MessageContent", ["MessageContent"]],
        ["renderMessageContent", ["renderMessageContent"]],
        ["parseToAST", ["parseToAST"]],
        ["astToReact", ["astToReact"]],
        ["markup", ["markup"]],
        ["parse", ["parse", "parseTopic"]],
        // Emoji interno
        ["emojiStore", ["getEmojiById"]],
        ["emojiUtils", ["getEmojiURL"]],
        ["getURL", ["getURL", "surrogates"]],
        ["emojiSource", ["getSource"]],
        ["getImageSource", ["getImageSource"]],
        ["EmojiStore", ["getUsableEmojiById"]],
        // Sprite sheet
        ["spriteIndex", ["getSpriteIndex"]],
        ["emojiSprite", ["getSpritesheetURL"]],
        ["spritesheetURL", ["spritesheetURL"]],
        // Media / imagem
        ["mediaResolver", ["resolveAsset"]],
        ["getAssetByID", ["getAssetByID"]],
        ["MediaManager", ["downloadMediaAsset"]],
        // Token / AST
        ["tokenize", ["tokenize"]],
        ["createEmoji", ["createEmoji"]],
        ["emojiNode", ["emojiNode"]],
    ];

    const results = checks.map(([label, props]) => {
        try {
            const mod = findByProps(...props);
            if (!mod) return `❌ ${label}`;
            return `✅ ${label} → keys: ${Object.keys(mod).slice(0, 6).join(", ")}`;
        } catch {
            return `❌ ${label} (erro)`;
        }
    });

    alert(results.join("\n"));
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
