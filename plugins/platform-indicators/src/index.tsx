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
    // channel.recipients pode ser array de strings ou de objetos
    if (Array.isArray(channel.recipients) && channel.recipients.length === 1) {
        const r = channel.recipients[0];
        return typeof r === "string" ? r : r?.id ?? null;
    }
    // fallback: recipientId direto
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

        // ── 7. DM list — abordagem em camadas ───────────────────────
        //
        // A lista de DMs pode ser renderizada por componentes diferentes
        // dependendo da versão do Shiggy/Discord. Tentamos os três mais
        // comuns em ordem de especificidade.

        // 7a. MessagesItemChannelContent  (variante mais nova)
        const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
        if (MessagesItemChannelContent) {
            unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
                if (!storage.userList) return;
                const userId = getDMUserId(args?.[0]?.channel);
                if (!userId) return;

                // Procura o container de texto com o nome do usuário
                const textContainer = findInReactTree(res, m =>
                    Array.isArray(m?.props?.children) &&
                    m?.props?.children?.[0]?.props?.variant?.includes("channel-title")
                );
                if (textContainer) {
                    injectIfAbsent(textContainer.props.children, "PI-MessagesItemV2", userId);
                    return;
                }

                // Fallback: qualquer View que contenha um Text com o nome do canal
                const nameRow = findInReactTree(res, m =>
                    m?.props?.style?.flexDirection === "row" &&
                    findInReactTree(m, c => typeof c?.props?.children === "string")
                );
                if (nameRow) {
                    injectIfAbsent(nameRow.props.children, "PI-MessagesItemV2-fb", userId);
                }
            }));
        }

        // 7b. PrivateChannel  (variante mais antiga / fallback)
        const PrivateChannel = findByTypeName("PrivateChannel") ?? findByName("PrivateChannel", false);
        if (PrivateChannel) {
            unpatches.push(patcher.after("type", PrivateChannel, (args, res) => {
                if (!storage.userList) return;

                // O userId pode vir direto nas props ou dentro do channel
                const userId =
                    args?.[0]?.user?.id ??
                    getDMUserId(args?.[0]?.channel) ??
                    findInReactTree(res, m => m?.props?.user?.id)?.props?.user?.id;
                if (!userId) return;

                // Procura a linha com o nome — normalmente uma View com flexDirection row
                const nameRow = findInReactTree(res, m =>
                    Array.isArray(m?.props?.children) &&
                    m?.props?.style?.flexDirection === "row"
                );
                if (nameRow) {
                    injectIfAbsent(nameRow.props.children, "PI-PrivateChannel", userId);
                }
            }));
        }

        // 7c. DMListItem / DirectMessage  (outro nome possível)
        const DMListItem =
            findByTypeName("DMListItem") ??
            findByTypeName("DirectMessage") ??
            findByName("DMListItem", false) ??
            findByName("DirectMessage", false);

        if (DMListItem) {
            unpatches.push(patcher.after("type", DMListItem, (args, res) => {
                if (!storage.userList) return;

                const userId =
                    args?.[0]?.user?.id ??
                    getDMUserId(args?.[0]?.channel);
                if (!userId) return;

                const nameRow = findInReactTree(res, m =>
                    Array.isArray(m?.props?.children) &&
                    m?.props?.style?.flexDirection === "row"
                );
                if (nameRow) {
                    injectIfAbsent(nameRow.props.children, "PI-DMListItem", userId);
                }
            }));
        }

        // 7d. Scan genérico por "PrivateChannelsList" ou equivalente
        //     Intercepta qualquer componente cujo displayName contenha "PrivateChannel"
        //     e que receba uma prop `channel` com recipients.
        const PrivateChannelsList =
            findByTypeName("PrivateChannelsList") ??
            findByTypeName("ChannelsList") ??
            findByName("PrivateChannelsList", false);

        if (PrivateChannelsList) {
            unpatches.push(patcher.after("type", PrivateChannelsList, (args, res) => {
                if (!storage.userList) return;

                // Itera todos os itens renderizados na lista
                const items = findInReactTree(res, m => Array.isArray(m) && m.length > 0 && m[0]?.props?.channel);
                if (!Array.isArray(items)) return;

                items.forEach(item => {
                    const userId = getDMUserId(item?.props?.channel);
                    if (!userId) return;

                    const nameRow = findInReactTree(item, m =>
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
