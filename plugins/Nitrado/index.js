var findByProps = window.vendetta.metro.findByProps;
var findByStoreName = window.vendetta.metro.findByStoreName;
var findByName = window.vendetta.metro.findByName;
var instead = window.vendetta.patcher.instead;
var before = window.vendetta.patcher.before;
var after = window.vendetta.patcher.after;
var React = window.vendetta.metro.common.React;

var patches = [];

// ── Configurações ─────────────────────────────────────────────────────────────
var settings = {
    emojiSize: 48,
    hyperLink: true,
    stickerHyperLink: true,
};

// ── Regex ─────────────────────────────────────────────────────────────────────
var HAS_EMOTES_RE   = /<a?:(\w+):(\d+)>/i;
var CDN_EMOJI_URL   = /https?:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.(\w+)\?([^)\s]*name=([^&)]+)[^)]*)/i;
var CDN_STICKER_URL = /https?:\/\/media\.discordapp\.net\/stickers\/(\d+)\.(\w+)/i;
var HYPERLINK_RE    = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/;

// ── Helpers de URL ────────────────────────────────────────────────────────────
function parsePluginLink(text) {
    if (!text) return null;
    var hl = HYPERLINK_RE.exec(text.trim());
    var url  = hl ? hl[2] : text.trim();
    var name = hl ? hl[1] : null;

    var em = CDN_EMOJI_URL.exec(url);
    if (em) return { type: "emoji", id: em[1], name: name || em[4] || ("emoji_" + em[1]), animated: url.indexOf("animated=true") !== -1, url: url };

    var st = CDN_STICKER_URL.exec(url);
    if (st) return { type: "sticker", id: st[1], name: name || ("sticker_" + st[1]), format: st[2], url: url };

    return null;
}

// ── Action sheet ──────────────────────────────────────────────────────────────
function openEmojiSheet(emojiId, emojiName, animated) {
    try {
        var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
        if (!LazyActionSheet) return;
        var EmojiStore = findByStoreName("EmojiStore");
        var emoji = EmojiStore && EmojiStore.getCustomEmojiById ? EmojiStore.getCustomEmojiById(emojiId) : null;
        var node = {
            id: emojiId,
            name: emojiName || ("emoji_" + emojiId),
            animated: animated || (emoji && emoji.animated) || false,
            type: 1,
            src: "https://cdn.discordapp.com/emojis/" + emojiId + (animated ? ".gif" : ".webp") + "?size=96",
            guildId: emoji ? emoji.guildId : undefined,
            available: true,
        };
        var sheetName = "MessageCustomEmojiActionSheet";
        LazyActionSheet.openLazy(
            new Promise(function(resolve) {
                var m = findByProps("MessageCustomEmojiActionSheet")
                    || findByName("MessageCustomEmojiActionSheet", false)
                    || findByProps("MessageEmojiActionSheet");
                resolve(m || { default: function() { return null; } });
            }),
            sheetName,
            { emojiNode: node }
        );
    } catch(e) {}
}

function openStickerSheet(stickerId) {
    try {
        var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
        var StickersStore = findByStoreName("StickersStore");
        if (!LazyActionSheet || !StickersStore) return;
        var sticker = StickersStore.getStickerById(stickerId);
        if (!sticker) return;
        LazyActionSheet.openLazy(
            new Promise(function(resolve) {
                var m = findByProps("StickerActionSheet") || findByName("StickerActionSheet", false);
                resolve(m || { default: function() { return null; } });
            }),
            "StickerActionSheet",
            { sticker: sticker }
        );
    } catch(e) {}
}

// ── Componentes nativos ───────────────────────────────────────────────────────
function getNativeStickerComponent() {
    return findByName("StickerMessage", false)
        || findByName("Sticker", false)
        || findByProps("StickerMessage")
        || findByProps("renderSticker")
        || null;
}

function getNativeEmojiComponent() {
    return findByName("EmojiNode", false)
        || findByName("Emoji", false)
        || findByProps("EmojiNode")
        || findByProps("renderEmoji")
        || null;
}

