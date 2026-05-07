import { findByProps } from "@vendetta/metro";

function init() {
    // Tenta achar módulos relacionados a mensagens e rows
    const checks: [string, string[]][] = [
        ["ChatRow", ["ChatRow"]],
        ["MessageRow", ["MessageRow"]],
        ["getMessageRows", ["getMessageRows"]],
        ["renderRow", ["renderRow"]],
        ["rowForMessage", ["rowForMessage"]],
        ["messageToRows", ["messageToRows"]],
        ["generateRows", ["generateRows"]],
        ["type+message", ["type", "message", "content"]],
        ["isJumboable", ["isJumboable"]],
        ["jumboable", ["jumboable"]],
        ["surrogate", ["surrogate"]],
        ["RowManager", ["RowManager"]],
        ["MessageListView", ["MessageListView"]],
    ];

    const results = checks.map(([label, props]) => {
        try {
            const mod = findByProps(...props);
            if (!mod) return `❌ ${label}`;
            return `✅ ${label} → ${Object.keys(mod).slice(0, 5).join(", ")}`;
        } catch {
            return `❌ ${label}`;
        }
    });

    alert(results.join("\n"));
}

init();

export const onUnload = () => {};
