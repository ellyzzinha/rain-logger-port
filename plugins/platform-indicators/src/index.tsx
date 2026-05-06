import { patcher } from "@vendetta";
import { findByName, findByProps, findByStoreName, findByTypeName, findByTypeNameAll } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { React, ReactNative } from "@vendetta/metro/common";

import StatusIcons from "./StatusIcons";
import PresenceUpdatedContainer from "./PresenceUpdatedContainer";
import Settings from "./settings";

const { View, Text } = ReactNative;

let unpatches: Array<() => void> = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extrai userId de um channel de DM (1-para-1) com segurança */
function getDMUserId(channel: any): string | null {
    if (!channel) return null;
    if (Array.isArray(channel.recipients) && channel.recipients.length === 1) {
        const r = channel.recipients[0];
        return typeof r === "string" ? r : r?.id ?? null;
    }
    return channel.recipientId ?? null;
}

/** Injeta StatusIcons numa lista de children, evitando duplicatas pela key */
function injectIfAbsent(
    children: any[],
    key: string,
    userId: string,
    wrapperStyle: object = { flexDirection: "row" }
) {
    if (!Array.isArray(children)) return;
    if (children.some(c => c?.key === key)) return;
    children.push(
        React.createElement(
            View,
            { key, style: wrapperStyle },
            React.createElement(StatusIcons, { userId })
        )
    );
}

/**
 * Tenta resolver um componente DM por múltiplas estratégias em ordem:
 *   1. findByTypeName (nome exato no bundle)
 *   2. findByName com exact=false
 *   3. findByProps com props características do componente de DM
 *
 * Retorna o primeiro hit ou null.
 */
function findDMComponent(...typeNames: string[]): any | null {
    for (const name of typeNames) {
        const byType = findByTypeName(name);
        if (byType) return byType;

        const byName = findByName(name, false);
        if (byName) return byName;
    }

    // Fallback por shape de props: componentes de DM costumam receber
    // uma prop `channel` com `type === 1` (DM) e `recipients`.
    // Essa busca é mais lenta, então fica por último.
    const byProps = findByProps("channel", "selected", "isMentioned");
    if (byProps) return byProps;

    return null;
}

// ─── onLoad ─────────────────────────────────────────────────────────────────

