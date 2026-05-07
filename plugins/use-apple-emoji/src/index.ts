// vendetta-types expõe tudo via @vendetta
import { patcher } from "@vendetta";
import { findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";

const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/";

function toPath(surrogate: string): string | null {
    if (!surrogate) return null;
    const pts: string[] = [];
    for (let i = 0; i < surrogate.length;) {
        const cp = surrogate.codePointAt(i);
        if (cp === undefined) break;
        if (cp !== 0xfe0f) pts.push(cp.toString(16));
        i += cp > 0xffff ? 2 : 1;
    }
    return pts.length ? pts.join("-") + ".png" : null;
}

function appleURL(surrogate: string): string | null {
    const p = toPath(surrogate);
    return p ? CDN + p : null;
}

function appleImg(surrogate: string, size: number): any {
    const url = appleURL(surrogate);
    if (!url) return null;

    const RN = findByProps("Image", "View") ?? findByProps("Image") ?? null;
    const Image = RN?.Image;
    if (!Image) return null;

    return React.createElement(Image, {
        key: `ape-${surrogate}-${size}`,
        source: { uri: url },
        style: { width: size, height: size, resizeMode: "contain" },
        accessibilityLabel: surrogate,
        fadeDuration: 0,
    });
}

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

function init() {
    // 1. NativeEmoji — componente base, cobre chat
    const emojiMod =
        findByProps("NativeEmoji") ??
        findByProps("EmojiComponent") ??
        findByProps("renderNativeEmoji");

    if (emojiMod) {
        const key =
            "NativeEmoji" in emojiMod ? "NativeEmoji" :
            "EmojiComponent" in emojiMod ? "EmojiComponent" :
            "renderNativeEmoji";

        tryPatch(emojiMod, key, ([props], orig) => {
            const surrogates = props?.emoji?.surrogates ?? props?.surrogates;
            if (!surrogates) return orig(props);
            const size = props?.emojiSize ?? props?.size ?? 24;
            return appleImg(surrogates, size) ?? orig(props);
        });
    }

    // 2. Emoji node — mensagens, preserva jumbo
    const nodeMod =
        findByProps("renderEmoji") ??
        findByProps("Emoji", "EmojiText") ??
        findByProps("Emoji");

    if (nodeMod) {
        const key = Object.keys(nodeMod).find(
            (k) => typeof nodeMod[k] === "function" && /^(emoji|Emoji|renderEmoji)/i.test(k)
        );
        if (key) {
            tryPatch(nodeMod, key, ([props], orig) => {
                const surrogates =
                    props?.node?.surrogate ??
                    props?.surrogates ??
                    props?.emoji?.surrogates;
                if (!surrogates) return orig(props);
                const jumbo = props?.node?.jumboable ?? props?.jumboable ?? false;
                return appleImg(surrogates, jumbo ? 48 : 22) ?? orig(props);
            });
        }
    }

    // 3. Reações
    const reactionMod =
        findByProps("EmojiReaction") ??
        findByProps("ReactionEmoji") ??
        findByProps("MessageReaction");

    if (reactionMod) {
        const key = Object.keys(reactionMod).find((k) => /reaction|emoji/i.test(k));
        if (key) {
            tryPatch(reactionMod, key, ([props], orig) => {
                const surrogates = props?.emoji?.surrogates;
                if (!surrogates) return orig(props);
                return appleImg(surrogates, props?.emojiSize ?? 20) ?? orig(props);
            });
        }
    }

    // 4. Picker (seletor de emojis)
    const pickerMod =
        findByProps("EmojiPickerCell") ??
        findByProps("EmojiPickerListRow") ??
        findByProps("emojiPickerCell");

    if (pickerMod) {
        const key = Object.keys(pickerMod).find((k) => /cell|item|emoji/i.test(k));
        if (key && typeof pickerMod[key] === "function") {
            tryPatch(pickerMod, key, ([props], orig) => {
                const surrogates = props?.emoji?.surrogates;
                if (!surrogates) return orig(props);
                const img = appleImg(surrogates, 32);
                if (!img) return orig(props);
                try {
                    const original = orig(props);
                    if (!original) return img;
                    return React.cloneElement(original, {}, img);
                } catch {
                    return img;
                }
            });
        }
    }
}

init();

export const onUnload = () => {
    for (const up of unpatchers) up();
    unpatchers.length = 0;
};
