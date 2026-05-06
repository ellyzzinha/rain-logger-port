/**
 * FakeNitro Unificado — Shiggycord (Android)
 *
 * Bases usadas:
 *  - Freemoji     (Vendetta/maisy & Rico040) — lógica de emoji
 *  - FreeStickers (Vendetta/aliernfrog)       — lógica de figurinha
 *  - FakeNitro    (Rain/John et al.)          — guards, appIcons, themes, removeNitroBtn
 *
 * Diferenciais exigidos:
 *  1. Clique real  — emoji/sticker enviado com guild_id + name para abrir popout nativo
 *  2. Sem bordas   — hyperlink limpo, sem preview de imagem inline
 *  3. Settings     — emojiSize (Tiny→Jumbo) + toggles por função
 *  4. Shiggy guards — useState lazy-init para não crashar no Android
 */

import { definePlugin } from "@plugins";
import { after, before, instead } from "@api/patcher";
import { findByProps, findByStoreName } from "@metro";
import { ReactNative as RN } from "@metro/common";
import { useReducer, useRef } from "react";
import { ScrollView } from "react-native";

// ─── Shiggy Guard ────────────────────────────────────────────────────────────
// Alternativa ao useState que não causa crash no hermes/Android quando o
// componente é montado fora do ciclo normal do React Native.
function useShiggyState<T>(init: T): [T, (v: T | ((prev: T) => T)) => void] {
    // useReducer é mais estável que useState no Hermes de versões antigas
    const [state, dispatch] = useReducer(
        (_: T, action: T | ((prev: T) => T)) =>
            typeof action === "function" ? (action as (p: T) => T)(_) : action,
        undefined as unknown as T,
        () => init,          // lazy initializer — não executa na declaração do módulo
    );
    return [state, dispatch];
}

// ─── Storage (Zustand-like simples, sem dependência externa) ──────────────────
// Evita depender de createFileStorage, que pode não estar disponível em todas
// as builds do Shiggycord.
const STORAGE_KEY = "fakenitro-shiggycord";

interface Settings {
    emojiSize: number;
    hyperLink: boolean;
    stickerHyperLink: boolean;
    fakeEmojisEnabled: boolean;
    fakeStickersEnabled: boolean;
    appIconsEnabled: boolean;
    nitroThemesEnabled: boolean;
    removeNitroBtnEnabled: boolean;
    ignoreNitro: boolean;           // força mesmo tendo Nitro real
}

const DEFAULT_SETTINGS: Settings = {
    emojiSize: 48,
    hyperLink: true,
    stickerHyperLink: true,
    fakeEmojisEnabled: true,
    fakeStickersEnabled: true,
    appIconsEnabled: true,
    nitroThemesEnabled: true,
    removeNitroBtnEnabled: true,
    ignoreNitro: false,
};

let _settings: Settings = { ...DEFAULT_SETTINGS };

// Tenta ler do AsyncStorage sem bloquear
try {
    const stored = (globalThis as any).__shiggy_fakenitro_cfg;
    if (stored) _settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<Settings>) };
} catch { /* ignora */ }

function saveSettings() {
    try {
        (globalThis as any).__shiggy_fakenitro_cfg = JSON.stringify(_settings);
    } catch { /* ignora */ }
}

// Proxy reativo simples — componente de settings chama forceUpdate
const subscribers = new Set<() => void>();
const settings = new Proxy(_settings, {
    set(target, prop, value) {
        (target as any)[prop] = value;
        saveSettings();
        subscribers.forEach(fn => fn());
        return true;
    },
});

function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
    const [, forceUpdate] = useShiggyState(0);
    const unsubRef = useRef<(() => void) | null>(null);
    if (!unsubRef.current) {
        const fn = () => forceUpdate(n => n + 1);
        subscribers.add(fn);
        unsubRef.current = fn;
    }
    return [
        settings,
        (patch) => { Object.assign(settings, patch); },
    ];
}