// ── Wrapper de Sticker nativo ─────────────────────────────────────────────────
function makeStickerElement(parsed) {
    try {
        var RN = window.vendetta.metro.common.ReactNative;
        var Touchable = RN.TouchableOpacity || RN.TouchableHighlight || RN.Pressable;
        var Image = RN.Image;

        // tenta usar o componente nativo de sticker primeiro
        var StickerMod = getNativeStickerComponent();
        var StickersStore = findByStoreName("StickersStore");
        var nativeSticker = StickersStore && StickersStore.getStickerById
            ? StickersStore.getStickerById(parsed.id)
            : null;

        if (StickerMod && nativeSticker) {
            var StickerComp = StickerMod.StickerMessage || StickerMod.default || StickerMod;
            if (typeof StickerComp === "function") {
                return React.createElement(
                    Touchable,
                    {
                        onPress: function() { openStickerSheet(parsed.id); },
                        activeOpacity: 0.8,
                    },
                    React.createElement(StickerComp, {
                        sticker: nativeSticker,
                        size: 160,
                        onPress: function() { openStickerSheet(parsed.id); },
                    })
                );
            }
        }

        // fallback: imagem com bordas de sticker e onPress para sheet
        return React.createElement(
            Touchable,
            {
                onPress: function() { openStickerSheet(parsed.id); },
                activeOpacity: 0.8,
                style: {
                    marginTop: 4,
                    borderRadius: 12,
                    overflow: "hidden",
                    alignSelf: "flex-start",
                },
            },
            React.createElement(Image, {
                source: { uri: parsed.url, width: 160, height: 160 },
                style: {
                    width: 160,
                    height: 160,
                    borderRadius: 12,
                },
                resizeMode: "contain",
            })
        );
    } catch(e) { return null; }
}

// ── Wrapper de Emoji nativo ───────────────────────────────────────────────────
function makeEmojiElement(parsed) {
    try {
        var RN = window.vendetta.metro.common.ReactNative;
        var Touchable = RN.TouchableOpacity || RN.Pressable;
        var Image = RN.Image;

        var EmojiMod = getNativeEmojiComponent();
        var EmojiStore = findByStoreName("EmojiStore");
        var nativeEmoji = EmojiStore && EmojiStore.getCustomEmojiById
            ? EmojiStore.getCustomEmojiById(parsed.id)
            : null;

        if (EmojiMod && nativeEmoji) {
            var EmojiComp = EmojiMod.EmojiNode || EmojiMod.default || EmojiMod;
            if (typeof EmojiComp === "function") {
                return React.createElement(
                    Touchable,
                    { onPress: function() { openEmojiSheet(parsed.id, parsed.name, parsed.animated); } },
                    React.createElement(EmojiComp, {
                        emoji: nativeEmoji,
                        size: settings.emojiSize,
                        onPress: function() { openEmojiSheet(parsed.id, parsed.name, parsed.animated); },
                    })
                );
            }
        }

        // fallback: imagem com onPress para sheet
        return React.createElement(
            Touchable,
            {
                onPress: function() { openEmojiSheet(parsed.id, parsed.name, parsed.animated); },
                activeOpacity: 0.8,
                style: { alignSelf: "flex-start" },
            },
            React.createElement(Image, {
                source: { uri: parsed.url, width: settings.emojiSize, height: settings.emojiSize },
                style: { width: settings.emojiSize, height: settings.emojiSize },
                resizeMode: "contain",
            })
        );
    } catch(e) { return null; }
}

// ── Varredura de árvore React ─────────────────────────────────────────────────
function walkTree(node, visitor) {
    if (!node || typeof node !== "object") return node;
    var result = visitor(node);
    if (result !== node) return result;

    if (node.props && node.props.children) {
        var children = node.props.children;
        var modified = false;

        if (Array.isArray(children)) {
            var newChildren = [];
            for (var i = 0; i < children.length; i++) {
                var walked = walkTree(children[i], visitor);
                newChildren.push(walked);
                if (walked !== children[i]) modified = true;
            }
            if (modified) {
                // clona o elemento com novos filhos
                return React.cloneElement(node, {}, newChildren);
            }
        } else if (typeof children === "object") {
            var walkedChild = walkTree(children, visitor);
            if (walkedChild !== children) {
                return React.cloneElement(node, {}, walkedChild);
            }
        }
    }
    return node;
}

