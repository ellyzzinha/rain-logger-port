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
    const RN = findByProps("Image", "View") ?? null;
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
    // ── 1. Emoji (chat + reações) ─────────────────────────────────────────
    // Diagnóstico confirmou: findByProps("Emoji") existe
    // keys: default, DIVERSITY_SURROGATES, Emoji, asUnicodeEmoji
    //
    // `Emoji` é o componente de renderização.
    // `asUnicodeEmoji` converte emoji object → surrogate string (útil para fallback).
    // `default` provavelmente é o componente principal exportado.

    const emojiMod = findByProps("Emoji", "asUnicodeEmoji");

    if (emojiMod) {
        // Patcha o componente "Emoji" — usado no chat e nas reações
        tryPatch(emojiMod, "Emoji", ([props], orig) => {
            // Props possíveis dependendo do contexto:
            // { emoji: { surrogates }, emojiSize, jumboable }
            // { node: { surrogate, jumboable } }
            const surrogates =
                props?.emoji?.surrogates ??
                props?.node?.surrogate ??
                props?.surrogates;

            if (!surrogates) return orig(props);

            const jumbo =
                props?.jumboable ??
                props?.node?.jumboable ??
                props?.emoji?.jumboable ??
                false;

            const size =
                props?.emojiSize ??
                props?.size ??
                (jumbo ? 48 : 22);

            return appleImg(surrogates, size) ?? orig(props);
        });

        // Patcha também o `default` export do módulo — em algumas versões
        // do Discord mobile o componente principal fica no `default`
        tryPatch(emojiMod, "default", ([props], orig) => {
            const surrogates =
                props?.emoji?.surrogates ??
                props?.node?.surrogate ??
                props?.surrogates;

            if (!surrogates) return orig(props);

            const jumbo =
                props?.jumboable ??
                props?.node?.jumboable ??
                false;

            const size = props?.emojiSize ?? props?.size ?? (jumbo ? 48 : 22);
            return appleImg(surrogates, size) ?? orig(props);
        });
    }

    // ── 2. EmojiPickerListRow (seletor de emojis) ─────────────────────────
    // Diagnóstico confirmou: findByProps("EmojiPickerListRow") existe
    // keys: EmojiPickerListRow
    //
    // Renderiza uma linha inteira do picker. Cada célula dentro da linha
    // recebe { emoji: { surrogates } }. Patchamos o componente da linha
    // e injetamos um renderizador customizado via props.

    const pickerMod = findByProps("EmojiPickerListRow");

    if (pickerMod) {
        tryPatch(pickerMod, "EmojiPickerListRow", ([props], orig) => {
            // Injeta função de render para cada célula da linha
            const newProps = {
                ...props,
                // Alguns builds do Discord usam renderEmoji ou emojiRenderer
                // como prop de render customizável na row
                renderEmoji: (emojiProps: any) => {
                    const surrogates = emojiProps?.emoji?.surrogates;
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
