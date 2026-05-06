/**
 * FakeNitro Unificado — Shiggycord (Android)
 *
 * Bases:
 *  - Freemoji     (Vendetta/maisy & Rico040)
 *  - FreeStickers (Vendetta/aliernfrog)
 *  - FakeNitro    (Rain/John et al.)
 *
 * Fix de build:
 *  - Sem import direto de "react-native" (usa RN via @metro/common)
 *  - Sem import typeof nem tipos Flow complexos
 *  - useReducer com assinatura plana, sem generics aninhados
 *  - React importado como namespace padrão
 */

import React from "react";
import { definePlugin } from "@plugins";
import { after, before, instead } from "@api/patcher";
import { findByProps, findByStoreName } from "@metro";
import { ReactNative as RN } from "@metro/common";

// ─── Shiggy Guard ────────────────────────────────────────────────────────────
// useReducer com assinatura plana — sem generics que o Flow/Hermes rejeita.
// O terceiro argumento (lazy init) evita executar o valor no escopo do módulo.
function useShiggyState(init) {
    var result = React.useReducer(
        function (state, action) {
            return typeof action === "function" ? action(state) : action;
        },
        null,               // ignorado quando há lazy initializer
        function () { return init; }
    );
    return result; // [state, dispatch]
}

// ─── Storage ─────────────────────────────────────────────────────────────────
// Persiste em globalThis entre reloads sem depender de createFileStorage.
var DEFAULT_SETTINGS = {
    emojiSize:             48,
    hyperLink:             true,
    stickerHyperLink:      true,
    fakeEmojisEnabled:     true,
    fakeStickersEnabled:   true,
    appIconsEnabled:       true,
    nitroThemesEnabled:    true,
    removeNitroBtnEnabled: true,
    ignoreNitro:           false,
};

var _raw = Object.assign({}, DEFAULT_SETTINGS);
try {
    var _stored = (globalThis).__shiggy_fakenitro_cfg;
    if (_stored) {
        _raw = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(_stored));
    }
} catch (_e) { /* ignora */ }

function saveSettings() {
    try {
        (globalThis).__shiggy_fakenitro_cfg = JSON.stringify(_raw);
    } catch (_e) { /* ignora */ }
}

var _subscribers = [];

var settings = new Proxy(_raw, {
    set: function (target, prop, value) {
        target[prop] = value;
        saveSettings();
        _subscribers.forEach(function (fn) { fn(); });
        return true;
    },
});

function useSettings() {
    var pair     = useShiggyState(0);
    var dispatch = pair[1];

    var refHolder = React.useRef(null);
    if (!refHolder.current) {
        var fn = function () { dispatch(function (n) { return n + 1; }); };
        _subscribers.push(fn);
        refHolder.current = fn;
    }

    function update(patch) {
        Object.assign(settings, patch);
    }

    return [settings, update];
}

// ─── Metro Lookups ────────────────────────────────────────────────────────────
var nitroInfo       = findByProps("canUseEmojisEverywhere");
var emojiUtils      = findByProps("getEmojiUnavailableReason");
var iconConstants   = findByProps("getOfficialAlternateIcons", "getLimitedAlternateIcons");
var canUseThemes    = findByProps("canUseClientThemes");
var messageModule   = findByProps("sendMessage", "receiveMessage");
var uploadModule    = findByProps("uploadLocalFiles");
var LazyActionSheet = findByProps("openLazy", "hideActionSheet");

var UserStore          = findByStoreName("UserStore");
var EmojiStore         = findByStoreName("EmojiStore");
var SelectedGuildStore = findByStoreName("SelectedGuildStore");
var StickersStore      = findByStoreName("StickersStore");
var ChannelStore       = findByStoreName("ChannelStore");

