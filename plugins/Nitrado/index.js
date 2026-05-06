var findByProps = window.vendetta.metro.findByProps;
var findByStoreName = window.vendetta.metro.findByStoreName;
var findByName = window.vendetta.metro.findByName;
var instead = window.vendetta.patcher.instead;
var before = window.vendetta.patcher.before;
var after = window.vendetta.patcher.after;

var patches = [];

// ── Configurações padrão ──────────────────────────────────────────────────────
var settings = {
    emojiSize: 48,
    hyperLink: true,
    stickerHyperLink: true,
};

// ── Regex helpers ─────────────────────────────────────────────────────────────
var HAS_EMOTES_RE  = /<a?:(\w+):(\d+)>/i;
var CDN_EMOJI_RE   = /https?:\/\/cdn\.discordapp\.com\/emojis\/(\d+)\.\w+[^\s)"]*/gi;
var CDN_STICKER_RE = /https?:\/\/media\.discordapp\.net\/stickers\/(\d+)\.\w+[^\s)"]*/gi;
var HYPERLINK_RE   = /\[([^\]]+)\]\((https?:\/\/(?:cdn\.discordapp\.com\/emojis|media\.discordapp\.net\/stickers)\/(\d+)\.\w+[^)]*)\)/gi;

// ── Utils ─────────────────────────────────────────────────────────────────────
var HAS_EMOTES_SIMPLE = /<a?:(\w+):(\d+)>/i;

function extractUnusableEmojis(messageString, size) {
    var EmojiStore        = findByStoreName("EmojiStore");
    var SelectedGuildStore = findByStoreName("SelectedGuildStore");
    var getCustomEmojiById = EmojiStore && EmojiStore.getCustomEmojiById;
    var getGuildId         = SelectedGuildStore && SelectedGuildStore.getGuildId;
    var currentGuildId     = getGuildId ? getGuildId() : null;

    var emojiUrls = [];
    var found     = [];
    var re        = /<a?:(\w+):(\d+)>/gi;
    var m;

    while ((m = re.exec(messageString)) !== null) {
        found.push({ full: m[0], name: m[1], id: m[2] });
    }

    for (var i = 0; i < found.length; i++) {
        var f     = found[i];
        var emoji = getCustomEmojiById ? getCustomEmojiById(f.id) : null;
        if (!emoji) continue;

        if (emoji.guildId !== currentGuildId || emoji.animated) {
            messageString = messageString.replace(f.full, "");

            var baseUrl  = emoji.url ? emoji.url.split("?")[0] : "https://cdn.discordapp.com/emojis/" + emoji.id + ".webp";
            var animated = emoji.animated ? "&animated=true" : "";
            var fullUrl  = baseUrl + "?size=" + size + "&name=" + (emoji.name || f.name) + animated;

            if (settings.hyperLink) {
                emojiUrls.push("[" + (emoji.name || f.name) + "](" + fullUrl + ")");
            } else {
                emojiUrls.push(fullUrl);
            }
        }
    }

    return { newContent: messageString.trim(), extractedEmojis: emojiUrls };
}

