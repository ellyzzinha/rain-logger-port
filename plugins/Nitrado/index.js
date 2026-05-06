var findByProps = window.vendetta.metro.findByProps;
var findByStoreName = window.vendetta.metro.findByStoreName;
var instead = window.vendetta.patcher.instead;
var before = window.vendetta.patcher.before;

var patches = [];

// ── Configurações padrão ──────────────────────────────────────────────────────
var settings = {
    emojiSize: 48,
    hyperLink: true,
    stickerHyperLink: true,
};

// ── Utils: lógica idêntica ao rain/utils.ts ───────────────────────────────────
var HAS_EMOTES_RE = /<a?:(\w+):(\d+)>/i;

function extractUnusableEmojis(messageString, size) {
    var EmojiStore = findByStoreName("EmojiStore");
    var SelectedGuildStore = findByStoreName("SelectedGuildStore");
    var getCustomEmojiById = EmojiStore && EmojiStore.getCustomEmojiById;
    var getGuildId = SelectedGuildStore && SelectedGuildStore.getGuildId;
    var currentGuildId = getGuildId ? getGuildId() : null;

    var emojiUrls = [];
    var re = /<a?:(\w+):(\d+)>/gi;
    var m;

    // coleta todas as ocorrências primeiro para não travar o exec após replace
    var found = [];
    while ((m = re.exec(messageString)) !== null) {
        found.push({ full: m[0], name: m[1], id: m[2] });
    }

    for (var i = 0; i < found.length; i++) {
        var f = found[i];
        var emoji = getCustomEmojiById ? getCustomEmojiById(f.id) : null;
        if (!emoji) continue;

        if (emoji.guildId !== currentGuildId || emoji.animated) {
            // remove o emoji do texto original
            messageString = messageString.replace(f.full, "");

            var baseUrl = emoji.url
                ? emoji.url.split("?")[0]
                : "https://cdn.discordapp.com/emojis/" + emoji.id + ".webp";

            var animated = emoji.animated ? "&animated=true" : "";
            var fullUrl = baseUrl + "?size=" + size + "&name=" + (emoji.name || f.name) + animated;

            if (settings.hyperLink) {
                emojiUrls.push("[" + (emoji.name || f.name) + "](" + fullUrl + ")");
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
        case 1:
            return "https://media.discordapp.net/stickers/" + sticker.id + ".png";
        case 2:
            return "https://media.discordapp.net/stickers/" + sticker.id + ".png"; // apng
        default:
            return "https://media.discordapp.net/stickers/" + sticker.id + ".gif";
    }
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
        ? (StickerUtils.StickerSendability.SENDABLE !== undefined
            ? StickerUtils.StickerSendability.SENDABLE
            : 0)
        : 0;

    function hasNitro() {
        var user = UserStore && UserStore.getCurrentUser ? UserStore.getCurrentUser() : null;
        return user && user.premiumType !== null;
    }

    // 1. Nitro checks — emojis
    if (nitroInfo) {
        patches.push(instead("canUseEmojisEverywhere", nitroInfo, function(args, orig) {
            if (hasNitro()) return orig.apply(this, args);
            return true;
        }));
        patches.push(instead("canUseAnimatedEmojis", nitroInfo, function(args, orig) {
            if (hasNitro()) return orig.apply(this, args);
            return true;
        }));

        // Nitro check — stickers (nome varia por versão)
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

    // 2. Sticker sendability — deixa clicável na lista
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

    // 3. sendMessage — emojis (lógica rain/sendMessage.ts)
    if (MessageModule) {
        patches.push(before("sendMessage", MessageModule, function(args) {
            if (!hasNitro()) modifyIfNeeded(args[1]);
        }));

        // 4. sendStickers — lógica rain/sendMessage.ts + buildStickerURL do rain
        patches.push(instead("sendStickers", MessageModule, function(args, origFunc) {
            if (hasNitro()) return origFunc.apply(this, args);

            var channelId  = args[0];
            var stickerIds = args[1]; // pode ser array ou id único dependendo da versão
            var extra      = args[3];

            // normaliza para array
            var ids = Array.isArray(stickerIds) ? stickerIds : [stickerIds];

            for (var i = 0; i < ids.length; i++) {
                var sticker = StickersStore && StickersStore.getStickerById
                    ? StickersStore.getStickerById(ids[i])
                    : null;

                if (!sticker) { origFunc.apply(this, args); continue; }

                // sticker lottie (format_type 3) ou de pack padrão → manda normal
                if (sticker.format_type === 3 || sticker.pack_id !== undefined) {
                    origFunc.apply(this, args);
                    continue;
                }

                // sticker do mesmo servidor → manda normal
                var channelGuildId = ChannelStore && ChannelStore.getChannel
                    ? ChannelStore.getChannel(channelId) && ChannelStore.getChannel(channelId).guild_id
                    : null;

                if (channelGuildId && channelGuildId === sticker.guild_id) {
                    origFunc.apply(this, args);
                    continue;
                }

                // sticker bloqueado → converte em link e manda como mensagem
                var stickerName = sticker.name || "Sticker";
                var stickerURL  = buildStickerURL(sticker);
                var content = settings.stickerHyperLink
                    ? "[" + stickerName + "](" + stickerURL + ")"
                    : stickerURL;

                MessageModule.sendMessage(channelId, { content: content }, null, extra);
            }
        }));

        // 5. uploadLocalFiles (builds antigos)
        if (uploadModule && uploadModule.uploadLocalFiles !== undefined) {
            patches.push(before("uploadLocalFiles", uploadModule, function(args) {
                if (!hasNitro() && args[0] && args[0].parsedMessage) {
                    modifyIfNeeded(args[0].parsedMessage);
                }
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
