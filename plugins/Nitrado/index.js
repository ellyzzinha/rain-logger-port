var findByProps = window.vendetta.metro.findByProps;
var findByStoreName = window.vendetta.metro.findByStoreName;
var after = window.vendetta.patcher.after;
var before = window.vendetta.patcher.before;
var instead = window.vendetta.patcher.instead;
var React = window.vendetta.metro.common.React;

var patches = [];

var HAS_EMOTES_RE    = /<a?:(\w+):(\d+)>/i;
var CDN_STICKER_RE   = /https?:\/\/media\.discordapp\.net\/stickers\/(\d+)\.(png|gif)/i;
var CDN_EMOJI_RE     = /https?:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\./i;
var HYPERLINK_RE     = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;

function isStickerURL(url) {
    return typeof url === "string" && CDN_STICKER_RE.test(url);
}
function isEmojiURL(url) {
    return typeof url === "string" && CDN_EMOJI_RE.test(url);
}
function isPluginURL(url) {
    return isStickerURL(url) || isEmojiURL(url);
}
function extractURL(content) {
    if (!content) return null;
    // URL nua
    if (isPluginURL(content.trim())) return content.trim();
    // hyperlink markdown
    var m = HYPERLINK_RE.exec(content.trim());
    if (m && isPluginURL(m[2])) return m[2];
    return null;
}

// ── Patch de embed de imagem ──────────────────────────────────────────────────
function patchEmbedRenderer() {
    var RN = window.vendetta.metro.common.ReactNative;

    // candidatos ao componente de embed de imagem
    var embedMods = [
        findByProps("ImageEmbed"),
        findByProps("renderImageEmbed"),
        findByProps("EmbedImage"),
        findByName && findByName("ImageEmbed", false),
        findByName && findByName("EmbedImage", false),
        findByName && findByName("MediaEmbed", false),
        findByProps("renderMedia", "renderImage"),
    ].filter(Boolean);

    var patched = false;

    for (var i = 0; i < embedMods.length; i++) {
        var mod = embedMods[i];
        var keys = ["ImageEmbed", "EmbedImage", "MediaEmbed",
                    "renderImageEmbed", "renderMedia", "default"];

        for (var k = 0; k < keys.length; k++) {
            if (typeof mod[keys[k]] !== "function") continue;

            (function(m, key) {
                patches.push(after(key, m, function(args, result) {
                    if (!result) return;
                    try {
                        // verifica se a URL da mensagem é do plugin
                        var props = args[0] || {};
                        var url   = props.url || props.src
                            || (props.embed && props.embed.url)
                            || (props.embed && props.embed.image && props.embed.image.url)
                            || "";

                        if (!isPluginURL(url)) return;

                        // força estilo de sticker: quadrado, sem bordas de foto
                        return applyStylePatch(result, isStickerURL(url) ? 160 : 48);
                    } catch(e) {}
                }));
            })(mod, keys[k]);

            patched = true;
            break;
        }
        if (patched) break;
    }

    // segunda tentativa: patch no componente de attachment/imagem inline
    var attachMods = [
        findByProps("renderAttachment"),
        findByProps("MediaAttachment"),
        findByName && findByName("Attachment", false),
        findByName && findByName("MediaAttachment", false),
    ].filter(Boolean);

    for (var ai = 0; ai < attachMods.length; ai++) {
        var amod = attachMods[ai];
        var akeys = ["MediaAttachment", "renderAttachment", "Attachment", "default"];
        for (var ak = 0; ak < akeys.length; ak++) {
            if (typeof amod[akeys[ak]] !== "function") continue;
            (function(m, key) {
                patches.push(after(key, m, function(args, result) {
                    if (!result) return;
                    try {
                        var props = args[0] || {};
                        var url   = props.url || props.src || "";
                        if (!isPluginURL(url)) return;
                        return applyStylePatch(result, isStickerURL(url) ? 160 : 48);
                    } catch(e) {}
                }));
            })(amod, akeys[ak]);
            break;
        }
    }
}

// aplica estilo de sticker num elemento React
function applyStylePatch(element, size) {
    if (!element || !element.props) return element;
    var RN = window.vendetta.metro.common.ReactNative;

    // se for um elemento de imagem direto
    if (element.type === RN.Image || element.type === "Image") {
        return React.cloneElement(element, {
            style: Object.assign({}, flattenStyle(element.props.style), {
                width:        size,
                height:       size,
                borderRadius: 4,
            }),
        });
    }

    // se for um wrapper (View, TouchableOpacity, etc.) — clona com estilo e
    // tenta aplicar nos filhos também
    var newStyle = Object.assign({}, flattenStyle(element.props.style), {
        width:        size,
        height:       size,
        borderRadius: 4,
        overflow:     "hidden",
    });

    var newChildren = element.props.children;
    if (newChildren) {
        newChildren = patchChildren(newChildren, size);
    }

    return React.cloneElement(element, { style: newStyle }, newChildren);
}