function modifyIfNeeded(msg) {
    if (!msg || !msg.content) return;
    if (!HAS_EMOTES_SIMPLE.test(msg.content)) return;

    var result   = extractUnusableEmojis(msg.content, settings.emojiSize);
    msg.content  = result.newContent;

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

// ── Experimental: action sheet helpers ───────────────────────────────────────

// tenta abrir a action sheet de emoji customizado
function tryOpenEmojiSheet(emojiId, emojiName) {
    try {
        var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
        if (!LazyActionSheet) return;

        var EmojiStore = findByStoreName("EmojiStore");
        var emoji      = EmojiStore && EmojiStore.getCustomEmojiById
            ? EmojiStore.getCustomEmojiById(emojiId)
            : null;

        // monta um emojiNode mínimo que o action sheet consegue consumir
        var emojiNode = {
            id:        emojiId,
            name:      emojiName || ("emoji_" + emojiId),
            animated:  false,
            type:      1,                  // custom emoji
            src:       "https://cdn.discordapp.com/emojis/" + emojiId + ".webp?size=96",
            guildId:   emoji ? emoji.guildId  : undefined,
            available: true,
        };

        if (emoji) {
            emojiNode.animated = !!emoji.animated;
            if (emoji.animated) {
                emojiNode.src = "https://cdn.discordapp.com/emojis/" + emojiId + ".gif?size=96";
            }
        }

        // tenta o sheet novo primeiro, depois o legado
        var sheetName = "MessageCustomEmojiActionSheet";
        LazyActionSheet.openLazy(
            // o Discord espera uma promise que resolve num módulo com .default
            new Promise(function(resolve) {
                var mod = findByProps("MessageCustomEmojiActionSheet") ||
                          findByName("MessageCustomEmojiActionSheet", false) ||
                          findByProps("MessageEmojiActionSheet");
                if (mod) {
                    resolve(mod);
                } else {
                    // fallback: deixa o Discord carregar lazy
                    resolve({ default: function() { return null; } });
                }
            }),
            sheetName,
            { emojiNode: emojiNode }
        );
    } catch (e) {
        // silencia — experimental
    }
}

// tenta abrir o sticker picker / info sheet
function tryOpenStickerSheet(stickerId) {
    try {
        var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
        var StickersStore   = findByStoreName("StickersStore");
        if (!LazyActionSheet || !StickersStore) return;

        var sticker = StickersStore.getStickerById(stickerId);
        if (!sticker) return;

        LazyActionSheet.openLazy(
            new Promise(function(resolve) {
                var mod = findByProps("StickerActionSheet") ||
                          findByName("StickerActionSheet", false);
                if (mod) resolve(mod);
                else resolve({ default: function() { return null; } });
            }),
            "StickerActionSheet",
            { sticker: sticker }
        );
    } catch (e) {
        // silencia — experimental
    }
}

// ── Experimental: patch no renderer de mensagem ───────────────────────────────

// Extrai id e nome de um link markdown de emoji/sticker
function parseCDNLink(text) {
    // tenta hyperlink markdown: [nome](url)
    var hlRe = /\[([^\]]+)\]\((https?:\/\/(cdn\.discordapp\.com\/emojis|media\.discordapp\.net\/stickers)\/(\d+)\.\w+[^)]*)\)/i;
    var m = hlRe.exec(text);
    if (m) {
        var isSticker = m[3].indexOf("stickers") !== -1;
        return { name: m[1], id: m[4], url: m[2], isSticker: isSticker };
    }
    // tenta URL nua
    var urlRe = /https?:\/\/(cdn\.discordapp\.com\/emojis|media\.discordapp\.net\/stickers)\/(\d+)\.\w+/i;
    m = urlRe.exec(text);
    if (m) {
        var isSticker = m[1].indexOf("stickers") !== -1;
        return { name: isSticker ? "sticker" : "emoji", id: m[2], url: m[0], isSticker: isSticker };
    }
    return null;
}

