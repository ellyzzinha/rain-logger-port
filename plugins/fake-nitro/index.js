var _p = [];
function getV() { return window.vendetta; }

module.exports = {
    onLoad: function () {
        console.log("[FakeNitro] inicializando");
        if (!getV()) return;

        var p = getV().patcher;
        var metro = getV().metro;
        var nitro = metro.findByProps("canUseEmojisEverywhere");
        var msgMod = metro.findByProps("sendMessage");

        if (nitro) {
            _p.push(p.instead("canUseEmojisEverywhere", nitro, () => true));
            _p.push(p.instead("canUseAnimatedEmojis", nitro, () => true));
            _p.push(p.instead("canUseStickersEverywhere", nitro, () => true));
        }

        if (msgMod) {
            _p.push(p.before("sendMessage", msgMod, (args) => {
                let msg = args[1];
                if (msg && msg.content) {
                    msg.content = msg.content.replace(/<a?:(\w+):(\d+)>/gi, (full, name, id) => {
                        return "https://cdn.discordapp.com/emojis/" + id + ".gif?size=48";
                    });
                }
            }));
        }
        console.log("[FakeNitro] botão deve ligar agora");
    },
    onUnload: function () {
        _p.forEach(un => un());
        _p = [];
    }
};
