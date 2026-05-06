// FakeNitro — Shiggycord
// Formato: module.exports puro, sem import/export, sem compilador.

var _patches = [];

function unpatchAll() {
    for (var i = 0; i < _patches.length; i++) {
        try { if (_patches[i]) _patches[i](); } catch (e) {}
    }
    _patches = [];
}

// ── Acesso aos globais ────────────────────────────────────────────────────────
// O Shiggycord/Vendetta injeta `window.vendetta` antes de carregar plugins.
function getVendetta() {
    return window.vendetta;
}

function findByProps() {
    var args = Array.prototype.slice.call(arguments);
    return getVendetta().metro.findByProps.apply(null, args);
}

function findByStoreName(name) {
    return getVendetta().metro.findByStoreName(name);
}

function patcher() {
    return getVendetta().patcher;
}

function getStorage() {
    return getVendetta().plugin.storage;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
var EMOTE_REGEX  = /<a?:(\w+):(\d+)>/i;
var EMOTE_GLOBAL = /<a?:(\w+):(\d+)>/gi;

function hasRealNitro() {
    var storage = getStorage();
    if (storage.ignoreNitro) return false;
    try {
        var user = findByStoreName("UserStore").getCurrentUser();
        return !!(user && user.premiumType !== null && user.premiumType !== undefined);
    } catch (e) { return false; }
}

function buildEmojiURL(emoji, size) {
    var ext    = emoji.animated ? "gif" : "webp";
    var params = "size=" + size + "&name=" + encodeURIComponent(emoji.name || "");
    // guild_id faz o cliente abrir o popout nativo ao clicar — igual ao Nitro real
    if (emoji.guildId) params += "&guild_id=" + emoji.guildId;
    return "https://cdn.discordapp.com/emojis/" + emoji.id + "." + ext + "?" + params;
}

function buildStickerURL(sticker, size) {
    var fmt    = sticker.format_type === 4 ? "gif" : "png";
    var params = "size=" + size + "&name=" + encodeURIComponent(sticker.name || "");
    if (sticker.guild_id) params += "&guild_id=" + sticker.guild_id;
    return "https://media.discordapp.net/stickers/" + sticker.id + "." + fmt + "?" + params;
}

function hyperlink(url, label) {
    // [label](url) — o Discord não gera preview de imagem com texto âncora
    return "[" + label + "](" + url + ")";
}

function processEmojis(msg) {
    if (!msg || !msg.content) return;
    if (!msg.content.match(EMOTE_REGEX)) return;
    try {
        var storage     = getStorage();
        var EmojiStore  = findByStoreName("EmojiStore");
        var GuildStore  = findByStoreName("SelectedGuildStore");
        var curGuild    = GuildStore.getGuildId ? GuildStore.getGuildId() : null;
        var size        = storage.emojiSize || 48;
        var matches     = Array.from(msg.content.matchAll(EMOTE_GLOBAL));

        for (var i = 0; i < matches.length; i++) {
            var m     = matches[i];
            var full  = m[0], emojiName = m[1], emojiId = m[2];
            var emoji = EmojiStore.getCustomEmojiById(emojiId);
            if (!emoji) continue;
            // Ignora se é do servidor atual e não é animado
            if (emoji.guildId === curGuild && !emoji.animated) continue;

            var url         = buildEmojiURL(emoji, size);
            var label       = emoji.name || emojiName;
            var replacement = (storage.hyperLink !== false)
                ? hyperlink(url, label)
                : url;
            msg.content = msg.content.replace(full, replacement);
        }

        msg.content       = msg.content.trim();
        msg.invalidEmojis = [];
    } catch (e) {
        console.error("[FakeNitro] processEmojis:", e);
    }
}

// ── Aplicar patches ───────────────────────────────────────────────────────────
function applyPatches() {
    var p = patcher();

    // 1. Libera checagens de Nitro (emojis e stickers)
    try {
        var nitro = findByProps("canUseEmojisEverywhere");
        if (nitro) {
            _patches.push(p.instead("canUseEmojisEverywhere", nitro, function (args, orig) {
                return hasRealNitro() ? orig.apply(null, args) : true;
            }));
            _patches.push(p.instead("canUseAnimatedEmojis", nitro, function (args, orig) {
                return hasRealNitro() ? orig.apply(null, args) : true;
            }));
            var sc = nitro.canUseCustomStickersEverywhere
                ? "canUseCustomStickersEverywhere"
                : "canUseStickersEverywhere";
            _patches.push(p.instead(sc, nitro, function (args, orig) {
                return hasRealNitro() ? orig.apply(null, args) : true;
            }));
            console.log("[FakeNitro] nitro checks OK");
        }
    } catch (e) { console.error("[FakeNitro] nitro checks:", e); }

    // 2. Intercepta sendMessage — substitui emotes externos por links clicáveis
    try {
        var msgModule = findByProps("sendMessage", "receiveMessage");
        if (msgModule) {
            _patches.push(p.before("sendMessage", msgModule, function (args) {
                if (!hasRealNitro()) processEmojis(args[1]);
            }));

            // 3. Intercepta sendStickers — envia figurinha como link com guild_id
            _patches.push(p.instead("sendStickers", msgModule, function (args, orig) {
                if (hasRealNitro()) return orig.apply(null, args);
                try {
                    var storage    = getStorage();
                    var chId       = args[0];
                    var stickerIds = args[1];
                    var extra      = args[3];

                    var Stickers = findByStoreName("StickersStore");
                    var Channels = findByStoreName("ChannelStore");
                    var s        = Stickers.getStickerById(stickerIds);

                    if (!s) return orig.apply(null, args);
                    // Lottie (3) ou pack padrão — deixa o Discord tratar
                    if (s.format_type === 3 || s.pack_id !== undefined)
                        return orig.apply(null, args);
                    // Mesmo servidor — deixa passar normal
                    var ch = Channels.getChannel(chId);
                    if (ch && ch.guild_id === s.guild_id)
                        return orig.apply(null, args);

                    var url  = buildStickerURL(s, storage.emojiSize || 48);
                    var text = (storage.hyperLink !== false)
                        ? hyperlink(url, s.name || "sticker")
                        : url;
                    msgModule.sendMessage(chId, { content: text }, null, extra);
                } catch (e) {
                    console.error("[FakeNitro] sendStickers:", e);
                    return orig.apply(null, args);
                }
            }));

            console.log("[FakeNitro] message patches OK");
        }
    } catch (e) { console.error("[FakeNitro] message patches:", e); }

    // 4. uploadLocalFiles (mensagens com mídia)
    try {
        var upModule = findByProps("uploadLocalFiles");
        if (upModule && upModule.uploadLocalFiles) {
            _patches.push(p.before("uploadLocalFiles", upModule, function (args) {
                if (!hasRealNitro()) {
                    var parsed = args[0] && args[0].parsedMessage;
                    if (parsed) processEmojis(parsed);
                }
            }));
            console.log("[FakeNitro] upload patch OK");
        }
    } catch (e) { console.error("[FakeNitro] upload patch:", e); }

    console.log("[FakeNitro] Patches ativos:", _patches.length);
}

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = {
    onLoad: function () {
        console.log("[FakeNitro] Inicializando...");
        var storage = getStorage();
        if (storage.emojiSize    === undefined) storage.emojiSize    = 48;
        if (storage.hyperLink    === undefined) storage.hyperLink    = true;
        if (storage.ignoreNitro  === undefined) storage.ignoreNitro  = false;
        if (storage.stickerHyperLink === undefined) storage.stickerHyperLink = true;
        applyPatches();
        console.log("[FakeNitro] Pronto.");
    },

    onUnload: function () {
        console.log("[FakeNitro] Descarregando...");
        unpatchAll();
    },
};