// verifica se um nó React é um link/texto que contém URL da CDN
function extractCDNFromNode(node) {
    if (!node || typeof node !== "object") return null;

    // nó de texto simples
    if (typeof node.props === "object") {
        var children = node.props.children;

        // texto direto
        if (typeof children === "string") {
            return parsePluginLink(children);
        }

        // array com strings
        if (Array.isArray(children)) {
            var full = "";
            for (var i = 0; i < children.length; i++) {
                if (typeof children[i] === "string") full += children[i];
            }
            if (full) return parsePluginLink(full);
        }

        // link com href (MaskedLink / TextLink)
        if (node.props.href) return parsePluginLink(node.props.href);
        if (node.props.url)  return parsePluginLink(node.props.url);
    }
    return null;
}

// ── Patch principal no renderer ───────────────────────────────────────────────
function patchMessageRenderer() {

    // candidatos ao componente de conteúdo de mensagem
    var candidates = [
        findByName("MessageContent", false),
        findByName("MessageBody", false),
        findByProps("renderMessageContent"),
        findByProps("MessageContent"),
        findByProps("renderContent", "renderEmbeds"),
    ];

    var patched = false;

    for (var ci = 0; ci < candidates.length; ci++) {
        var mod = candidates[ci];
        if (!mod) continue;

        // determina o alvo real (pode ser .default, .MessageContent, etc.)
        var target = null;
        var key    = null;

        if (typeof mod === "function") {
            // módulo é o componente direto — não podemos patchear funções avulsas facilmente,
            // então tentamos via prototype
            if (mod.prototype && mod.prototype.render) {
                target = mod.prototype;
                key    = "render";
            }
        } else if (mod && typeof mod === "object") {
            if (typeof mod.default === "function") { target = mod; key = "default"; }
            else if (typeof mod.MessageContent === "function") { target = mod; key = "MessageContent"; }
            else if (typeof mod.renderMessageContent === "function") { target = mod; key = "renderMessageContent"; }
            else if (typeof mod.renderContent === "function") { target = mod; key = "renderContent"; }
        }

        if (!target || !key) continue;

        patches.push(after(key, target, function(_, result) {
            if (!result) return result;
            try {
                return walkTree(result, function(node) {
                    if (!node || typeof node !== "object" || !node.props) return node;

                    var parsed = extractCDNFromNode(node);
                    if (!parsed) return node;

                    var element = parsed.type === "sticker"
                        ? makeStickerElement(parsed)
                        : makeEmojiElement(parsed);

                    return element || node;
                });
            } catch(e) {
                return result;
            }
        }));

        patched = true;
        break; // um patch é suficiente
    }

    // segunda tentativa: patch no módulo de markdown/inline content
    if (!patched) {
        var inlineMods = [
            findByName("MaskedLink", false),
            findByProps("MaskedLink"),
            findByName("TextLink", false),
            findByProps("renderInlineContent"),
        ];

        for (var ii = 0; ii < inlineMods.length; ii++) {
            var imod = inlineMods[ii];
            if (!imod) continue;

            var itarget = null;
            var ikey    = null;

            if (typeof imod.default === "function") { itarget = imod; ikey = "default"; }
            else if (typeof imod.MaskedLink === "function") { itarget = imod; ikey = "MaskedLink"; }
            else if (typeof imod.renderInlineContent === "function") { itarget = imod; ikey = "renderInlineContent"; }

            if (!itarget || !ikey) continue;

            patches.push(instead(ikey, itarget, function(args, orig) {
                // args[0] geralmente é props: { href, children } ou { url, content }
                var props = args[0] || {};
                var url   = props.href || props.url || "";
                var parsed = parsePluginLink(url);

                if (parsed) {
                    var element = parsed.type === "sticker"
                        ? makeStickerElement(parsed)
                        : makeEmojiElement(parsed);
                    if (element) return element;
                }

                return orig.apply(this, args);
            }));

            patched = true;
            break;
        }
    }
}