function patchMessageRenderer() {
    // tenta encontrar o componente de link inline que o Discord usa para renderizar markdown
    var possibleLinkModules = [
        findByProps("handleLinkPress", "handleLinkLongPress"),
        findByProps("onLinkPress", "onLinkLongPress"),
        findByProps("renderInlineContent"),
        findByName("TextLink", false),
        findByName("MaskedLink", false),
        findByProps("MaskedLink"),
    ];

    for (var i = 0; i < possibleLinkModules.length; i++) {
        var mod = possibleLinkModules[i];
        if (!mod) continue;

        // tenta patchear handleLinkPress
        if (mod.handleLinkPress) {
            patches.push(instead("handleLinkPress", mod, function(args, orig) {
                var url = args[0];
                if (typeof url === "string") {
                    var parsed = parseCDNLink(url);
                    if (parsed) {
                        if (parsed.isSticker) tryOpenStickerSheet(parsed.id);
                        else tryOpenEmojiSheet(parsed.id, parsed.name);
                        return;
                    }
                }
                return orig.apply(this, args);
            }));
            break;
        }

        // tenta patchear onLinkPress
        if (mod.onLinkPress) {
            patches.push(instead("onLinkPress", mod, function(args, orig) {
                var url = args[0];
                if (typeof url === "string") {
                    var parsed = parseCDNLink(url);
                    if (parsed) {
                        if (parsed.isSticker) tryOpenStickerSheet(parsed.id);
                        else tryOpenEmojiSheet(parsed.id, parsed.name);
                        return;
                    }
                }
                return orig.apply(this, args);
            }));
            break;
        }
    }

    // segunda tentativa: patch no módulo de URL handling do Discord
    var URLUtils = findByProps("handleSupportedURL") || findByProps("openURL");
    if (URLUtils && URLUtils.handleSupportedURL) {
        patches.push(instead("handleSupportedURL", URLUtils, function(args, orig) {
            var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url);
            if (url) {
                var parsed = parseCDNLink(url);
                if (parsed) {
                    if (parsed.isSticker) tryOpenStickerSheet(parsed.id);
                    else tryOpenEmojiSheet(parsed.id, parsed.name);
                    return;
                }
            }
            return orig.apply(this, args);
        }));
    }

    // terceira tentativa: patch no Linking do React Native
    try {
        var Linking = window.vendetta.metro.common.ReactNative
            ? window.vendetta.metro.common.ReactNative.Linking
            : null;

        if (!Linking) {
            var RN = findByProps("openURL", "canOpenURL");
            if (RN && RN.openURL) Linking = RN;
        }

        if (Linking && Linking.openURL) {
            patches.push(instead("openURL", Linking, function(args, orig) {
                var url = args[0];
                if (typeof url === "string") {
                    var parsed = parseCDNLink(url);
                    if (parsed) {
                        if (parsed.isSticker) tryOpenStickerSheet(parsed.id);
                        else tryOpenEmojiSheet(parsed.id, parsed.name);
                        return Promise.resolve();
                    }
                }
                return orig.apply(this, args);
            }));
        }
    } catch(e) { /* silencia */ }
}

// ── removeGetNitroButton (rain/patches/removeGetNitroButton.ts) ───────────────
function patchRemoveNitroButton() {
    function isGetNitroElement(c) {
        if (!c || !c.props) return false;
        var text = c.props.text || c.props.children || "";
        return typeof text === "string" && text.toLowerCase().indexOf("nitro") !== -1;
    }

    function findInTree(tree, predicate) {
        if (!tree) return null;
        if (predicate(tree)) return tree;
        var children = tree.props && tree.props.children;
        if (Array.isArray(children)) {
            for (var i = 0; i < children.length; i++) {
                var r = findInTree(children[i], predicate);
                if (r) return r;
            }
        } else if (children && typeof children === "object") {
            return findInTree(children, predicate);
        }
        return null;
    }

    function stripNitroButtons(component) {
        if (!component) return;

        // procura container de botões
        var buttonsContainer = findInTree(component, function(c) {
            return Array.isArray(c) && c.some(function(child) {
                return child && child.type && child.type.name === "Button";
            });
        });

        if (buttonsContainer) {
            for (var i = buttonsContainer.length - 1; i >= 0; i--) {
                if (isGetNitroElement(buttonsContainer[i])) {
                    buttonsContainer.splice(i, 1);
                }
            }
        }

        if (component.props && Array.isArray(component.props.children)) {
            var ch = component.props.children;
            for (var j = ch.length - 1; j >= 0; j--) {
                if (isGetNitroElement(ch[j])) ch.splice(j, 1);
            }
        }
    }

    var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
    if (!LazyActionSheet) return;

    var innerPatches = [];

    var unpatchLazy = before("openLazy", LazyActionSheet, function(args) {
        var lazySheet = args[0];
        var name      = args[1];

        if (["MessageEmojiActionSheet", "MessageCustomEmojiActionSheet"].indexOf(name) === -1) return;

        unpatchLazy();

        lazySheet.then(function(module) {
            innerPatches.push(after("default", module, function(_, res) {
                innerPatches.push(after("type", res, function(__, component) {
                    stripNitroButtons(component);
                }));
            }));
        });
    });

    patches.push(function() {
        unpatchLazy();
        for (var i = 0; i < innerPatches.length; i++) {
            if (typeof innerPatches[i] === "function") innerPatches[i]();
        }
    });
}

