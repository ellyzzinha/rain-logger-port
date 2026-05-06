// FakeNitro — Shiggycord (leve)
var _patches = [];

function getV() { return window.vendetta || {}; }
function metro() { return getV().metro || {}; }
function fp() { return metro().findByProps; }
function fsn() { return metro().findByStoreName; }

function unloadAll() {
    for (var i = 0; i < _patches.length; i++) {
        if (_patches[i]) _patches[i]();
    }
    _patches = [];
}

function isNitro() {
    if (getV().plugin && getV().plugin.storage && getV().plugin.storage.ignoreNitro) return false;
    var store = fsn()("UserStore");
    if (!store) return false;
    var user = store.getCurrentUser();
    return user && user.premiumType != null;
}

function emojiURL(emoji, size) {
    var ext = emoji.animated ? "gif" : "webp";
    var url = "https://cdn.discordapp.com/emojis/" + emoji.id + "." + ext
        + "?size=" + size
        + "&name=" + encodeURIComponent(emoji.name || "");
    if (emoji.guildId) url += "&guild_id=" + emoji.guildId;
    return url;
}

function processMsg(msg) {
    if (!msg || !msg.content) return;
    var storage = getV().plugin && getV().plugin.storage;
    var size = (storage && storage.emojiSize) || 48;
    var EmojiStore = fsn()("EmojiStore");
    var GuildStore = fsn()("SelectedGuildStore");
    if (!EmojiStore || !GuildStore) return;
    var curGuild = GuildStore.getGuildId ? GuildStore.getGuildId() : null;
    var re = /<a?:(\w+):(\d+)>/gi;
    var m;
    while ((m = re.exec(msg.content)) !== null) {
        var full = m[0], name = m[1], id = m[2];
        var emoji = EmojiStore.getCustomEmojiById(id);
        if (!emoji) continue;
        if (emoji.guildId === curGuild && !emoji.animated) continue;
        var url = emojiURL(emoji, size);
        var rep = "[" + (emoji.name || name) + "](" + url + ")";
        msg.content = msg.content.replace(full, rep);
        re.lastIndex = 0; // reset após replace para não pular posições
    }
    msg.content = msg.content.trim();
    msg.invalidEmojis = [];
}

function applyPatches() {
    console.log("[FakeNitro] aplicando patches");
    var pat = getV().patcher;
    if (!pat || !fp() || !fsn()) {
        console.log("[FakeNitro] vendetta não pronto, abortando");
        return;
    }

    var nitro = fp()("canUseEmojisEverywhere");
    if (nitro) {
        _patches.push(pat.instead("canUseEmojisEverywhere", nitro, function (a, o) {
            return isNitro() ? o.apply(null, a) : true;
        }));
        _patches.push(pat.instead("canUseAnimatedEmojis", nitro, function (a, o) {
            return isNitro() ? o.apply(null, a) : true;
        }));
        var sc = nitro.canUseCustomStickersEverywhere
            ? "canUseCustomStickersEverywhere" : "canUseStickersEverywhere";
        _patches.push(pat.instead(sc, nitro, function (a, o) {
            return isNitro() ? o.apply(null, a) : true;
        }));
        console.log("[FakeNitro] nitro checks OK");
    }

    var msgMod = fp()("sendMessage", "receiveMessage");
    if (msgMod) {
        _patches.push(pat.before("sendMessage", msgMod, function (args) {
            if (!isNitro()) processMsg(args[1]);
        }));
        console.log("[FakeNitro] sendMessage OK");
    }

    console.log("[FakeNitro] patches:", _patches.length);
}

module.exports = {
    onLoad: function () {
        console.log("[FakeNitro] onLoad");
        if (!window.vendetta) { console.log("[FakeNitro] sem vendetta, abortando"); return; }
        var storage = window.vendetta.plugin.storage;
        if (storage.emojiSize   == null) storage.emojiSize   = 48;
        if (storage.ignoreNitro == null) storage.ignoreNitro = false;
        applyPatches();
    },
    onUnload: function () {
        console.log("[FakeNitro] onUnload");
        unloadAll();
    },
};