// ── removeGetNitroButton ──────────────────────────────────────────────────────
function patchRemoveNitroButton() {
    function isNitroEl(c) {
        if (!c || !c.props) return false;
        var t = c.props.text || c.props.children || "";
        return typeof t === "string" && t.toLowerCase().indexOf("nitro") !== -1;
    }

    function strip(component) {
        if (!component) return;
        if (component.props && Array.isArray(component.props.children)) {
            var ch = component.props.children;
            for (var i = ch.length - 1; i >= 0; i--) {
                if (isNitroEl(ch[i])) ch.splice(i, 1);
                else strip(ch[i]);
            }
        }
    }

    var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
    if (!LazyActionSheet) return;

    var inner = [];
    var unpatchLazy = before("openLazy", LazyActionSheet, function(args) {
        var lazy = args[0];
        var name = args[1];
        if (["MessageEmojiActionSheet", "MessageCustomEmojiActionSheet"].indexOf(name) === -1) return;
        unpatchLazy();
        lazy.then(function(mod) {
            inner.push(after("default", mod, function(_, res) {
                inner.push(after("type", res, function(__, comp) { strip(comp); }));
            }));
        });
    });

    patches.push(function() {
        unpatchLazy();
        for (var i = 0; i < inner.length; i++) { if (typeof inner[i] === "function") inner[i](); }
    });
}

// ── Utils: envio ──────────────────────────────────────────────────────────────
function extractUnusableEmojis(messageString, size) {
    var EmojiStore = findByStoreName("EmojiStore");
    var SelectedGuildStore = findByStoreName("SelectedGuildStore");
    var getCustomEmojiById = EmojiStore && EmojiStore.getCustomEmojiById;
    var getGuildId = SelectedGuildStore && SelectedGuildStore.getGuildId;
    var currentGuildId = getGuildId ? getGuildId() : null;
    var emojiUrls = [];
    var found = [];
    var re = /<a?:(\w+):(\d+)>/gi;
    var m;
    while ((m = re.exec(messageString)) !== null) {
        found.push({ full: m[0], name: m[1], id: m[2] });
    }
    for (var i = 0; i < found.length; i++) {
        var f = found[i];
        var emoji = getCustomEmojiById ? getCustomEmojiById(f.id) : null;
        if (!emoji) continue;
        if (emoji.guildId !== currentGuildId || emoji.animated) {
            messageString = messageString.replace(f.full, "");
            var baseUrl  = emoji.url ? emoji.url.split("?")[0] : "https://cdn.discordapp.com/emojis/" + emoji.id + ".webp";
            var animated = emoji.animated ? "&animated=true" : "";
            var fullUrl  = baseUrl + "?size=" + size + "&name=" + (emoji.name || f.name) + animated;
            emojiUrls.push(settings.hyperLink
                ? "[" + (emoji.name || f.name) + "](" + fullUrl + ")"
                : fullUrl);
        }
    }
    return { newContent: messageString.trim(), extractedEmojis: emojiUrls };
}

function modifyIfNeeded(msg) {
    if (!msg || !msg.content) return;
    if (!HAS_EMOTES_RE.test(msg.content)) return;
    var result = extractUnusableEmojis(msg.content, settings.emojiSize);
    msg.content = result.newContent;
    if (result.extractedEmojis.length > 0) {
        msg.content += "\n" + result.extractedEmojis.join("\n");
    }
    msg.invalidEmojis = [];
}

function buildStickerURL(sticker) {
    switch (sticker.format_type) {
        case 1:  return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        case 2:  return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        default: return "https://media.discordapp.net/stickers/" + sticker.id + ".gif";
    }
}

