var findByProps = window.vendetta.metro.findByProps;
var findByStoreName = window.vendetta.metro.findByStoreName;
var after = window.vendetta.patcher.after;
var before = window.vendetta.patcher.before;
var instead = window.vendetta.patcher.instead;

var patches = [];

// ── Regex ─────────────────────────────────────────────────────────────────────
var HAS_EMOTES_RE = /<a?:(\w+):(\d+)>/i;

// ── buildStickerURL (rain/utils.ts exato) ────────────────────────────────────
function buildStickerURL(sticker) {
    switch (sticker.format_type) {
        case 1:
            return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        case 2:
            return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        default:
            return "https://media.discordapp.net/stickers/" + sticker.id + ".gif";
    }
}

// ── extractUnusableEmojis (rain/utils.ts exato) ──────────────────────────────
function extractUnusableEmojis(messageString, size, hyperLink) {
    var EmojiStore = findByStoreName("EmojiStore");
    var SelectedGuildStore = findByStoreName("SelectedGuildStore");
    var getCustomEmojiById = EmojiStore && EmojiStore.getCustomEmojiById;
    var getGuildId = SelectedGuildStore && SelectedGuildStore.getGuildId;
    var currentGuildId = getGuildId ? getGuildId() : null;

    var emojiUrls = [];

    // coleta todas as ocorrências antes de modificar a string
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
            // remove o emoji do texto original (rain faz isso)
            messageString = messageString.replace(f.full, "");

            var url = emoji.url
                ? emoji.url
                : "https://cdn.discordapp.com/emojis/" + emoji.id + ".webp?size=44&animated=" + (emoji.animated ? "true" : "false");

            var animated = emoji.animated ? "&animated=" + emoji.animated : "";
            var base = url.split("?")[0];
            var emojiName = emoji.name || f.name;
            var fullUrl = base + "?size=" + size + "&name=" + emojiName + animated;

            if (hyperLink) {
                emojiUrls.push("[" + emojiName + "](" + fullUrl + ")");
            } else {
                emojiUrls.push(fullUrl);
            }
        }
    }

    return {
        newContent: messageString.trim(),
        extractedEmojis: emojiUrls,
    };
}

// ── modifyIfNeeded (rain/utils.ts exato) ─────────────────────────────────────
function modifyIfNeeded(msg, emojiSize, hyperLink) {
    if (!msg || !msg.content) return;
    if (!HAS_EMOTES_RE.test(msg.content)) return;

    var result = extractUnusableEmojis(msg.content, emojiSize, hyperLink);

    msg.content = result.newContent;

    // rain usa "\ni" entre os emojis (olha o utils.ts: join("\ni"))
    if (result.extractedEmojis.length > 0)
        msg.content += "\n" + result.extractedEmojis.join("\ni");

    msg.invalidEmojis = [];
}

// ── removeGetNitroButton (rain/patches/removeGetNitroButton.ts exato) ─────────
// findInReactTree portado (usado pelo rain via @lib/utils/findInReactTree)
function findInReactTree(tree, predicate) {
    if (!tree) return null;
    if (predicate(tree)) return tree;

    var children = tree.props && tree.props.children;
    if (!children) return null;

    if (Array.isArray(children)) {
        for (var i = 0; i < children.length; i++) {
            var result = findInReactTree(children[i], predicate);
            if (result) return result;
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

        var view = res
            && res.props
            && res.props.children
            && res.props.children.props
            && res.props.children.props.children;
        if (!view) return;

        var unpatchView = after("type", view, function(_, component) {
            var isButton = function(c) {
                return c && c.type && c.type.name === "Button";
            };
            var isGetNitro = function(c) {
                if (!c || !c.props) return false;
                var text = c.props.text;
                var ch   = c.props.children;
                return (typeof text === "string" && text.toLowerCase().indexOf("nitro") !== -1)
                    || (typeof ch   === "string" && ch.toLowerCase().indexOf("nitro") !== -1);
            };

            var buttonsContainer = findInReactTree(component, function(c) {
                return Array.isArray(c) && c.some(isButton);
            });

            if (buttonsContainer) {
                for (var i = buttonsContainer.length - 1; i >= 0; i--) {
                    if (isGetNitro(buttonsContainer[i])) buttonsContainer.splice(i, 1);
                }
            } else if (component && component.props && Array.isArray(component.props.children)) {
                var ch = component.props.children;
                for (var j = ch.length - 1; j >= 0; j--) {
                    if (isGetNitro(ch[j])) ch.splice(j, 1);
                }
            }
        });

        if (once) unpatch();
    });
    return unpatch;
}

