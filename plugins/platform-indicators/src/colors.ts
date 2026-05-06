import { rawColors, chroma } from "@vendetta/metro/common";

const FALLBACK_COLORS: Record<string, string> = {
    online:  "#23a55a",
    dnd:     "#f23f43",
    idle:    "#f0b232",
    offline: "#80848e",
};

function getThemeColors(): Record<string, string> {
    try {
        return {
            online:  chroma(rawColors.GREEN_360).hex(),
            dnd:     chroma(rawColors.RED_400).hex(),
            idle:    chroma(rawColors.YELLOW_300).hex(),
            offline: chroma(rawColors.PRIMARY_400).hex(),
        };
    } catch {
        return FALLBACK_COLORS;
    }
}

export function getStatusColor(status: string, useFallback = false): string {
    const colors = useFallback ? FALLBACK_COLORS : getThemeColors();
    return colors[status] ?? FALLBACK_COLORS.offline;
}