function patchChildren(children, size) {
    if (!children) return children;
    var RN = window.vendetta.metro.common.ReactNative;

    if (Array.isArray(children)) {
        return children.map(function(c) { return patchChildren(c, size); });
    }
    if (typeof children !== "object" || !children.props) return children;

    // imagem encontrada — aplica tamanho e borderRadius
    if (children.type === RN.Image || children.type === "Image"
        || (children.props && (children.props.source || children.props.src))) {
        return React.cloneElement(children, {
            style: Object.assign({}, flattenStyle(children.props.style), {
                width:        size,
                height:       size,
                borderRadius: 4,
            }),
        });
    }

    // wrapper — desce recursivo
    if (children.props.children) {
        return React.cloneElement(children, {
            style: Object.assign({}, flattenStyle(children.props.style), {
                borderRadius: 4,
                overflow:     "hidden",
            }),
        }, patchChildren(children.props.children, size));
    }

    return children;
}

function flattenStyle(style) {
    if (!style) return {};
    if (Array.isArray(style)) {
        var merged = {};
        for (var i = 0; i < style.length; i++) {
            Object.assign(merged, flattenStyle(style[i]));
        }
        return merged;
    }
    if (typeof style === "object") return style;
    return {};
}

// ── buildStickerURL ───────────────────────────────────────────────────────────
function buildStickerURL(sticker) {
    switch (sticker.format_type) {
        case 1: return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        case 2: return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        default: return "https://media.discordapp.net/stickers/" + sticker.id + ".gif";
    }
}

// ── extractUnusableEmojis ─────────────────────────────────────────────────────
function extractUnusableEmojis(messageString, size, hyperLink) {
    var EmojiStore         = findByStoreName("EmojiStore");
    var SelectedGuildStore = findByStoreName("SelectedGuildStore");
    var getCustomEmojiById = EmojiStore && EmojiStore.getCustomEmojiById;
    var getGuildId         = SelectedGuildStore && SelectedGuildStore.getGuildId;
    var currentGuildId     = getGuildId ? getGuildId() : null;
    var emojiUrls          = [];
    var found              = [];
    var re = /<a?:(\w+):(\d+)>/gi;
    var m;

    while ((m = re.exec(messageString)) !== null)
        found.push({ full: m[0], name: m[1], id: m[2] });

    for (var i = 0; i < found.length; i++) {
        var f     = found[i];
        var emoji = getCustomEmojiById ? getCustomEmojiById(f.id) : null;
        if (!emoji) continue;
        if (emoji.guildId !== currentGuildId || emoji.animated) {
            messageString    = messageString.replace(f.full, "");
            var url          = emoji.url
                ? emoji.url
                : "https://cdn.discordapp.com/emojis/" + emoji.id + ".webp?size=44&animated=" + (emoji.animated ? "true" : "false");
            var animated     = emoji.animated ? "&animated=" + emoji.animated : "";
            var base         = url.split("?")[0];
            var emojiName    = emoji.name || f.name;
            var fullUrl      = base + "?size=" + size + "&name=" + emojiName + animated;
            emojiUrls.push(hyperLink
                ? "[" + emojiName + "](" + fullUrl + ")"
                : fullUrl);
        }
    }
    return { newContent: messageString.trim(), extractedEmojis: emojiUrls };
}

function modifyIfNeeded(msg, emojiSize, hyperLink) {
    if (!msg || !msg.content) return;
    if (!HAS_EMOTES_RE.test(msg.content)) return;
    var result      = extractUnusableEmojis(msg.content, emojiSize, hyperLink);
    msg.content     = result.newContent;
    if (result.extractedEmojis.length > 0)
        msg.content += "\n" + result.extractedEmojis.join("\ni");
    msg.invalidEmojis = [];
}

// ── removeGetNitroButton ──────────────────────────────────────────────────────
function findInReactTree(tree, predicate) {
    if (!tree) return null;
    if (predicate(tree)) return tree;
    var children = tree.props && tree.props.children;
    if (!children) return null;
    if (Array.isArray(children)) {
        for (var i = 0; i < children.length; i++) {
            var r = findInReactTree(children[i], predicate);
            if (r) return r;
        }
    } else if (typeof children === "object") {
        return findInReactTree(children, predicate);
    }
    return null;
}

function patchSheet(funcName, sheetModule, once) {
    var unpatch = after(funcName, sheetModule, function(args, res) {
        var emojiNode = args[0] && args[0].emojiNode;
        if (!emojiNode || !emojiNode.src) return;
        var view = res && res.props && res.props.children
            && res.props.children.props && res.props.children.props.children;
        if (!view) return;
        after("type", view, function(_, component) {
            var isButton   = function(c) { return c && c.type && c.type.name === "Button"; };
            var isGetNitro = function(c) {
                if (!c || !c.props) return false;
                var t = c.props.text || c.props.children || "";
                return typeof t === "string" && t.toLowerCase().indexOf("nitro") !== -1;
            };
            var bc = findInReactTree(component, function(c) {
                return Array.isArray(c) && c.some(isButton);
            });
            if (bc) {
                for (var i = bc.length - 1; i >= 0; i--)
                    if (isGetNitro(bc[i])) bc.splice(i, 1);
            } else if (component && component.props && Array.isArray(component.props.children)) {
                var ch = component.props.children;
                for (var j = ch.length - 1; j >= 0; j--)
                    if (isGetNitro(ch[j])) ch.splice(j, 1);
            }
        });
        if (once) unpatch();
    });
    return unpatch;
}