function applyRemoveNitroButtonPatch() {
    var LazyActionSheet = findByProps("openLazy", "hideActionSheet");
    if (!LazyActionSheet) return;

    var innerPatches = [];

    var unpatchLazy = before("openLazy", LazyActionSheet, function(args) {
        var lazySheet = args[0];
        var name      = args[1];

        if (name !== "MessageEmojiActionSheet" && name !== "MessageCustomEmojiActionSheet") return;

        unpatchLazy();

        lazySheet.then(function(module) {
            innerPatches.push(
                after("default", module, function(_, res) {
                    innerPatches.push(patchSheet("type", res, true));
                })
            );
        });
    });

    patches.push(function() {
        unpatchLazy();
        for (var i = 0; i < innerPatches.length; i++) {
            if (typeof innerPatches[i] === "function") innerPatches[i]();
        }
    });
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

    // configurações inline (sem storage por ora, mantém simples)
    var emojiSize      = 48;
    var hyperLink      = true;
    var stickerHyperLink = true;

    var SENDABLE = 0;
    if (StickerUtils && StickerUtils.StickerSendability) {
        SENDABLE = StickerUtils.StickerSendability.SENDABLE !== undefined
            ? StickerUtils.StickerSendability.SENDABLE
            : 0;
    }

    function hasNitro() {
        var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
        return user && user.premiumType !== null;
    }

    // ── nitroChecks (rain/patches/nitroChecks.ts) ─────────────────────────────
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

    // ── sticker UI (FreeStickers/patches/boosts.ts) ───────────────────────────
    if (StickerUtils) {
        if (StickerUtils.getStickerSendability) {
            patches.push(instead("getStickerSendability", StickerUtils, function() {
                return SENDABLE;
            }));
        }
        if (StickerUtils.isSendableSticker) {
            patches.push(instead("isSendableSticker", StickerUtils, function() {
                return true;
            }));
        }
    }

    // ── sendMessage (rain/patches/sendMessage.ts exato) ───────────────────────
    if (MessageModule) {
        patches.push(before("sendMessage", MessageModule, function(args) {
            if (!hasNitro()) modifyIfNeeded(args[1], emojiSize, hyperLink);
        }));

        patches.push(instead("sendStickers", MessageModule, function(args, origFunc) {
            if (hasNitro()) return origFunc.apply(this, args);

            var channelId = args[0];
            var extra     = args[3];

            // rain passa args[1] como ID único (não array)
            var sticker = StickersStore && StickersStore.getStickerById
                ? StickersStore.getStickerById(args[1])
                : null;

            if (!sticker) return origFunc.apply(this, args);

            // sticker lottie ou de pack padrão → manda normal
            if (sticker.format_type === 3 || sticker.pack_id !== undefined)
                return origFunc.apply(this, args);

            // sticker do mesmo servidor → manda normal
            var channelGuildId = ChannelStore && ChannelStore.getChannel
                ? (ChannelStore.getChannel(channelId) || {}).guild_id
                : null;
            if (channelGuildId && channelGuildId === sticker.guild_id)
                return origFunc.apply(this, args);

            // sticker bloqueado → converte em link
            var stickerName = sticker.name || "FakeNitroSticker";
            var stickerURL  = buildStickerURL(sticker);
            if (stickerName)
                stickerURL = stickerHyperLink
                    ? "[" + stickerName + "](" + stickerURL + ")"
                    : stickerURL;

            MessageModule.sendMessage(channelId, { content: stickerURL }, null, extra);
        }));

        // uploadLocalFiles (builds antigos)
        if (uploadModule && uploadModule.uploadLocalFiles !== undefined) {
            patches.push(before("uploadLocalFiles", uploadModule, function(args) {
                if (!hasNitro() && args[0] && args[0].parsedMessage)
                    modifyIfNeeded(args[0].parsedMessage, emojiSize, hyperLink);
            }));
        }
    }

    // ── removeGetNitroButton (rain/patches/removeGetNitroButton.ts exato) ─────
    applyRemoveNitroButtonPatch();
}

// ── onUnload ──────────────────────────────────────────────────────────────────
function onUnload() {
    for (var i = 0; i < patches.length; i++) {
        if (typeof patches[i] === "function") patches[i]();
    }
    patches.length = 0;
}

module.exports = { onLoad: onLoad, onUnload: onUnload };
