/**
 * FakeNitro — Shiggycord
 * Versão mínima: foco em ligar. Settings e features extras depois.
 */

import React from "react";
import { after, before, instead } from "@api/patcher";
import { findByProps, findByStoreName } from "@metro";
import { ReactNative as RN } from "@metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

// ─── Patches acumulados para cleanup no onUnload ───────────────────────────
var _patches = [];

function unpatchAll() {
    _patches.forEach(function (u) { try { u && u(); } catch (_e) {} });
    _patches = [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
var hasEmotesRegex  = /<a?:(\w+):(\d+)>/i;
var hasEmotesGlobal = /<a?:(\w+):(\d+)>/gi;

function hasRealNitro() {
    try {
        var UserStore = findByStoreName("UserStore");
        var user = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser();
        if (!user) return false;
        return user.premiumType !== null && user.premiumType !== undefined;
    } catch (_e) {
        return false;
    }
}

function buildEmojiURL(emoji, size) {
    var ext    = emoji.animated ? "gif" : "webp";
    var params = "size=" + size + "&name=" + encodeURIComponent(emoji.name || "");
    if (emoji.guildId) params += "&guild_id=" + emoji.guildId;
    return "https://cdn.discordapp.com/emojis/" + emoji.id + "." + ext + "?" + params;
}

function buildStickerURL(sticker, size) {
    var format = sticker.format_type === 4 ? "gif" : "png";
    var params = "size=" + size + "&name=" + encodeURIComponent(sticker.name || "");
    if (sticker.guild_id) params += "&guild_id=" + sticker.guild_id;
    return "https://media.discordapp.net/stickers/" + sticker.id + "." + format + "?" + params;
}

function toHyperlink(url, label) {
    return "[" + label + "](" + url + ")";
}

function processEmojiMessage(msg) {
    if (!msg || !msg.content) return;
    if (!msg.content.match(hasEmotesRegex)) return;

    try {
        var EmojiStore         = findByStoreName("EmojiStore");
        var SelectedGuildStore = findByStoreName("SelectedGuildStore");
        var currentGuildId = SelectedGuildStore && SelectedGuildStore.getGuildId
            ? SelectedGuildStore.getGuildId() : null;
        var size = (storage.emojiSize) || 48;

        var matches = Array.from(msg.content.matchAll(hasEmotesGlobal));
        for (var i = 0; i < matches.length; i++) {
            var m         = matches[i];
            var full      = m[0];
            var emojiName = m[1];
            var emojiId   = m[2];
            var emoji = EmojiStore && EmojiStore.getCustomEmojiById
                ? EmojiStore.getCustomEmojiById(emojiId) : null;
            if (!emoji) continue;
            if (emoji.guildId === currentGuildId && !emoji.animated) continue;

            var url   = buildEmojiURL(emoji, size);
            var label = emoji.name || emojiName;
            msg.content = msg.content.replace(full, toHyperlink(url, label));
        }

        msg.content       = msg.content.trim();
        msg.invalidEmojis = [];
    } catch (e) {
        console.error("[FakeNitro] processEmojiMessage error:", e);
    }
}

// ─── Aplicar patches ──────────────────────────────────────────────────────────
function applyPatches() {
    console.log("[FakeNitro] Aplicando patches...");

    // 1. Nitro checks
    try {
        var nitroInfo = findByProps("canUseEmojisEverywhere");
        if (nitroInfo) {
            _patches.push(
                instead("canUseEmojisEverywhere", nitroInfo, function (args, orig) {
                    return hasRealNitro() ? orig.apply(null, args) : true;
                }),
                instead("canUseAnimatedEmojis", nitroInfo, function (args, orig) {
                    return hasRealNitro() ? orig.apply(null, args) : true;
                })
            );

            var stickerCheck = nitroInfo.canUseCustomStickersEverywhere
                ? "canUseCustomStickersEverywhere"
                : "canUseStickersEverywhere";
            _patches.push(
                instead(stickerCheck, nitroInfo, function (args, orig) {
                    return hasRealNitro() ? orig.apply(null, args) : true;
                })
            );
            console.log("[FakeNitro] nitroInfo patches OK");
        }
    } catch (e) {
        console.error("[FakeNitro] nitroInfo patch error:", e);
    }

    // 2. sendMessage (emoji)
    try {
        var messageModule = findByProps("sendMessage", "receiveMessage");
        if (messageModule) {
            _patches.push(
                before("sendMessage", messageModule, function (args) {
                    if (!hasRealNitro()) processEmojiMessage(args[1]);
                })
            );

            // 3. sendStickers
            _patches.push(
                instead("sendStickers", messageModule, function (args, orig) {
                    if (hasRealNitro()) return orig.apply(null, args);
                    try {
                        var channelId  = args[0];
                        var stickerIds = args[1];
                        var extra      = args[3];
                        var StickersStore = findByStoreName("StickersStore");
                        var ChannelStore  = findByStoreName("ChannelStore");
                        var sticker = StickersStore && StickersStore.getStickerById
                            ? StickersStore.getStickerById(stickerIds) : null;
                        if (!sticker) return orig.apply(null, args);
                        if (sticker.format_type === 3 || sticker.pack_id !== undefined)
                            return orig.apply(null, args);
                        var ch = ChannelStore && ChannelStore.getChannel
                            ? ChannelStore.getChannel(channelId) : null;
                        if (ch && ch.guild_id === sticker.guild_id)
                            return orig.apply(null, args);

                        var size    = (storage.emojiSize) || 48;
                        var url     = buildStickerURL(sticker, size);
                        var label   = sticker.name || "sticker";
                        messageModule.sendMessage(
                            channelId,
                            { content: toHyperlink(url, label) },
                            null,
                            extra
                        );
                    } catch (e) {
                        console.error("[FakeNitro] sendStickers error:", e);
                        return orig.apply(null, args);
                    }
                })
            );
            console.log("[FakeNitro] messageModule patches OK");
        }
    } catch (e) {
        console.error("[FakeNitro] messageModule patch error:", e);
    }

    // 4. uploadLocalFiles
    try {
        var uploadModule = findByProps("uploadLocalFiles");
        if (uploadModule && uploadModule.uploadLocalFiles) {
            _patches.push(
                before("uploadLocalFiles", uploadModule, function (args) {
                    if (!hasRealNitro()) {
                        var parsed = args[0] && args[0].parsedMessage;
                        if (parsed) processEmojiMessage(parsed);
                    }
                })
            );
            console.log("[FakeNitro] uploadModule patch OK");
        }
    } catch (e) {
        console.error("[FakeNitro] uploadModule patch error:", e);
    }

    console.log("[FakeNitro] Patches aplicados. Total:", _patches.length);
}

// ─── Settings mínima — só um switch para testar o ciclo de vida ───────────────
function Settings() {
    useProxy(storage);

    // guard: sem JSX, sem generics, createElement puro
    return React.createElement(
        RN.View,
        { style: { padding: 16 } },
        React.createElement(
            RN.View,
            {
                style: {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                },
            },
            React.createElement(
                RN.Text,
                { style: { color: "#fff", fontSize: 16 } },
                "FakeNitro ativo"
            ),
            React.createElement(RN.Switch, {
                value:           !!storage.enabled,
                onValueChange:   function (v) { storage.enabled = v; },
            })
        ),
        React.createElement(
            RN.Text,
            { style: { color: "#aaa", fontSize: 13 } },
            "Emoji externo e stickers serão enviados como links clicáveis."
        )
    );
}

// ─── Export no formato Shiggycord ─────────────────────────────────────────────
// onLoad / onUnload — NÃO start/stop, NÃO definePlugin wrapper
export default {
    onLoad: function () {
        console.log("[FakeNitro] Inicializando...");
        storage.enabled  = storage.enabled  !== undefined ? storage.enabled  : true;
        storage.emojiSize = storage.emojiSize !== undefined ? storage.emojiSize : 48;
        applyPatches();
        console.log("[FakeNitro] Pronto.");
    },

    onUnload: function () {
        console.log("[FakeNitro] Descarregando...");
        unpatchAll();
    },

    settings: Settings,
};