function applyRemoveNitroButtonPatch() {
    var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
    if (!LazyActionSheet) return;
    var inner       = [];
    var unpatchLazy = before("openLazy", LazyActionSheet, function(args) {
        var lazy = args[0]; var name = args[1];
        if (name !== "MessageEmojiActionSheet" && name !== "MessageCustomEmojiActionSheet") return;
        unpatchLazy();
        lazy.then(function(mod) {
            inner.push(after("default", mod, function(_, res) {
                inner.push(patchSheet("type", res, true));
            }));
        });
    });
    patches.push(function() {
        unpatchLazy();
        for (var i = 0; i < inner.length; i++)
            if (typeof inner[i] === "function") inner[i]();
    });
}

// ── onLoad ────────────────────────────────────────────────────────────────────
function onLoad() {
    var nitroInfo    = findByProps("canUseEmojisEverywhere");
    var StickerUtils = findByProps("getStickerSendability");
    var MsgModule    = findByProps("sendMessage", "receiveMessage");
    var uploadMod    = findByProps("uploadLocalFiles");
    var UserStore    = findByStoreName("UserStore");
    var StickerStore = findByStoreName("StickersStore");
    var ChanStore    = findByStoreName("ChannelStore");

    var emojiSize        = 48;
    var hyperLink        = true;
    var stickerHyperLink = true;

    var SENDABLE = 0;
    if (StickerUtils && StickerUtils.StickerSendability)
        SENDABLE = StickerUtils.StickerSendability.SENDABLE !== undefined
            ? StickerUtils.StickerSendability.SENDABLE : 0;

    function hasNitro() {
        var u = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
        return u && u.premiumType !== null;
    }

    // nitro checks
    if (nitroInfo) {
        patches.push(instead("canUseEmojisEverywhere", nitroInfo, function(a, o) { return hasNitro() ? o.apply(this,a) : true; }));
        patches.push(instead("canUseAnimatedEmojis",   nitroInfo, function(a, o) { return hasNitro() ? o.apply(this,a) : true; }));
        var sck = nitroInfo.canUseCustomStickersEverywhere ? "canUseCustomStickersEverywhere" : "canUseStickersEverywhere";
        if (nitroInfo[sck])
            patches.push(instead(sck, nitroInfo, function(a, o) { return hasNitro() ? o.apply(this,a) : true; }));
    }

    // sticker UI
    if (StickerUtils) {
        if (StickerUtils.getStickerSendability) patches.push(instead("getStickerSendability", StickerUtils, function() { return SENDABLE; }));
        if (StickerUtils.isSendableSticker)     patches.push(instead("isSendableSticker",     StickerUtils, function() { return true; }));
    }

    // sendMessage
    if (MsgModule) {
        patches.push(before("sendMessage", MsgModule, function(args) {
            if (!hasNitro()) modifyIfNeeded(args[1], emojiSize, hyperLink);
        }));

        patches.push(instead("sendStickers", MsgModule, function(args, orig) {
            if (hasNitro()) return orig.apply(this, args);
            var sticker = StickerStore && StickerStore.getStickerById ? StickerStore.getStickerById(args[1]) : null;
            if (!sticker) return orig.apply(this, args);
            if (sticker.format_type === 3 || sticker.pack_id !== undefined) return orig.apply(this, args);
            var cgid = ChanStore && ChanStore.getChannel ? (ChanStore.getChannel(args[0]) || {}).guild_id : null;
            if (cgid && cgid === sticker.guild_id) return orig.apply(this, args);
            var url  = buildStickerURL(sticker);
            var name = sticker.name || "FakeNitroSticker";
            MsgModule.sendMessage(args[0], {
                content: stickerHyperLink ? "[" + name + "](" + url + ")" : url
            }, null, args[3]);
        }));

        if (uploadMod && uploadMod.uploadLocalFiles !== undefined)
            patches.push(before("uploadLocalFiles", uploadMod, function(args) {
                if (!hasNitro() && args[0] && args[0].parsedMessage)
                    modifyIfNeeded(args[0].parsedMessage, emojiSize, hyperLink);
            }));
    }

    // EXPERIMENTAL: patch visual de embed → sticker
    patchEmbedRenderer();

    // remove botão nitro da action sheet
    applyRemoveNitroButtonPatch();
}

// ── onUnload ──────────────────────────────────────────────────────────────────
function onUnload() {
    for (var i = 0; i < patches.length; i++)
        if (typeof patches[i] === "function") patches[i]();
    patches.length = 0;
}

module.exports = { onLoad: onLoad, onUnload: onUnload };