// ── onLoad ────────────────────────────────────────────────────────────────────
function onLoad() {
    var nitroInfo     = findByProps("canUseEmojisEverywhere");
    var StickerUtils  = findByProps("getStickerSendability");
    var MessageModule = findByProps("sendMessage", "receiveMessage");
    var uploadModule  = findByProps("uploadLocalFiles");
    var UserStore     = findByStoreName("UserStore");
    var StickersStore = findByStoreName("StickersStore");
    var ChannelStore  = findByStoreName("ChannelStore");

    var SENDABLE = (StickerUtils && StickerUtils.StickerSendability)
        ? (StickerUtils.StickerSendability.SENDABLE !== undefined ? StickerUtils.StickerSendability.SENDABLE : 0)
        : 0;

    function hasNitro() {
        var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
        return user && user.premiumType !== null;
    }

    // Nitro checks
    if (nitroInfo) {
        patches.push(instead("canUseEmojisEverywhere", nitroInfo, function(args, orig) {
            return hasNitro() ? orig.apply(this, args) : true;
        }));
        patches.push(instead("canUseAnimatedEmojis", nitroInfo, function(args, orig) {
            return hasNitro() ? orig.apply(this, args) : true;
        }));
        var sck = nitroInfo.canUseCustomStickersEverywhere ? "canUseCustomStickersEverywhere" : "canUseStickersEverywhere";
        if (nitroInfo[sck]) {
            patches.push(instead(sck, nitroInfo, function(args, orig) {
                return hasNitro() ? orig.apply(this, args) : true;
            }));
        }
    }

    // Sticker sendability
    if (StickerUtils) {
        if (StickerUtils.getStickerSendability) patches.push(instead("getStickerSendability", StickerUtils, function() { return SENDABLE; }));
        if (StickerUtils.isSendableSticker)     patches.push(instead("isSendableSticker",     StickerUtils, function() { return true; }));
    }

    // sendMessage
    if (MessageModule) {
        patches.push(before("sendMessage", MessageModule, function(args) {
            if (!hasNitro()) modifyIfNeeded(args[1]);
        }));

        patches.push(instead("sendStickers", MessageModule, function(args, origFunc) {
            if (hasNitro()) return origFunc.apply(this, args);
            var channelId  = args[0];
            var stickerIds = args[1];
            var extra      = args[3];
            var ids = Array.isArray(stickerIds) ? stickerIds : [stickerIds];

            for (var i = 0; i < ids.length; i++) {
                var sticker = StickersStore && StickersStore.getStickerById ? StickersStore.getStickerById(ids[i]) : null;
                if (!sticker) { origFunc.apply(this, args); continue; }
                if (sticker.format_type === 3 || sticker.pack_id !== undefined) { origFunc.apply(this, args); continue; }
                var cgid = ChannelStore && ChannelStore.getChannel ? (ChannelStore.getChannel(channelId) || {}).guild_id : null;
                if (cgid && cgid === sticker.guild_id) { origFunc.apply(this, args); continue; }

                var stickerName = sticker.name || "Sticker";
                var stickerURL  = buildStickerURL(sticker);
                var content = settings.stickerHyperLink
                    ? "[" + stickerName + "](" + stickerURL + ")"
                    : stickerURL;
                MessageModule.sendMessage(channelId, { content: content }, null, extra);
            }
        }));

        if (uploadModule && uploadModule.uploadLocalFiles !== undefined) {
            patches.push(before("uploadLocalFiles", uploadModule, function(args) {
                if (!hasNitro() && args[0] && args[0].parsedMessage) modifyIfNeeded(args[0].parsedMessage);
            }));
        }
    }

    // EXPERIMENTAL: renderer patch
    patchMessageRenderer();

    // Remove botão Nitro da action sheet
    patchRemoveNitroButton();
}

// ── onUnload ──────────────────────────────────────────────────────────────────
function onUnload() {
    for (var i = 0; i < patches.length; i++) {
        if (typeof patches[i] === "function") patches[i]();
    }
    patches.length = 0;
}

module.exports = { onLoad: onLoad, onUnload: onUnload };
