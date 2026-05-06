import { patcher } from "@vendetta";
import { findByName, findByProps, findByStoreName, findByTypeName, findByTypeNameAll } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
// ✅ React DEVE vir do metro/common no Vendetta
import { React, ReactNative } from "@vendetta/metro/common";

import StatusIcons from "./StatusIcons";
import PresenceUpdatedContainer from "./PresenceUpdatedContainer";
import Settings from "./settings";

const { View, Text } = ReactNative;

let unpatches: Array<() => void> = [];

export default {
    onLoad: () => {
        storage.dmTopBar          ??= true;
        storage.userList          ??= true;
        storage.profileUsername   ??= true;
        storage.removeDefaultMobile ??= true;
        storage.fallbackColors    ??= false;

        const debugLabels = false;

        // ── DM top bar ────────────────────────────────────────────────
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
                    if (!child1) return;

                    if (typeof child1?.type === "function") {
                        const unpatchInner = patcher.after("type", child1, (_a, r) => {
                            unpatchInner();
                            if (findInReactTree(r, c => c?.key === "DMTabsV2Header-v2")) return;

                            r?.props?.children?.[0]?.props?.children?.push(
                                React.createElement(PresenceUpdatedContainer, { key: "DMTabsV2Header-v2" },
                                    debugLabels
                                        ? React.createElement(Text, null, "DTV2H-v2")
                                        : React.createElement(StatusIcons, { userId })
                                )
                            );
                        });
                    } else {
                        const arrowId = getAssetIDByName("arrow-right");
                        const container1 = findInReactTree(dmTopBar, m =>
                            m?.props?.children?.[1]?.props?.source === arrowId
                        );
                        container1?.props?.children?.push(
                            React.createElement(View, { key: "DMTabsV2Header", style: { flexDirection: "row", justifyContent: "center", alignContent: "flex-start" } },
                                React.createElement(View, { key: "DMTabsV2HeaderIcons", style: { flexDirection: "row" } })
                            )
                        );
                    }
                }

                const topIcons = findInReactTree(res, m => m?.key === "DMTabsV2HeaderIcons");
                if (topIcons) {
                    topIcons.props.children = React.createElement(StatusIcons, { userId });
                }
            });
        }));

        // ── User profile ──────────────────────────────────────────────
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
                                React.createElement(PresenceUpdatedContainer, { key: "UserProfileIcons" },
                                    React.createElement(StatusIcons, { userId })
                                )
                            );
                        });
                    });
                });
            }));
        }

        // ── DisplayName patch ─────────────────────────────────────────
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

        // ── Hide default mobile indicator ─────────────────────────────
        const Status = findByName("Status", false);
        if (Status) {
            unpatches.push(patcher.before("default", Status, (args) => {
                if (!args?.[0] || !storage.removeDefaultMobile) return;
                args[0].isMobileOnline = false;
            }));
        }

        // ── Guild member row ──────────────────────────────────────────
        const Rows = findByProps("GuildMemberRow");
        if (Rows?.GuildMemberRow) {
            unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                if (!storage.userList) return;
                if (findInReactTree(res, c => c?.key === "GuildMemberRowStatusIconsView")) return;

                const row = findInReactTree(res, c => c?.props?.style?.flexDirection === "row");
                if (!row) return;

                row.props.children.splice(2, 0,
                    React.createElement(View, { key: "GuildMemberRowStatusIconsView", style: { flexDirection: "row" } },
                        debugLabels
                            ? React.createElement(Text, null, "GMRSIV")
                            : React.createElement(StatusIcons, { userId: user.id })
                    )
                );
            }));
        }

        // ── User row (member list / friends list) ─────────────────────
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

        // ── DM list ───────────────────────────────────────────────────
        const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
        if (MessagesItemChannelContent) {
            unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
                const channel = args?.[0]?.channel;
                if (channel?.recipients?.length !== 1) return;

                const userId = channel.recipients[0];
                const textContainer = findInReactTree(res, m =>
                    m?.props?.children?.[0]?.props?.variant === "redesign/channel-title/semibold"
                );

                if (!textContainer) return;

                textContainer.props.children.push(
                    React.createElement(View, { key: "TabsV2RedesignDMListIcons", style: { flexDirection: "row" } },
                        debugLabels
                            ? React.createElement(Text, null, "TV2RDMLI")
                            : React.createElement(StatusIcons, { userId })
                    )
                );
            }));
        }
    },

    onUnload: () => {
        unpatches.forEach(u => u());
        unpatches = [];
    },

    settings: () => React.createElement(Settings),
};