// ── onLoad / onUnload ─────────────────────────────────────────────────────────
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

    // 1. Nitro checks
    if (nitroInfo) {
        patches.push(instead("canUseEmojisEverywhere", nitroInfo, function(args, orig) {
            if (hasNitro()) return orig.apply(this, args);
            return true;
        }));
        patches.push(instead("canUseAnimatedEmojis", nitroInfo, function(args, orig) {
            if (hasNitro()) return orig.apply(this, args);
            return true;
        }));

        var stickerCheckName = nitroInfo.canUseCustomStickersEverywhere
            ? "canUseCustomStickersEverywhere"
            : "canUseStickersEverywhere";
        if (nitroInfo[stickerCheckName]) {
            patches.push(instead(stickerCheckName, nitroInfo, function(args, orig) {
                if (hasNitro()) return orig.apply(this, args);
                return true;
            }));
        }
    }

    // 2. Sticker sendability
    if (StickerUtils) {
        if (StickerUtils.getStickerSendability) {
            patches.push(instead("getStickerSendability", StickerUtils, function() { return SENDABLE; }));
        }
        if (StickerUtils.isSendableSticker) {
            patches.push(instead("isSendableSticker", StickerUtils, function() { return true; }));
        }
    }

    // 3. sendMessage — emojis
    if (MessageModule) {
        patches.push(before("sendMessage", MessageModule, function(args) {
            if (!hasNitro()) modifyIfNeeded(args[1]);
        }));

        // 4. sendStickers
        patches.push(instead("sendStickers", MessageModule, function(args, origFunc) {
            if (hasNitro()) return origFunc.apply(this, args);

            var channelId  = args[0];
            var stickerIds = args[1];
            var extra      = args[3];
            var ids        = Array.isArray(stickerIds) ? stickerIds : [stickerIds];

            for (var i = 0; i < ids.length; i++) {
                var sticker = StickersStore && StickersStore.getStickerById
                    ? StickersStore.getStickerById(ids[i]) : null;

                if (!sticker) { origFunc.apply(this, args); continue; }

                if (sticker.format_type === 3 || sticker.pack_id !== undefined) {
                    origFunc.apply(this, args);
                    continue;
                }

                var channelGuildId = ChannelStore && ChannelStore.getChannel
                    ? (ChannelStore.getChannel(channelId) || {}).guild_id : null;

                if (channelGuildId && channelGuildId === sticker.guild_id) {
                    origFunc.apply(this, args);
                    continue;
                }

                var stickerName = sticker.name || "Sticker";
                var stickerURL  = buildStickerURL(sticker);
                var content = settings.stickerHyperLink
                    ? "[" + stickerName + "](" + stickerURL + ")"
                    : stickerURL;

                MessageModule.sendMessage(channelId, { content: content }, null, extra);
            }
        }));

        // 5. uploadLocalFiles
        if (uploadModule && uploadModule.uploadLocalFiles !== undefined) {
            patches.push(before("uploadLocalFiles", uploadModule, function(args) {
                if (!hasNitro() && args[0] && args[0].parsedMessage) {
                    modifyIfNeeded(args[0].parsedMessage);
                }
            }));
        }
    }

    // 6. EXPERIMENTAL: intercepta cliques em links de CDN
    patchMessageRenderer();

    // 7. Remove botão "Get Nitro" da action sheet
    patchRemoveNitroButton();
}

function onUnload() {
    for (var i = 0; i < patches.length; i++) {
        if (typeof patches[i] === "function") patches[i]();
    }
    patches.length = 0;
}

module.exports = { onLoad: onLoad, onUnload: onUnload };
