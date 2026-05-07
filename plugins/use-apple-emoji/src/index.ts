import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

// ── CDN Apple Emoji ────────────────────────────────────────────────────────
const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/";

function toPath(surrogate: string): string | null {
    if (!surrogate) return null;
    const pts: string[] = [];
    for (let i = 0; i < surrogate.length;) {
        const cp = surrogate.codePointAt(i);
        if (cp === undefined) break;
        // Filtra FE0F (variation selector) mas mantém ZWJ e outros
        if (cp !== 0xfe0f) pts.push(cp.toString(16));
        i += cp > 0xffff ? 2 : 1;
    }
    return pts.length ? pts.join("-") + ".png" : null;
}

function appleURL(surrogate: string): string | null {
    const p = toPath(surrogate);
    return p ? CDN + p : null;
}

// Usa ReactNative.Image diretamente — exposto pelo @vendetta/metro/common
function appleImg(surrogate: string, size: number): any {
    const url = appleURL(surrogate);
    if (!url) return null;

    const Image = ReactNative?.Image;
    if (!Image) return null;

    return React.createElement(Image, {
        key: `ape-${surrogate}-${size}`,
        source: { uri: url },
        style: { width: size, height: size },
        resizeMode: "contain",
        accessibilityLabel: surrogate,
        fadeDuration: 0,
    });
}

// ── Patcher helpers ────────────────────────────────────────────────────────
const unpatchers: (() => void)[] = [];

function tryPatch(
    mod: Record<string, any> | null | undefined,
    key: string,
    handler: (args: any[], orig: (...a: any[]) => any) => any
) {
    if (!mod || typeof mod[key] !== "function") return;
    try {
        unpatchers.push(patcher.instead(mod, key, handler));
    } catch { }
}

// ── Extrai surrogates de qualquer forma de props que o Discord use ─────────
function getSurrogates(props: any): string | null {
    return (
        props?.emoji?.surrogates ??
        props?.node?.surrogate ??
        props?.surrogates ??
        props?.emoji?.surrogate ??
        null
    );
}

function getSize(props: any): number {
    const jumbo =
        props?.jumboable ??
        props?.node?.jumboable ??
        props?.emoji?.jumboable ??
        false;
    return props?.emojiSize ?? props?.size ?? (jumbo ? 48 : 22);
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
    const emojiMod = findByProps("Emoji", "asUnicodeEmoji");

    if (emojiMod) {
        for (const key of ["Emoji", "default"] as const) {
            tryPatch(emojiMod, key, ([props], orig) => {
                const surrogates = getSurrogates(props);
                if (!surrogates) return orig(props);
                return appleImg(surrogates, getSize(props)) ?? orig(props);
            });
        }
    }

    const pickerMod = findByProps("EmojiPickerListRow");

    if (pickerMod) {
        tryPatch(pickerMod, "EmojiPickerListRow", ([props], orig) => {
            const newProps = {
                ...props,
                renderEmoji: (emojiProps: any) => {
                    const surrogates = getSurrogates(emojiProps);
                    if (!surrogates) return null;
                    return appleImg(surrogates, 32);
                },
            };
            try {
                return orig(newProps);
            } catch {
                return orig(props);
            }
        });
    }
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