// ─── Metro Lookups ────────────────────────────────────────────────────────────
const nitroInfo        = findByProps("canUseEmojisEverywhere");
const emojiUtils       = findByProps("getEmojiUnavailableReason");
const iconConstants    = findByProps("getOfficialAlternateIcons", "getLimitedAlternateIcons");
const canUseThemes     = findByProps("canUseClientThemes");
const messageModule    = findByProps("sendMessage", "receiveMessage");
const uploadModule     = findByProps("uploadLocalFiles");
const LazyActionSheet  = findByProps("openLazy", "hideActionSheet");
const { getCurrentUser }  = findByStoreName("UserStore");
const { getCustomEmojiById } = findByStoreName("EmojiStore");
const { getGuildId }      = findByStoreName("SelectedGuildStore");
const { getStickerById }   = findByStoreName("StickersStore");
const { getChannel }       = findByStoreName("ChannelStore");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const hasEmotesRegex = /<a?:(\w+):(\d+)>/i;

/** Retorna true se o usuário tem Nitro real E ignoreNitro está desligado */
function hasRealNitro(): boolean {
    if (settings.ignoreNitro) return false;
    return getCurrentUser?.()?.premiumType !== null;
}

/**
 * Constrói a URL de um emoji com query params que preservam guild_id e name.
 * O Discord usa guild_id + name para abrir o popout do servidor ao clicar.
 *
 * Formato aceito pelo cliente:
 *   https://cdn.discordapp.com/emojis/<id>.<ext>?size=<n>&name=<name>&guild_id=<gid>
 */
function buildEmojiURL(emoji: any, size: number): string {
    const ext  = emoji.animated ? "gif" : "webp";
    const base = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}`;
    const params = new URLSearchParams({
        size:     String(size),
        quality:  "lossless",
        name:     emoji.name ?? "",
        ...(emoji.guildId ? { guild_id: String(emoji.guildId) } : {}),
    });
    return `${base}?${params.toString()}`;
}

/**
 * Constrói a URL de uma figurinha.
 * format_type: 1=PNG, 2=APNG (enviado como PNG estático), 3=Lottie(não suportado), 4=GIF
 */
function buildStickerURL(sticker: any, size: number): string {
    const format = sticker.format_type === 4 ? "gif" : "png";
    const params = new URLSearchParams({
        size:     String(size),
        name:     sticker.name ?? "",
        ...(sticker.guild_id ? { guild_id: String(sticker.guild_id) } : {}),
    });
    return `https://media.discordapp.net/stickers/${sticker.id}.${format}?${params.toString()}`;
}

/**
 * Formata a URL como hyperlink markdown limpo (sem preview de imagem).
 * O truque "anti-embed": quando o texto não termina em extensão de imagem,
 * o Discord não gera preview. Usamos o nome como texto âncora.
 */
function toHyperlink(url: string, label: string): string {
    // Formato: [label](url)
    // O Discord não embeds links com texto âncora → sem borda de imagem
    return `[${label}](${url})`;
}

// ─── Processamento de Mensagem (Emoji) ───────────────────────────────────────
interface Message {
    content: string;
    invalidEmojis: any[];
}

function processEmojiMessage(msg: Message): void {
    if (!msg.content.match(hasEmotesRegex)) return;
    if (hasRealNitro()) return;

    const matches = [...msg.content.matchAll(/<a?:(\w+):(\d+)>/gi)];
    const currentGuildId = getGuildId?.();

    for (const match of matches) {
        const [full, emojiName, emojiId] = match;
        const emoji = getCustomEmojiById?.(emojiId);
        if (!emoji) continue;

        const isExternal = emoji.guildId !== currentGuildId;
        const isAnimated  = emoji.animated;

        if (!isExternal && !isAnimated) continue;

        const url         = buildEmojiURL(emoji, settings.emojiSize);
        const label       = emoji.name ?? emojiName;
        const replacement = settings.hyperLink ? toHyperlink(url, label) : url;

        msg.content = msg.content.replace(full, replacement);
    }

    msg.content       = msg.content.trim();
    msg.invalidEmojis = [];
}

