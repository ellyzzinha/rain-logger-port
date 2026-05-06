import { patcher } from "@vendetta";
import { findByName, findByProps, findByStoreName, findByTypeName, findByTypeNameAll } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import React from "react";
import { ReactNative } from "@vendetta/metro/common";

import StatusIcons from "./StatusIcons";
import PresenceUpdatedContainer from "./PresenceUpdatedContainer";
import Settings from "./settings";

const { View, Text } = ReactNative;

let unpatches: Array<() => void> = [];

export default {
    onLoad: () => {
        storage.dmTopBar ??= true;
        storage.userList ??= true;
        storage.profileUsername ??= true;
        storage.removeDefaultMobile ??= true;
        storage.fallbackColors ??= false;

        const debugLabels = false;

        // DM top bar
        unpatches.push(patcher.after("default", findByName("ChannelHeader", false), (args, res) => {
            if (!storage.dmTopBar) return;
            if (!(res.type?.type?.name === "PrivateChannelHeader")) return;

            patcher.after("type", res.type, (args, res) => {
                if (!res.props?.children?.props?.children) return;
                const userId = findInReactTree(res, m => m.props?.user?.id)?.props?.user?.id;
                if (!userId) return;

                const dmTopBar = res.props?.children;
                if (!findInReactTree(res, m => m.key === "DMTabsV2Header")) {
                    if (dmTopBar.props?.children?.props?.children[1]) {
                        if (typeof dmTopBar.props?.children?.props?.children[1]?.type === "function") {
                            const titleThing = dmTopBar.props?.children?.props?.children[1];

                            const unpatchTV2HdrV2 = patcher.after("type", titleThing, (args, res) => {
                                unpatchTV2HdrV2();
                                if (!findInReactTree(res, c => c.key === "DMTabsV2Header-v2")) {
                                    res.props.children[0].props.children.push(
                                        <PresenceUpdatedContainer key="DMTabsV2Header-v2">
                                            {debugLabels ? <Text>DTV2H-v2</Text> : <StatusIcons userId={userId} />}
                                        </PresenceUpdatedContainer>
                                    );
                                }
                            });
                        } else {
                            const arrowId = getAssetIDByName("arrow-right");
                            const container1 = findInReactTree(dmTopBar, m => m.props?.children[1]?.props?.source === arrowId);

                            container1?.props?.children?.push(
                                <View key="DMTabsV2Header" style={{ flexDirection: "row", justifyContent: "center", alignContent: "flex-start" }}>
                                    <View key="DMTabsV2HeaderIcons" style={{ flexDirection: "row" }} />
                                </View>
                            );
                        }
                    }
                }

                const topIcons = findInReactTree(res, m => m.key === "DMTabsV2HeaderIcons");
                if (topIcons) {
                    topIcons.props.children = <StatusIcons userId={userId} />;
                }
            });
        }));

        // User profile
        const UserProfileContent = findByTypeName("UserProfileContent");
        unpatches.push(patcher.after("type", UserProfileContent, (args, res) => {
            const primaryInfo = findInReactTree(res, c => c?.type?.name === "PrimaryInfo");
            patcher.after("type", primaryInfo, (args, res) => {
                if (res?.type?.name === "UserProfilePrimaryInfo") {
                    patcher.after("type", res, (args, res) => {
                        const displayName = findInReactTree(res, c => c?.type?.name === "DisplayName");
                        patcher.after("type", displayName, (args, res) => {
                            const userId = args[0]?.user?.id;
                            if (userId) {
                                res.props.children.push(
                                    <PresenceUpdatedContainer key="UserProfileIcons">
                                        <StatusIcons userId={userId} />
                                    </PresenceUpdatedContainer>
                                );
                            }
                        });
                    });
                }
            });
        }));

        // DisplayName patch
        const DisplayName = findByProps("DisplayName");
        unpatches.push(patcher.after("DisplayName", DisplayName, (args, res) => {
            const user = args[0]?.user;
            if (!user?.id) return;
            if (!res) return;
            if (!storage.profileUsername) return;
            res.props?.children?.props?.children[0]?.props?.children?.push(<StatusIcons userId={user.id} />);
        }));

        // Hide default mobile indicator
        const Status = findByName("Status", false);
        unpatches.push(patcher.before("default", Status, (args) => {
            if (!args?.[0]) return;
            if (!storage.removeDefaultMobile) return;
            args[0].isMobileOnline = false;
        }));

        // Guild member row
        const Rows = findByProps("GuildMemberRow");
        if (Rows?.GuildMemberRow) {
            unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                if (!storage.userList) return;
                if (!findInReactTree(res, c => c.key === "GuildMemberRowStatusIconsView")) {
                    const row = findInReactTree(res, c => c.props?.style?.flexDirection === "row");
                    if (row) {
                        row.props.children.splice(2, 0,
                            <View key="GuildMemberRowStatusIconsView" style={{ flexDirection: "row" }}>
                                {debugLabels ? <Text>GMRSIV</Text> : <StatusIcons userId={user.id} />}
                            </View>
                        );
                    }
                }
            }));
        }

        // User row (member list / friends list)
        let patchedAvatar = false;
        const rowPatch = ([{ user }], res) => {
            if (!storage.userList) return;
            if (!findInReactTree(res?.props?.label, c => c.key === "TabsV2MemberListStatusIconsView")) {
                res.props.label = (
                    <View style={{ flexDirection: "row", alignItems: "center" }} key="TabsV2MemberListStatusIconsView">
                        {res.props.label}
                        <View key="TabsV2MemberListStatusIconsView" style={{ flexDirection: "row" }}>
                            {debugLabels ? <Text>TV2MLSIV</Text> : <StatusIcons userId={user.id} />}
                        </View>
                    </View>
                );

                if (!patchedAvatar && res.props.icon?.type) {
                    unpatches.push(patcher.before("type", res.props.icon.type, (args) => {
                        if (storage.removeDefaultMobile) args[0].isMobileOnline = false;
                    }));
                    patchedAvatar = true;
                }
            }
        };

        findByTypeNameAll("UserRow").forEach(UserRow =>
            unpatches.push(patcher.after("type", UserRow, rowPatch))
        );

        // DM list
        const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
        unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
            const channel = args[0]?.channel;
            if (channel?.recipients?.length === 1) {
                const userId = channel.recipients[0];
                const textContainer = findInReactTree(res, m => m.props?.children?.[0]?.props?.variant === "redesign/channel-title/semibold");
                if (textContainer) {
                    textContainer.props.children.push(
                        <View key="TabsV2RedesignDMListIcons" style={{ flexDirection: "row" }}>
                            {debugLabels ? <Text>TV2RDMLI</Text> : <StatusIcons userId={userId} />}
                        </View>
                    );
                }
            }
        }));
    },

    onUnload: () => {
        unpatches.forEach(u => u());
        unpatches = [];
    },

    settings: () => <Settings />,
};