export default {
    onLoad: () => {
        storage.dmTopBar            ??= true;
        storage.userList            ??= true;
        storage.profileUsername     ??= true;
        storage.removeDefaultMobile ??= true;
        storage.fallbackColors      ??= false;

        const debugLabels = false;

        // ── 1. DM top bar ────────────────────────────────────────────
        unpatches.push(patcher.after("default", findByName("ChannelHeader", false), (args, res) => {
            if (!storage.dmTopBar) return;
            if (res?.type?.type?.name !== "PrivateChannelHeader") return;

            patcher.after("type", res.type, (_args, res) => {
                if (!res?.props?.children?.props?.children) return;

                const userId = findInReactTree(res, m => m?.props?.user?.id)?.props?.user?.id;
                if (!userId) return;

                const dmTopBar = res.props?.children;

                if (!findInReactTree(res, m => m?.key === "DMTabsV2Header")) {
                    const child1 = dmTopBar?.props?.children?.props?.children?.[1];
                    if (child1) {
                        if (typeof child1?.type === "function") {
                            const unpatchInner = patcher.after("type", child1, (_a, r) => {
                                unpatchInner();
                                if (findInReactTree(r, c => c?.key === "DMTabsV2Header-v2")) return;
                                r?.props?.children?.[0]?.props?.children?.push(
                                    React.createElement(
                                        PresenceUpdatedContainer,
                                        { key: "DMTabsV2Header-v2" },
                                        React.createElement(StatusIcons, { userId })
                                    )
                                );
                            });
                        } else {
                            const arrowId = getAssetIDByName("arrow-right");
                            const container1 = findInReactTree(dmTopBar, m =>
                                m?.props?.children?.[1]?.props?.source === arrowId
                            );
                            container1?.props?.children?.push(
                                React.createElement(
                                    View,
                                    { key: "DMTabsV2Header", style: { flexDirection: "row", justifyContent: "center", alignContent: "flex-start" } },
                                    React.createElement(View, { key: "DMTabsV2HeaderIcons", style: { flexDirection: "row" } })
                                )
                            );
                        }
                    }
                }

                const topIcons = findInReactTree(res, m => m?.key === "DMTabsV2HeaderIcons");
                if (topIcons) {
                    topIcons.props.children = React.createElement(StatusIcons, { userId });
                }
            });
        }));

        // ── 2. User profile ──────────────────────────────────────────
        const UserProfileContent = findByTypeName("UserProfileContent");
        if (UserProfileContent) {
            unpatches.push(patcher.after("type", UserProfileContent, (_args, res) => {
                const primaryInfo = findInReactTree(res, c => c?.type?.name === "PrimaryInfo");
                if (!primaryInfo) return;

                patcher.after("type", primaryInfo, (_a, r) => {
                    if (r?.type?.name !== "UserProfilePrimaryInfo") return;

                    patcher.after("type", r, (_b, r2) => {
                        const displayName = findInReactTree(r2, c => c?.type?.name === "DisplayName");
                        if (!displayName) return;

                        patcher.after("type", displayName, (dArgs, dRes) => {
                            const userId = dArgs?.[0]?.user?.id;
                            if (!userId) return;
                            dRes?.props?.children?.push(
                                React.createElement(
                                    PresenceUpdatedContainer,
                                    { key: "UserProfileIcons" },
                                    React.createElement(StatusIcons, { userId })
                                )
                            );
                        });
                    });
                });
            }));
        }

        // ── 3. DisplayName patch ─────────────────────────────────────
        const DisplayName = findByProps("DisplayName");
        if (DisplayName) {
            unpatches.push(patcher.after("DisplayName", DisplayName, (args, res) => {
                const user = args?.[0]?.user;
                if (!user?.id || !res || !storage.profileUsername) return;
                res.props?.children?.props?.children?.[0]?.props?.children?.push(
                    React.createElement(StatusIcons, { userId: user.id })
                );
            }));
        }

        // ── 4. Hide default mobile indicator ────────────────────────
        const Status = findByName("Status", false);
        if (Status) {
            unpatches.push(patcher.before("default", Status, (args) => {
                if (!args?.[0] || !storage.removeDefaultMobile) return;
                args[0].isMobileOnline = false;
            }));
        }

        // ── 5. Guild member row ──────────────────────────────────────
        const Rows = findByProps("GuildMemberRow");
        if (Rows?.GuildMemberRow) {
            unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                if (!storage.userList) return;
                if (findInReactTree(res, c => c?.key === "GuildMemberRowStatusIconsView")) return;

                const row = findInReactTree(res, c => c?.props?.style?.flexDirection === "row");
                if (!row) return;

                row.props.children.splice(2, 0,
                    React.createElement(
                        View,
                        { key: "GuildMemberRowStatusIconsView", style: { flexDirection: "row" } },
                        debugLabels
                            ? React.createElement(Text, null, "GMRSIV")
                            : React.createElement(StatusIcons, { userId: user.id })
                    )
                );
            }));
        }

        // ── 6. User row (member list / friends list) ─────────────────
        let patchedAvatar = false;
        const rowPatch = ([{ user }], res) => {
            if (!storage.userList) return;
            if (findInReactTree(res?.props?.label, c => c?.key === "TabsV2MemberListStatusIconsView")) return;

            res.props.label = React.createElement(
                View,
                { style: { flexDirection: "row", alignItems: "center" }, key: "TabsV2MemberListStatusIconsView" },
                res.props.label,
                React.createElement(
                    View,
                    { key: "TabsV2MemberListStatusIconsViewInner", style: { flexDirection: "row" } },
                    debugLabels
                        ? React.createElement(Text, null, "TV2MLSIV")
                        : React.createElement(StatusIcons, { userId: user.id })
                )
            );

            if (!patchedAvatar && res.props?.icon?.type) {
                unpatches.push(patcher.before("type", res.props.icon.type, (args) => {
                    if (storage.removeDefaultMobile) args[0].isMobileOnline = false;
                }));
                patchedAvatar = true;
            }
        };

        findByTypeNameAll("UserRow").forEach(UserRow =>
            unpatches.push(patcher.after("type", UserRow, rowPatch))
        );

        // ── 7. Lista de DMs ──────────────────────────────────────────
        //
        // Estratégia em três camadas:
        //
        //   7a. Patch no componente de item (PrivateChannel / DMListItem /
        //       MessagesItemChannelContent) — injeção direta e eficiente.
        //
        //   7b. Se nenhum dos nomes conhecidos for encontrado, fazemos um
        //       scan genérico: interceptamos qualquer componente que receba
        //       uma prop `channel` com `type === 1` (DM 1-para-1) e
        //       `recipients`, registrando o patch na primeira renderização
        //       e evitando duplicatas com `patchedDMList`.
        //
        // Guard global: garante que o patch só seja registrado uma vez,
        // mesmo que o componente seja encontrado por múltiplas estratégias.
        let patchedDMList = false;

        /**
         * Lógica de injeção compartilhada por todas as variantes do item de DM.
         * Recebe (args, res) no formato do patcher.after.
         */
        const dmItemPatch = (args: any[], res: any, keyPrefix: string) => {
            if (!storage.userList) return;

            // Extrai o userId de qualquer posição possível nas props
            const userId: string | null =
                args?.[0]?.user?.id ??
                getDMUserId(args?.[0]?.channel) ??
                findInReactTree(res, (m: any) => m?.props?.user?.id)?.props?.user?.id ??
                null;

            if (!userId) return;

            // Procura o container de texto com o nome do usuário —
            // variante nova (canal com variant de título)
            const textContainer = findInReactTree(res, (m: any) =>
                Array.isArray(m?.props?.children) &&
                m?.props?.children?.[0]?.props?.variant?.includes?.("channel-title")
            );
            if (textContainer) {
                injectIfAbsent(textContainer.props.children, `${keyPrefix}-title`, userId);
                return;
            }

            // Fallback: primeira View com flexDirection "row" que contenha texto
            const nameRow = findInReactTree(res, (m: any) =>
                Array.isArray(m?.props?.children) &&
                m?.props?.style?.flexDirection === "row" &&
                findInReactTree(m, (c: any) => typeof c?.props?.children === "string")
            );
            if (nameRow) {
                injectIfAbsent(nameRow.props.children, `${keyPrefix}-row`, userId);
            }
        };

        // 7a-i. MessagesItemChannelContent (variante Shiggy mais nova)
        const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
        if (MessagesItemChannelContent) {
            patchedDMList = true;
            unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) =>
                dmItemPatch(args, res, "PI-MICC")
            ));
        }

        // 7a-ii. PrivateChannel / DMListItem / DirectMessage
        //        Tentamos todos os nomes conhecidos; o guard `patchedDMList`
        //        impede registro duplo se mais de um for encontrado.
        const knownDMComponents: Array<{ name: string; key: string }> = [
            { name: "PrivateChannel",  key: "PI-PC"  },
            { name: "DMListItem",      key: "PI-DLI" },
            { name: "DirectMessage",   key: "PI-DM"  },
        ];

        for (const { name, key } of knownDMComponents) {
            const comp =
                findByTypeName(name) ??
                findByName(name, false);

            if (comp) {
                patchedDMList = true;
                unpatches.push(patcher.after("type", comp, (args, res) =>
                    dmItemPatch(args, res, key)
                ));
                // Não usa break: se houver variantes com nomes diferentes
                // coexistindo no bundle, todos devem ser patchados.
            }
        }

        // 7b. Scan genérico — ativado somente se nenhum nome conhecido funcionou.
        //
        // Interceptamos o componente da lista de DMs pelo shape das props:
        // qualquer componente que renderize um `channel` com type === 1
        // (DM 1-para-1) e que tenha `recipients`.
        //
        // Como `findByProps` retorna o módulo e não o componente diretamente,
        // usamos uma heurística adicional: procuramos por um módulo que exporte
        // uma função cujo displayName contenha "Channel" ou "DM".
        if (!patchedDMList) {
            // Tenta localizar pelo shape de exportações típicas de listas de DM
            const dmListModule =
                findByProps("renderPrivateChannel") ??
                findByProps("renderDMItem") ??
                findByProps("getPrivateChannelIds");

            if (dmListModule) {
                // Pega a primeira exportação que seja função
                const exportKey = Object.keys(dmListModule).find(
                    k => typeof dmListModule[k] === "function"
                );
                if (exportKey) {
                    patchedDMList = true;
                    unpatches.push(patcher.after(exportKey, dmListModule, (args, res) =>
                        dmItemPatch(args, res, "PI-Generic")
                    ));
                }
            }
        }

        // 7c. Último recurso: PrivateChannelsList (lista container).
        //     Itera os itens renderizados e injeta em cada um.
        //     Mais custoso, mas garante cobertura mesmo em builds não mapeados.
        const PrivateChannelsList =
            findByTypeName("PrivateChannelsList") ??
            findByTypeName("ChannelsList") ??
            findByName("PrivateChannelsList", false);

        if (PrivateChannelsList) {
            unpatches.push(patcher.after("type", PrivateChannelsList, (_args, res) => {
                if (!storage.userList) return;

                const items = findInReactTree(
                    res,
                    (m: any) => Array.isArray(m) && m.length > 0 && m[0]?.props?.channel
                );
                if (!Array.isArray(items)) return;

                items.forEach((item: any) => {
                    const userId = getDMUserId(item?.props?.channel);
                    if (!userId) return;

                    const nameRow = findInReactTree(item, (m: any) =>
                        Array.isArray(m?.props?.children) &&
                        m?.props?.style?.flexDirection === "row"
                    );
                    if (nameRow) {
                        injectIfAbsent(nameRow.props.children, `PI-List-${userId}`, userId);
                    }
                });
            }));
        }
    },

    onUnload: () => {
        unpatches.forEach(u => u());
        unpatches = [];
    },

    settings: () => React.createElement(Settings),
};