// ─── UI Components ────────────────────────────────────────────────────────────
// Obtidos via metro — nunca importados de "react-native" diretamente.
var DiscordComponents  = findByProps("TableRow", "TableRowGroup") || {};
var TableSwitchRow     = DiscordComponents.TableSwitchRow;
var TableRadioGroup    = DiscordComponents.TableRadioGroup;
var TableRadioRow      = DiscordComponents.TableRadioRow;
var TableRowGroup      = DiscordComponents.TableRowGroup;
var StackModule        = findByProps("Stack") || {};
var Stack              = StackModule.Stack;

// ─── Helpers ─────────────────────────────────────────────────────────────────
var hasEmotesRegex  = /<a?:(\w+):(\d+)>/i;
var hasEmotesGlobal = /<a?:(\w+):(\d+)>/gi;

function hasRealNitro() {
    if (settings.ignoreNitro) return false;
    var user = UserStore && UserStore.getCurrentUser && UserStore.getCurrentUser();
    return user ? user.premiumType !== null : false;
}

/**
 * URL do emoji com guild_id + name para que o cliente abra o popout nativo
 * ao clicar — comportamento idêntico ao Nitro real.
 */
function buildEmojiURL(emoji, size) {
    var ext    = emoji.animated ? "gif" : "webp";
    var base   = "https://cdn.discordapp.com/emojis/" + emoji.id + "." + ext;
    var params = "size=" + size
        + "&quality=lossless"
        + "&name=" + encodeURIComponent(emoji.name || "");
    if (emoji.guildId) params += "&guild_id=" + emoji.guildId;
    return base + "?" + params;
}

/**
 * URL da figurinha com guild_id + name para popout nativo.
 * format_type: 1=PNG, 2=APNG→PNG, 3=Lottie (não intercepta), 4=GIF
 */
function buildStickerURL(sticker, size) {
    var format = sticker.format_type === 4 ? "gif" : "png";
    var base   = "https://media.discordapp.net/stickers/" + sticker.id + "." + format;
    var params = "size=" + size
        + "&name=" + encodeURIComponent(sticker.name || "");
    if (sticker.guild_id) params += "&guild_id=" + sticker.guild_id;
    return base + "?" + params;
}

/**
 * Hyperlink markdown [label](url).
 * O Discord não gera embed quando há texto âncora → sem borda de imagem.
 */
function toHyperlink(url, label) {
    return "[" + label + "](" + url + ")";
}

// ─── Processamento de mensagem (emoji) ───────────────────────────────────────
function processEmojiMessage(msg) {
    if (!msg || !msg.content) return;
    if (!msg.content.match(hasEmotesRegex)) return;
    if (hasRealNitro()) return;

    var currentGuildId = SelectedGuildStore && SelectedGuildStore.getGuildId
        ? SelectedGuildStore.getGuildId()
        : null;

    var matches = Array.from(msg.content.matchAll(hasEmotesGlobal));

    for (var i = 0; i < matches.length; i++) {
        var match     = matches[i];
        var full      = match[0];
        var emojiName = match[1];
        var emojiId   = match[2];

        var emoji = EmojiStore && EmojiStore.getCustomEmojiById
            ? EmojiStore.getCustomEmojiById(emojiId)
            : null;
        if (!emoji) continue;

        var isExternal = emoji.guildId !== currentGuildId;
        var isAnimated = !!emoji.animated;

        if (!isExternal && !isAnimated) continue;

        var url         = buildEmojiURL(emoji, settings.emojiSize);
        var label       = emoji.name || emojiName;
        var replacement = settings.hyperLink ? toHyperlink(url, label) : url;

        msg.content = msg.content.replace(full, replacement);
    }

    msg.content       = msg.content.trim();
    msg.invalidEmojis = [];
}

