import { findByProps } from "@metro";

// Patch acumulado
var _unpatch = null;

export default {
    onLoad: function () {
        console.log("[HelloNitro] onLoad chamado — plugin funcionando!");

        // Patch bobo: loga toda vez que alguém chama getGuildName
        try {
            var GuildStore = findByProps("getGuild", "getGuildCount");
            if (GuildStore && GuildStore.getGuildCount) {
                var orig = GuildStore.getGuildCount.bind(GuildStore);
                GuildStore.getGuildCount = function () {
                    var result = orig();
                    console.log("[HelloNitro] getGuildCount chamado, retornou:", result);
                    return result;
                };
                _unpatch = function () {
                    GuildStore.getGuildCount = orig;
                };
                console.log("[HelloNitro] Patch aplicado com sucesso.");
            } else {
                console.log("[HelloNitro] GuildStore não encontrado — patch pulado.");
            }
        } catch (e) {
            console.error("[HelloNitro] Erro no patch:", e);
        }
    },

    onUnload: function () {
        console.log("[HelloNitro] onUnload chamado — plugin desligando.");
        if (_unpatch) {
            _unpatch();
            _unpatch = null;
        }
    },
};
