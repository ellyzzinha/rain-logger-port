var findByProps = window.vendetta.metro.findByProps;
var findByStoreName = window.vendetta.metro.findByStoreName;
var instead = window.vendetta.patcher.instead;
var before = window.vendetta.patcher.before;

var patches = [];

// ── Emoji regex ──────────────────────────────────────────────────────────────
var EMOJI_RE = /<a?:(\w+):(\d+)>/gi;

function processEmojis(msg, size, hyperlink) {
    if (!msg || !msg.content) return;
    var regex = /<a?:(\w+):(\d+)>/gi;
    var match;
    var EmojiStore = findByStoreName("EmojiStore");
    var SelectedGuildStore = findByStoreName("SelectedGuildStore");
    var currentGuildId = SelectedGuildStore && SelectedGuildStore.getGuildId ? SelectedGuildStore.getGuildId() : null;
    var hasEmote = false;
    while ((match = regex.exec(msg.content)) !== null) {
        hasEmote = true;
        break;
    }
    if (!hasEmote) return;

    var newContent = msg.content;
    var emojiRe = /<a?:(\w+):(\d+)>/gi;
    var m;
    while ((m = emojiRe.exec(newContent)) !== null) {
        var emojiName = m[1];
        var emojiId   = m[2];
        var full      = m[0];
        var emoji     = EmojiStore && EmojiStore.getCustomEmojiById ? EmojiStore.getCustomEmojiById(emojiId) : null;
        if (!emoji) continue;
        if (emoji.guildId === currentGuildId && !emoji.animated) continue;
        var animated = emoji.animated ? "&animated=true" : "";
        var url = "https://cdn.discordapp.com/emojis/" + emojiId + ".webp?size=" + (size || 48) + "&name=" + emojiName + animated;
        var replacement = hyperlink !== false ? "[" + emojiName + "](" + url + ")" : url;
        newContent = newContent.replace(full, replacement);
        emojiRe.lastIndex = 0; // reset after replace
    }

    msg.content = newContent.trim();
    msg.invalidEmojis = [];
}

// ── Sticker helpers ───────────────────────────────────────────────────────────
function buildStickerURL(sticker, size) {
    var format;
    if (sticker.format_type === 1) format = "png";
    else if (sticker.format_type === 2) format = "png";
    else format = "gif";
    return "https://media.discordapp.net/stickers/" + sticker.id + "." + format + "?size=" + (size || 160);
}

function isStickerFree(sticker, channelId) {
    if (!sticker) return true;
    if (sticker.available === false) return false;
    if (!sticker.guild_id) return true;
    var ChannelStore = findByStoreName("ChannelStore");
    var channel = ChannelStore && ChannelStore.getChannel ? ChannelStore.getChannel(channelId) : null;
    if (!channel) return false;
    return sticker.guild_id === channel.guild_id;
}

// ── onLoad / onUnload ─────────────────────────────────────────────────────────
function onLoad() {
    var nitroInfo     = findByProps("canUseEmojisEverywhere");
    var StickerUtils  = findByProps("getStickerSendability");
    var MessageModule = findByProps("sendMessage", "receiveMessage");
    var uploadModule  = findByProps("uploadLocalFiles");
    var UserStore     = findByStoreName("UserStore");
    var StickersStore = findByStoreName("StickersStore");

    var SENDABLE = (StickerUtils && StickerUtils.StickerSendability)
        ? (StickerUtils.StickerSendability.SENDABLE !== undefined ? StickerUtils.StickerSendability.SENDABLE : 0)
        : 0;

    // 1. Nitro emoji checks
    if (nitroInfo) {
        patches.push(instead("canUseEmojisEverywhere", nitroInfo, function(args, orig) {
            var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
            if (user && user.premiumType !== null) return orig.apply(this, args);
            return true;
        }));
        patches.push(instead("canUseAnimatedEmojis", nitroInfo, function(args, orig) {
            var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
            if (user && user.premiumType !== null) return orig.apply(this, args);
            return true;
        }));

        // Sticker nitro check (name varies by version)
        var stickerCheckName = nitroInfo.canUseCustomStickersEverywhere
            ? "canUseCustomStickersEverywhere"
            : "canUseStickersEverywhere";
        if (nitroInfo[stickerCheckName]) {
            patches.push(instead(stickerCheckName, nitroInfo, function(args, orig) {
                var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
                if (user && user.premiumType !== null) return orig.apply(this, args);
                return true;
            }));
        }
    }

    // 2. Sticker sendability patches
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

    // 3. sendMessage — handle emojis + stickers
    if (MessageModule) {
        patches.push(before("sendMessage", MessageModule, function(args) {
            var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
            if (user && user.premiumType !== null) return;
            processEmojis(args[1], 48, true);
        }));

        patches.push(instead("sendStickers", MessageModule, function(args, orig) {
            var channelId  = args[0];
            var stickerIds = args[1];
            var extra      = args[3];
            var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
            if (user && user.premiumType !== null) return orig.apply(this, args);

            var toFree = [];
            for (var i = 0; i < stickerIds.length; i++) {
                var sticker = StickersStore && StickersStore.getStickerById
                    ? StickersStore.getStickerById(stickerIds[i])
                    : null;
                if (!sticker) continue;
                if (sticker.format_type === 3 || sticker.pack_id !== undefined) {
                    // lottie / default pack → send normally
                    orig.apply(this, args);
                    return;
                }
                if (!isStickerFree(sticker, channelId)) {
                    toFree.push(sticker);
                }
            }

            if (!toFree.length) return orig.apply(this, args);

            for (var j = 0; j < toFree.length; j++) {
                var s = toFree[j];
                var url = buildStickerURL(s, 160);
                var content = s.name ? "[" + s.name + "](" + url + ")" : url;
                MessageModule.sendMessage(channelId, { content: content }, null, extra);
            }
        }));

        // uploadLocalFiles (older Discord builds)
        if (uploadModule && uploadModule.uploadLocalFiles) {
            patches.push(before("uploadLocalFiles", uploadModule, function(args) {
                var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
                if (user && user.premiumType !== null) return;
                if (args[0] && args[0].parsedMessage) processEmojis(args[0].parsedMessage, 48, true);
            }));
        }
    }
}

function onUnload() {
    for (var i = 0; i < patches.length; i++) {
        if (typeof patches[i] === "function") patches[i]();
    }
    patches.length = 0;
}

module.exports = { onLoad: onLoad, onUnload: onUnload };
