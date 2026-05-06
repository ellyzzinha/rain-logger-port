import { findByStoreName } from "@vendetta/metro";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { React } from "@vendetta/metro/common";

import StatusIcon from "./StatusIcon";
import { getStatusColor } from "./colors";

const PresenceStore = findByStoreName("PresenceStore");
const SessionsStore = findByStoreName("SessionsStore");
const UserStore     = findByStoreName("UserStore");

let statusCache: any;
let statusCacheHits = 0;
let statusCacheTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;

function queryPresenceStoreWithCache() {
    if (!statusCacheTimeout) {
        statusCacheTimeout = setTimeout(() => {
            statusCacheHits = 0;
            statusCacheTimeout = null;
        }, 5000);
    }
    if (!statusCache || statusCacheHits === 0) {
        statusCache = PresenceStore.getState();
    }
    statusCacheHits = (statusCacheHits + 1) % 20;
    return statusCache;
}

function getUserStatuses(userId: string): Record<string, string> | undefined {
    if (!currentUserId) currentUserId = UserStore.getCurrentUser()?.id;

    if (userId === currentUserId) {
        // ✅ Corrigido: Sintaxe do Record limpa para evitar erro de build
        const sessions = SessionsStore.getSessions() as Record<
            string,
            { clientInfo: { client: string, status: string } }
        >;
        
        return Object.values(sessions).reduce<Record<string, string>>((acc, curr) => {
            if (curr.clientInfo.client !== "unknown") acc[curr.clientInfo.client] = curr.status;
            return acc;
        }, {});
    }

    return queryPresenceStoreWithCache()?.clientStatuses?.[userId];
}

export default function StatusIcons({ userId, size = 16 }: { userId: string; size?: number }) {
    useProxy(storage);

    if (!userId) return null;

    const statuses = getUserStatuses(userId);
    if (!statuses) return null;

    return React.createElement(
        React.Fragment,
        null,
        ...Object.entries(statuses).map(([platform, status]) =>
            React.createElement(StatusIcon, {
                key: platform,
                platform,
                color: getStatusColor(status, storage.fallbackColors),
                iconSize: size,
            })
        )
    );
}