// ─── ensureIconName ───────────────────────────────────────────────────────────
function ensureIconName(icon) {
    if (!icon) return icon;
    if (!icon.name && icon.id) {
        var name = icon.id
            .replace(/Icon$/i, "")
            .replace(/_/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
        icon.name = name
            .toLowerCase()
            .split(" ")
            .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
            .join(" ")
            .trim();
    }
    return icon;
}

// ─── Patches ──────────────────────────────────────────────────────────────────
var allPatches = [];

function applyPatches() {

    // ── 1. Nitro Checks ───────────────────────────────────────────────────
    if (nitroInfo) {
        allPatches.push(
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
        allPatches.push(
            instead(stickerCheck, nitroInfo, function (args, orig) {
                return hasRealNitro() ? orig.apply(null, args) : true;
            })
        );
    }

    // ── 1b. Emoji unavailable / premium locked ────────────────────────────
    if (emojiUtils) {
        allPatches.push(
            after("getEmojiUnavailableReason", emojiUtils, function (args, result) {
                if (!settings.fakeEmojisEnabled) return result;
                if (args[0] && args[0].intention === 0 && result === null && !hasRealNitro()) {
                    var emoji   = args[0].emoji;
                    var guildId = args[0].guildId;
                    var channel = args[0].channel;
                    if (!emoji || emoji.type === 0) return result;
                    var cur = guildId || (channel && channel.getGuildId && channel.getGuildId());
                    if (emoji.guildId !== cur || emoji.animated) return 0;
                }
                return result;
            }),
            after("isEmojiPremiumLocked", emojiUtils, function (args, result) {
                if (!settings.fakeEmojisEnabled) return result;
                if (args[0] && args[0].intention === 0 && result === null && !hasRealNitro()) {
                    var emoji   = args[0].emoji;
                    var guildId = args[0].guildId;
                    var channel = args[0].channel;
                    if (!emoji || emoji.type === 0) return result;
                    var cur = guildId || (channel && channel.getGuildId && channel.getGuildId());
                    if (emoji.guildId !== cur || emoji.animated) return true;
                }
                return result;
            })
        );
    }

    // ── 2. sendMessage (emoji) ────────────────────────────────────────────
    if (messageModule) {
        allPatches.push(
            before("sendMessage", messageModule, function (args) {
                if (!settings.fakeEmojisEnabled) return;
                processEmojiMessage(args[1]);
            })
        );

        // ── 3. sendStickers ───────────────────────────────────────────────
        allPatches.push(
            instead("sendStickers", messageModule, function (args, orig) {
                if (!settings.fakeStickersEnabled) return orig.apply(null, args);
                if (hasRealNitro()) return orig.apply(null, args);

                var channelId  = args[0];
                var stickerIds = args[1];
                var extra      = args[3];

                var sticker = StickersStore && StickersStore.getStickerById
                    ? StickersStore.getStickerById(stickerIds)
                    : null;

                if (!sticker) return orig.apply(null, args);
                // Lottie ou pack padrão — não intercepta
                if (sticker.format_type === 3 || sticker.pack_id !== undefined)
                    return orig.apply(null, args);

                // Mesmo servidor — não intercepta
                var ch = ChannelStore && ChannelStore.getChannel
                    ? ChannelStore.getChannel(channelId)
                    : null;
                var channelGuildId = ch ? ch.guild_id : null;
                if (channelGuildId && channelGuildId === sticker.guild_id)
                    return orig.apply(null, args);

                var url     = buildStickerURL(sticker, settings.emojiSize);
                var label   = sticker.name || "sticker";
                var content = settings.stickerHyperLink ? toHyperlink(url, label) : url;

                messageModule.sendMessage(channelId, { content: content }, null, extra);
            })
        );
    }

    // ── Upload com anexo ──────────────────────────────────────────────────
    if (uploadModule && uploadModule.uploadLocalFiles) {
        allPatches.push(
            before("uploadLocalFiles", uploadModule, function (args) {
                if (!settings.fakeEmojisEnabled) return;
                if (hasRealNitro()) return;
                var parsed = args[0] && args[0].parsedMessage;
                if (parsed) processEmojiMessage(parsed);
            })
        );
    }

    // ── 4. App Icons ──────────────────────────────────────────────────────
    if (iconConstants && settings.appIconsEnabled) {
        var listFns = ["getOfficialAlternateIcons", "getLimitedAlternateIcons", "getIcons"];
        listFns.forEach(function (fn) {
            if (!iconConstants[fn]) return;
            allPatches.push(
                after(fn, iconConstants, function (_args, ret) {
                    return ret.map(function (icon) {
                        return Object.assign({}, ensureIconName(icon), { isPremium: false });
                    });
                })
            );
        });

        var singleFns = ["getIconById", "getDefaultIcon"];
        singleFns.forEach(function (fn) {
            if (!iconConstants[fn]) return;
            allPatches.push(
                after(fn, iconConstants, function (_args, ret) {
                    if (ret) { ensureIconName(ret); ret.isPremium = false; }
                    return ret;
                })
            );
        });
    }

    // ── 5. Nitro Themes ───────────────────────────────────────────────────
    if (canUseThemes && canUseThemes.canUseClientThemes && settings.nitroThemesEnabled) {
        allPatches.push(
            instead("canUseClientThemes", canUseThemes, function () { return true; })
        );
    }

    // ── 6. Remove botão "Obter Nitro" ─────────────────────────────────────
    if (LazyActionSheet && settings.removeNitroBtnEnabled) {
        var subPatches = [];

        function isNitroBtn(c) {
            if (!c || !c.props) return false;
            var text = c.props.text || c.props.children;
            return typeof text === "string" && text.toLowerCase().includes("nitro");
        }

        function pruneNitro(arr) {
            if (!Array.isArray(arr)) return;
            for (var i = arr.length - 1; i >= 0; i--) {
                if (isNitroBtn(arr[i])) arr.splice(i, 1);
            }
        }

        function patchSheet(res) {
            return after("type", res, function (_args, component) {
                if (!component) return;
                pruneNitro(component.props && component.props.children);
                if (Array.isArray(component)) pruneNitro(component);
            });
        }

        var unpatchLazy = before("openLazy", LazyActionSheet, function (args) {
            var lazySheet = args[0];
            var name      = args[1];
            if (name !== "MessageEmojiActionSheet" && name !== "MessageCustomEmojiActionSheet")
                return;
            unpatchLazy();
            lazySheet.then(function (module) {
                subPatches.push(
                    after("default", module, function (_args, res) {
                        subPatches.push(patchSheet(res));
                    })
                );
            });
        });

        allPatches.push(function () {
            unpatchLazy();
            subPatches.forEach(function (p) { if (p) p(); });
        });
    }
}

// ─── Settings UI ─────────────────────────────────────────────────────────────
var EMOJI_SIZES = {
    Tiny:   16,
    Small:  32,
    Medium: 48,
    Large:  64,
    Huge:   96,
    Jumbo:  128,
};

var PREVIEW_URI = "https://cdn.discordapp.com/emojis/926602689213767680.webp";

function SettingsScreen() {
    var pair   = useSettings();
    var cfg    = pair[0];
    var update = pair[1];

    // Guard: componentes Discord ainda não carregados
    if (!TableSwitchRow || !TableRowGroup || !Stack) {
        return React.createElement(
            RN.View,
            { style: { padding: 16 } },
            React.createElement(
                RN.Text,
                { style: { color: "#fff" } },
                "Carregando configurações…"
            )
        );
    }

    return React.createElement(
        RN.ScrollView,
        { style: { flex: 1 } },
        React.createElement(
            Stack,
            { style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },

            // ── Funções ──────────────────────────────────────────────────
            React.createElement(
                TableRowGroup,
                { title: "Funções" },
                React.createElement(TableSwitchRow, {
                    label:         "Fake Emojis",
                    subLabel:      "Envia emojis externos como link com clique real",
                    value:         cfg.fakeEmojisEnabled,
                    onValueChange: function (v) { update({ fakeEmojisEnabled: v }); },
                }),
                React.createElement(TableSwitchRow, {
                    label:         "Fake Stickers",
                    subLabel:      "Envia figurinhas de outros servidores como link",
                    value:         cfg.fakeStickersEnabled,
                    onValueChange: function (v) { update({ fakeStickersEnabled: v }); },
                }),
                React.createElement(TableSwitchRow, {
                    label:         "App Icons desbloqueados",
                    subLabel:      "Remove trava premium dos ícones alternativos",
                    value:         cfg.appIconsEnabled,
                    onValueChange: function (v) { update({ appIconsEnabled: v }); },
                }),
                React.createElement(TableSwitchRow, {
                    label:         "Temas Nitro",
                    subLabel:      "Habilita canUseClientThemes",
                    value:         cfg.nitroThemesEnabled,
                    onValueChange: function (v) { update({ nitroThemesEnabled: v }); },
                }),
                React.createElement(TableSwitchRow, {
                    label:         "Remover botão 'Obter Nitro'",
                    subLabel:      "Oculta o botão de compra no menu de emoji",
                    value:         cfg.removeNitroBtnEnabled,
                    onValueChange: function (v) { update({ removeNitroBtnEnabled: v }); },
                }),
                React.createElement(TableSwitchRow, {
                    label:         "Ignorar Nitro real",
                    subLabel:      "Força fake mesmo tendo Nitro ativo",
                    value:         cfg.ignoreNitro,
                    onValueChange: function (v) { update({ ignoreNitro: v }); },
                })
            ),

            // ── Aparência do link ─────────────────────────────────────────
            React.createElement(
                TableRowGroup,
                { title: "Aparência do link" },
                React.createElement(TableSwitchRow, {
                    label:         "Hyperlink para emojis",
                    subLabel:      "[nome](url) — sem preview de imagem",
                    value:         cfg.hyperLink,
                    onValueChange: function (v) { update({ hyperLink: v }); },
                }),
                React.createElement(TableSwitchRow, {
                    label:         "Hyperlink para stickers",
                    subLabel:      "[nome](url) — sem preview de imagem",
                    value:         cfg.stickerHyperLink,
                    onValueChange: function (v) { update({ stickerHyperLink: v }); },
                })
            ),

            // ── Tamanho do emoji ──────────────────────────────────────────
            React.createElement(
                TableRadioGroup,
                {
                    title:        "Tamanho do emoji",
                    defaultValue: String(cfg.emojiSize),
                    onChange:     function (v) { update({ emojiSize: parseInt(v, 10) }); },
                },
                Object.keys(EMOJI_SIZES).map(function (label) {
                    var size = EMOJI_SIZES[label];
                    return React.createElement(TableRadioRow, {
                        key:      String(size),
                        label:    label,
                        subLabel: size + "px",
                        value:    String(size),
                    });
                })
            ),

            // ── Preview ───────────────────────────────────────────────────
            React.createElement(
                TableRowGroup,
                { title: "Preview" },
                React.createElement(RN.Image, {
                    source: {
                        uri:    PREVIEW_URI + "?size=" + cfg.emojiSize,
                        width:  cfg.emojiSize,
                        height: cfg.emojiSize,
                    },
                    style: { margin: 12 },
                })
            )
        )
    );
}

// ─── Plugin Entry ─────────────────────────────────────────────────────────────
export default definePlugin({
    name:        "FakeNitro",
    description: "Emoji, stickers, ícones e temas Nitro — sem precisar de Nitro. Clique real no popout do servidor.",
    id:          "fakenitro-shiggycord",
    version:     "1.0.0",

    start: function () {
        applyPatches();
    },

    stop: function () {
        allPatches.forEach(function (unpatch) { if (unpatch) unpatch(); });
        allPatches.length = 0;
    },

    settings: SettingsScreen,
});
