import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";

const RNChatModule = findByProps("updateRows", "clearRows");

const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/";

function toPath(surrogate: string): string {
    return [...surrogate]
        .map(c => c.codePointAt(0)!.toString(16))
        .join("-") + ".png";
}

function iterate(content: any[]): void {
    for (const node of content) {
        if (node.type === "emoji") {
            node.type = "customEmoji";
            node.id = node.surrogate;
            node.alt = node.surrogate;
            node.src = CDN + toPath(node.surrogate);
            node.frozenSrc = node.src;
        }
        if (Array.isArray(node.content)) iterate(node.content);
        if (Array.isArray(node.items)) iterate(node.items);
    }
}

let unpatch: () => void;

export function onLoad() {
    unpatch = before("updateRows", RNChatModule, (args) => {
        try {
            const rows = Array.isArray(args[0]) ? args[0] : args[1];
            if (!Array.isArray(rows)) return;
            for (const row of rows) {
                if (row.type === 1 && row.message?.content)
                    iterate(row.message.content);
            }
        } catch (e: any) {
            console.error(`[use-apple-emoji]`, e.stack);
        }
    });
}

export function onUnload() {
    unpatch?.();
}
