import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { plugin } from "@vendetta";

const RNChatModule = findByProps("updateRows", "sendMessage");

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

export const onUnload = before("updateRows", RNChatModule, (args) => {
    const rows = JSON.parse(args[1]);
    try {
        for (const row of rows) {
            if (row.type === 1 && row.message?.content)
                iterate(row.message.content);
        }
    } catch (e: any) {
        console.error(`[use-apple-emoji]`, e.stack);
    }
    args[1] = JSON.stringify(rows);
});
