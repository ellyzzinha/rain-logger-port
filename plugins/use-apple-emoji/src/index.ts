/**
 * Use Apple Emoji
 *
 * Estratégia: patchear os componentes de renderização de emoji diretamente,
 * sem manipular as content rows. Assim:
 *  - Emojis jumbo continuam grandes no chat
 *  - Reações são substituídas
 *  - O seletor de emojis é substituído
 *  - O surrogate original é preservado (copy-paste funciona normal)
 *
 * Imagens Apple servidas pelo jsDelivr via iamcal/emoji-datasource-apple.
 * Padrão de URL:
 *   https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/<codepoints>.png
 *
 * Exemplos:
 *   😀  → 1f600.png
 *   🇧🇷 → 1f1e7-1f1f7.png
 *   👍🏽 → 1f44d-1f3fd.png
 */

import { patcher, findByProps, React } from "$/types";

// ─── CDN ────────────────────────────────────────────────────────────────────

const CDN =
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/";

/**
 * Converte um surrogate string Unicode no caminho de arquivo usado pelo iamcal.
 * Remove o variation selector U+FE0F pois a biblioteca não o inclui nos nomes.
 *
 * "😀"   → "1f600.png"
 * "👍🏽" → "1f44d-1f3fd.png"
 * "🇧🇷" → "1f1e7-1f1f7.png"
 */
function toPath(surrogate: string): string | null {
  if (!surrogate) return null;

  const pts: string[] = [];
  for (let i = 0; i < surrogate.length; ) {
    const cp = surrogate.codePointAt(i);
    if (cp === undefined) break;
    if (cp !== 0xfe0f) pts.push(cp.toString(16)); // strip variation selector
    i += cp > 0xffff ? 2 : 1;
  }

  return pts.length ? pts.join("-") + ".png" : null;
}

function appleURL(surrogate: string): string | null {
  const p = toPath(surrogate);
  return p ? CDN + p : null;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

/**
 * Cria um elemento <Image> do React Native com a imagem Apple do emoji.
 * Retorna null se a URL não puder ser resolvida ou se o módulo RN não estiver
 * disponível, permitindo fallback silencioso para o original.
 */
function appleImg(surrogate: string, size: number): React.ReactElement | null {
  const url = appleURL(surrogate);
  if (!url) return null;

  // Tenta encontrar Image pelo módulo react-native exposto pelo Discord/Revenge.
  // Várias variações de nome são tentadas para máxima compatibilidade.
  const RN =
    findByProps("Image", "View") ??
    findByProps("Image") ??
    (typeof global !== "undefined" && (global as any).ReactNative) ??
    null;

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

// ─── Patches ─────────────────────────────────────────────────────────────────

const unpatchers: (() => void)[] = [];

/**
 * Wrapper seguro: tenta patcher.instead num módulo+chave.
 * Silencia erros caso o módulo não exista nesta versão do Discord.
 */
function tryPatch(
  mod: Record<string, any> | null | undefined,
  key: string,
  handler: (args: any[], orig: (...a: any[]) => any) => any
) {
  if (!mod || typeof mod[key] !== "function") return;
  try {
    unpatchers.push(patcher.instead(mod, key, handler));
  } catch {
    // módulo existe mas patch falhou — ignora silenciosamente
  }
}

function init() {
  // ── 1. NativeEmoji / EmojiComponent ────────────────────────────────────
  // Props: { emoji: { surrogates: string }, emojiSize?: number }
  // É o componente base — cobre chat e a maioria dos contextos.
  const emojiMod =
    findByProps("NativeEmoji") ??
    findByProps("EmojiComponent") ??
    findByProps("renderNativeEmoji");

  if (emojiMod) {
    const key =
      "NativeEmoji" in emojiMod
        ? "NativeEmoji"
        : "EmojiComponent" in emojiMod
        ? "EmojiComponent"
        : "renderNativeEmoji";

    tryPatch(emojiMod, key, ([props], orig) => {
      const surrogates: string | undefined =
        props?.emoji?.surrogates ?? props?.surrogates;
      if (!surrogates) return orig(props);

      const size: number = props?.emojiSize ?? props?.size ?? 24;
      return appleImg(surrogates, size) ?? orig(props);
    });
  }

  // ── 2. Emoji node (mensagens) ────────────────────────────────────────────
  // Props: { node: { surrogate: string, jumboable?: boolean } }
  // Responsável pela renderização inline nas mensagens.
  // O `jumboable` indica que o emoji deve ser grande (~48 px).
  const nodeMod =
    findByProps("renderEmoji") ??
    findByProps("Emoji", "EmojiText") ??
    findByProps("Emoji");

  if (nodeMod) {
    const key = Object.keys(nodeMod).find(
      (k) =>
        typeof nodeMod[k] === "function" &&
        /^(emoji|Emoji|renderEmoji)/i.test(k)
    );

    if (key) {
      tryPatch(nodeMod, key, ([props], orig) => {
        const surrogates: string | undefined =
          props?.node?.surrogate ??
          props?.surrogates ??
          props?.emoji?.surrogates;
        if (!surrogates) return orig(props);

        const jumbo: boolean =
          props?.node?.jumboable ?? props?.jumboable ?? false;
        // Discord usa ~40-48 px para jumbo, ~22 px para inline
        const size = jumbo ? 48 : 22;

        return appleImg(surrogates, size) ?? orig(props);
      });
    }
  }

  // ── 3. Reações ───────────────────────────────────────────────────────────
  // Props: { emoji: { surrogates: string }, emojiSize?: number }
  const reactionMod =
    findByProps("EmojiReaction") ??
    findByProps("ReactionEmoji") ??
    findByProps("MessageReaction");

  if (reactionMod) {
    const key = Object.keys(reactionMod).find((k) =>
      /reaction|emoji/i.test(k)
    );

    if (key) {
      tryPatch(reactionMod, key, ([props], orig) => {
        const surrogates: string | undefined = props?.emoji?.surrogates;
        if (!surrogates) return orig(props);

        const size: number = props?.emojiSize ?? 20;
        return appleImg(surrogates, size) ?? orig(props);
      });
    }
  }

  // ── 4. Picker (seletor de emojis) ────────────────────────────────────────
  // O picker renderiza cada emoji numa grid. O componente de célula recebe
  // { emoji: { surrogates } }. Tentamos substituir só o conteúdo visual,
  // preservando os tap handlers clonando o elemento original.
  const pickerMod =
    findByProps("EmojiPickerCell") ??
    findByProps("EmojiPickerListRow") ??
    findByProps("emojiPickerCell");

  if (pickerMod) {
    const key = Object.keys(pickerMod).find((k) =>
      /cell|item|emoji/i.test(k)
    );

    if (key && typeof pickerMod[key] === "function") {
      tryPatch(pickerMod, key, ([props], orig) => {
        const surrogates: string | undefined = props?.emoji?.surrogates;
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

// ─── Entry point ──────────────────────────────────────────────────────────────

init();

export const onUnload = () => {
  for (const up of unpatchers) up();
  unpatchers.length = 0;
};