// ─── Ensure Icon Name (appIcons) ─────────────────────────────────────────────
function ensureIconName(icon: any): any {
    if (!icon) return icon;
    if (!icon.name && icon.id) {
        let name = icon.id
            .replace(/Icon$/i, "")
            .replace(/_/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
        icon.name = name
            .toLowerCase()
            .split(" ")
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
            .trim();
    }
    return icon;
}

// ─── Patches ──────────────────────────────────────────────────────────────────
const allPatches: Array<() => void> = [];

function applyPatches() {
    // ── 1. Nitro Checks ────────────────────────────────────────────────────
    if (nitroInfo) {
        allPatches.push(
            instead("canUseEmojisEverywhere", nitroInfo, (args, orig) =>
                hasRealNitro() ? orig(...args) : true),
            instead("canUseAnimatedEmojis", nitroInfo, (args, orig) =>
                hasRealNitro() ? orig(...args) : true),
        );

        // Stickers
        const stickerCheckName =
            nitroInfo.canUseCustomStickersEverywhere
                ? "canUseCustomStickersEverywhere"
                : "canUseStickersEverywhere";
        allPatches.push(
            instead(stickerCheckName, nitroInfo, (args, orig) =>
                hasRealNitro() ? orig(...args) : true),
        );
    }

    if (emojiUtils) {
        // Bloqueia o "emoji premium locked" nos menus
        allPatches.push(
            after("getEmojiUnavailableReason", emojiUtils, (args, result) => {
                if (!settings.fakeEmojisEnabled) return result;
                if (args[0]?.intention === 0 && result === null && !hasRealNitro()) {
                    const { emoji, guildId, channel } = args[0];
                    if (emoji?.type === 0) return result;
                    const cur = guildId ?? channel?.getGuildId?.();
                    if (emoji?.guildId !== cur || emoji?.animated) return 0;
                }
                return result;
            }),
            after("isEmojiPremiumLocked", emojiUtils, (args, result) => {
                if (!settings.fakeEmojisEnabled) return result;
                if (args[0]?.intention === 0 && result === null && !hasRealNitro()) {
                    const { emoji, guildId, channel } = args[0];
                    if (emoji?.type === 0) return result;
                    const cur = guildId ?? channel?.getGuildId?.();
                    if (emoji?.guildId !== cur || emoji?.animated) return true;
                }
                return result;
            }),
        );
    }

    // ── 2. Send Message (Emoji) ────────────────────────────────────────────
    if (messageModule) {
        allPatches.push(
            before("sendMessage", messageModule, (args) => {
                if (!settings.fakeEmojisEnabled) return;
                processEmojiMessage(args[1]);
            }),
        );

        // ── 3. Send Stickers ──────────────────────────────────────────────
        allPatches.push(
            instead("sendStickers", messageModule, (args, orig) => {
                if (!settings.fakeStickersEnabled) return orig(...args);
                if (hasRealNitro()) return orig(...args);

                const [channelId, stickerIds, , extra] = args;
                const sticker = getStickerById?.(stickerIds);

                // Lottie (formato 3) ou sticker de pack padrão — não intercepta
                if (!sticker) return orig(...args);
                if (sticker.format_type === 3 || sticker.pack_id !== undefined)
                    return orig(...args);

                // Se já é do mesmo servidor — não intercepta
                const channelGuildId = getChannel?.(channelId)?.guild_id;
                if (channelGuildId && channelGuildId === sticker.guild_id)
                    return orig(...args);

                const url   = buildStickerURL(sticker, settings.emojiSize);
                const label = sticker.name ?? "sticker";
                const content = settings.stickerHyperLink ? toHyperlink(url, label) : url;

                messageModule.sendMessage(channelId, { content }, null, extra);
            }),
        );
    }

    // Upload (para mensagens com anexo)
    if (uploadModule?.uploadLocalFiles) {
        allPatches.push(
            before("uploadLocalFiles", uploadModule, (args) => {
                if (!settings.fakeEmojisEnabled) return;
                if (hasRealNitro()) return;
                processEmojiMessage(args[0]?.parsedMessage);
            }),
        );
    }

    // ── 4. App Icons ───────────────────────────────────────────────────────
    if (iconConstants && settings.appIconsEnabled) {
        const iconFns = [
            "getOfficialAlternateIcons",
            "getLimitedAlternateIcons",
            "getIcons",
        ] as const;
        for (const fn of iconFns) {
            if (iconConstants[fn]) {
                allPatches.push(
                    after(fn, iconConstants, (_, ret) =>
                        (ret as any[]).map(icon => ({
                            ...ensureIconName(icon),
                            isPremium: false,
                        })),
                    ),
                );
            }
        }
        for (const fn of ["getIconById", "getDefaultIcon"] as const) {
            if (iconConstants[fn]) {
                allPatches.push(
                    after(fn, iconConstants, (_, ret) => {
                        if (ret) { ensureIconName(ret); ret.isPremium = false; }
                        return ret;
                    }),
                );
            }
        }
    }

    // ── 5. Nitro Themes ────────────────────────────────────────────────────
    if (canUseThemes?.canUseClientThemes && settings.nitroThemesEnabled) {
        allPatches.push(
            instead("canUseClientThemes", canUseThemes, () => true),
        );
    }

    // ── 6. Remove "Get Nitro" Button ───────────────────────────────────────
    if (LazyActionSheet && settings.removeNitroBtnEnabled) {
        const subPatches: Array<() => void> = [];

        function patchSheet(res: any): () => void {
            return after("type", res, (_: any, component: any) => {
                const isNitroBtn = (c: any) =>
                    (typeof c?.props?.text === "string" &&
                        c.props.text.toLowerCase().includes("nitro")) ||
                    (typeof c?.props?.children === "string" &&
                        c.props.children.toLowerCase().includes("nitro"));

                function pruneNitro(arr: any[]) {
                    for (let i = arr.length - 1; i >= 0; i--) {
                        if (isNitroBtn(arr[i])) arr.splice(i, 1);
                    }
                }

                if (Array.isArray(component?.props?.children)) {
                    pruneNitro(component.props.children);
                }
                if (Array.isArray(component)) {
                    pruneNitro(component);
                }
            });
        }

        const unpatchLazy = before(
            "openLazy",
            LazyActionSheet,
            ([lazySheet, name]: [Promise<any>, string]) => {
                if (!["MessageEmojiActionSheet", "MessageCustomEmojiActionSheet"].includes(name))
                    return;
                unpatchLazy();
                lazySheet.then((module: any) => {
                    subPatches.push(
                        after("default", module, (_: any, res: any) => {
                            subPatches.push(patchSheet(res));
                        }),
                    );
                });
            },
        );

        allPatches.push(() => {
            unpatchLazy();
            subPatches.forEach(p => p?.());
        });
    }
}

// ─── Settings UI ─────────────────────────────────────────────────────────────
const { TableSwitchRow, TableRadioGroup, TableRadioRow, TableRowGroup } =
    findByProps("TableRow") ?? {};
const { Stack } = findByProps("Stack") ?? {};

const EMOJI_SIZES: Record<string, number> = {
    Tiny:  16,
    Small: 32,
    Medium: 48,
    Large:  64,
    Huge:   96,
    Jumbo: 128,
};

const PREVIEW_URI =
    "https://cdn.discordapp.com/emojis/926602689213767680.webp";

function SettingsScreen() {
    const [cfg, update] = useSettings();

    // Shiggy guard: se os componentes de UI não existirem ainda, mostra fallback
    if (!TableSwitchRow || !TableRowGroup || !Stack) {
        return (
            <RN.View style={{ padding: 16 }}>
                <RN.Text style={{ color: "var(--text-normal)" }}>
                    Carregando configurações…
                </RN.Text>
            </RN.View>
        );
    }

    return (
        <ScrollView style={{ flex: 1 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>

                {/* ── Funções ─────────────────────────────────────────── */}
                <TableRowGroup title="Funções">
                    <TableSwitchRow
                        label="Fake Emojis"
                        subLabel="Envia emojis externos como link com clique real"
                        value={cfg.fakeEmojisEnabled}
                        onValueChange={(v: boolean) => update({ fakeEmojisEnabled: v })}
                    />
                    <TableSwitchRow
                        label="Fake Stickers"
                        subLabel="Envia figurinhas de outros servidores como link"
                        value={cfg.fakeStickersEnabled}
                        onValueChange={(v: boolean) => update({ fakeStickersEnabled: v })}
                    />
                    <TableSwitchRow
                        label="App Icons desbloqueados"
                        subLabel="Remove trava premium dos ícones alternativos"
                        value={cfg.appIconsEnabled}
                        onValueChange={(v: boolean) => update({ appIconsEnabled: v })}
                    />
                    <TableSwitchRow
                        label="Temas Nitro"
                        subLabel="Habilita canUseClientThemes"
                        value={cfg.nitroThemesEnabled}
                        onValueChange={(v: boolean) => update({ nitroThemesEnabled: v })}
                    />
                    <TableSwitchRow
                        label="Remover botão 'Obter Nitro'"
                        subLabel="Oculta o botão de compra no menu de emoji"
                        value={cfg.removeNitroBtnEnabled}
                        onValueChange={(v: boolean) => update({ removeNitroBtnEnabled: v })}
                    />
                    <TableSwitchRow
                        label="Ignorar Nitro real"
                        subLabel="Força fake mesmo tendo Nitro ativo"
                        value={cfg.ignoreNitro}
                        onValueChange={(v: boolean) => update({ ignoreNitro: v })}
                    />
                </TableRowGroup>

                {/* ── Links ───────────────────────────────────────────── */}
                <TableRowGroup title="Aparência do link">
                    <TableSwitchRow
                        label="Hyperlink para emojis"
                        subLabel="[nome](url) — sem preview de imagem"
                        value={cfg.hyperLink}
                        onValueChange={(v: boolean) => update({ hyperLink: v })}
                    />
                    <TableSwitchRow
                        label="Hyperlink para stickers"
                        subLabel="[nome](url) — sem preview de imagem"
                        value={cfg.stickerHyperLink}
                        onValueChange={(v: boolean) => update({ stickerHyperLink: v })}
                    />
                </TableRowGroup>

                {/* ── Tamanho ─────────────────────────────────────────── */}
                <TableRadioGroup
                    title="Tamanho do emoji"
                    defaultValue={String(cfg.emojiSize)}
                    onChange={(v: string) => update({ emojiSize: parseInt(v, 10) })}
                >
                    {Object.entries(EMOJI_SIZES).map(([label, size]) => (
                        <TableRadioRow
                            key={String(size)}
                            label={label}
                            subLabel={`${size}px`}
                            value={String(size)}
                        />
                    ))}
                </TableRadioGroup>

                {/* ── Preview ─────────────────────────────────────────── */}
                <TableRowGroup title="Preview">
                    <RN.Image
                        source={{
                            uri: `${PREVIEW_URI}?size=${cfg.emojiSize}`,
                            width: cfg.emojiSize,
                            height: cfg.emojiSize,
                        }}
                        style={{ margin: 12 }}
                    />
                </TableRowGroup>

            </Stack>
        </ScrollView>
    );
}

// ─── Plugin Entry ─────────────────────────────────────────────────────────────
export default definePlugin({
    name: "FakeNitro",
    description:
        "Emoji, stickers, ícones e temas Nitro — sem precisar de Nitro. Clique real no popout do servidor.",
    id: "fakenitro-shiggycord",
    version: "1.0.0",

    start() {
        applyPatches();
    },

    stop() {
        allPatches.forEach(unpatch => unpatch?.());
        allPatches.length = 0;
    },

    settings: SettingsScreen,
});
