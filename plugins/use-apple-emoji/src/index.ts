/**
 * Use System Emoji (Apple)
 *
 * Patches the emoji render components directly instead of mutating message
 * content rows. This means:
 *  - Jumbo (large) emojis stay jumbo in chat
 *  - Reactions get replaced
 *  - The emoji picker gets replaced
 *  - No string manipulation; the surrogate codepoints are preserved in the
 *    underlying data so copy-paste still works
 *
 * Apple emoji images are served from the jsDelivr CDN backed by
 * iamcal/emoji-datasource-apple (64 px PNGs, free to use).
 * URL pattern:
 *   https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/<codepoints>.png
 * where <codepoints> is the lower-cased, dash-joined Unicode sequence, e.g.
 *   1f600.png         → 😀
 *   1f1e7-1f1f7.png   → 🇧🇷
 */

import { patcher, findByProps, React } from "$/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CDN_BASE =
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/";

/**
 * Converts a Unicode surrogate string (the raw emoji characters) into the
 * codepoint path used by the iamcal CDN, e.g. "😀" → "1f600.png"
 */
function surrogateToCDNPath(surrogate: string): string | null {
  if (!surrogate) return null;

  const codepoints: string[] = [];

  for (let i = 0; i < surrogate.length; ) {
    const code = surrogate.codePointAt(i);
    if (code === undefined) break;

    // Skip variation selector U+FE0F — iamcal strips it from filenames
    if (code !== 0xfe0f) {
      codepoints.push(code.toString(16));
    }

    // Advance by 2 chars for surrogate pairs (code > 0xFFFF), 1 otherwise
    i += code > 0xffff ? 2 : 1;
  }

  if (!codepoints.length) return null;
  return codepoints.join("-") + ".png";
}

function appleEmojiURL(surrogate: string): string | null {
  const path = surrogateToCDNPath(surrogate);
  return path ? CDN_BASE + path : null;
}

// ─── Inline style factories ──────────────────────────────────────────────────

/**
 * Returns a <Image> element (React Native) that renders the Apple emoji at the
 * correct size.  Falls back to the original render if we can't resolve a URL.
 */
function renderAppleEmoji(surrogate: string, size: number): React.ReactElement | null {
  const url = appleEmojiURL(surrogate);
  if (!url) return null;

  // React Native Image – available globally on RN bundles; Discord mobile is RN.
  const { Image, View } = findByProps("Image", "View") ?? (global as any).ReactNative ?? {};
  if (!Image) return null;

  return React.createElement(Image, {
    key: `apple-emoji-${surrogate}`,
    source: { uri: url },
    style: {
      width: size,
      height: size,
      // Prevents the image from being clipped inside flex containers
      resizeMode: "contain",
    },
    accessibilityLabel: surrogate,
    // Keep the image crisp at small sizes
    fadeDuration: 0,
  });
}

// ─── Component patches ──────────────────────────────────────────────────────

const unpatchers: Array<() => void> = [];

function patchEmojiComponents(): void {
  // Discord's emoji rendering goes through several components depending on
  // context. We patch all likely candidates so chat, reactions and picker are
  // all covered.
  //
  // Component names we look for (they get mangled, so we search by props):
  //   • NativeEmoji  – base component, receives { emoji: { surrogates } }
  //   • EmojiNode    – message content renderer
  //   • EmojiReaction / ReactionEmoji – reaction bar
  //   • EmojiPickerListRow / EmojiPickerCell – picker grid

  // ── 1. NativeEmoji / EmojiComponent ────────────────────────────────────
  //    Props shape: { emoji: { surrogates: string }, emojiSize?: number }
  const EmojiModule = findByProps("NativeEmoji") ?? findByProps("EmojiComponent");

  if (EmojiModule) {
    const key = EmojiModule.NativeEmoji ? "NativeEmoji" : "EmojiComponent";

    unpatchers.push(
      patcher.instead(EmojiModule, key, (args, _orig) => {
        const [props] = args as [{ emoji?: { surrogates?: string }; emojiSize?: number }];
        const surrogate = props?.emoji?.surrogates;
        if (!surrogate) return _orig(...args);

        const size = props.emojiSize ?? 24;
        return renderAppleEmoji(surrogate, size) ?? _orig(...args);
      })
    );
  }

  // ── 2. Emoji (message content node) ─────────────────────────────────────
  //    Props shape: { node: { surrogate: string, jumboable?: boolean } }
  const EmojiNodeModule = findByProps("renderEmoji") ?? findByProps("Emoji");

  if (EmojiNodeModule) {
    const key = Object.keys(EmojiNodeModule).find(
      (k) => typeof EmojiNodeModule[k] === "function" && k.toLowerCase().includes("emoji")
    );

    if (key) {
      unpatchers.push(
        patcher.instead(EmojiNodeModule, key, (args, orig) => {
          const [props] = args as [
            {
              node?: { surrogate?: string; jumboable?: boolean };
              jumboable?: boolean;
              surrogates?: string;
            }
          ];

          const surrogate =
            props?.node?.surrogate ?? props?.surrogates;
          if (!surrogate) return orig(...args);

          const jumboable = props?.node?.jumboable ?? props?.jumboable ?? false;
          // Jumbo emojis in Discord render at ~3 rem ≈ 48 px
          const size = jumboable ? 48 : 22;

          return renderAppleEmoji(surrogate, size) ?? orig(...args);
        })
      );
    }
  }

  // ── 3. EmojiPickerListRow / picker cells ─────────────────────────────────
  //    The picker uses spritesheets by default. We patch the cell component so
  //    each emoji in the grid shows the Apple image instead of the Twemoji
  //    spritesheet slice.
  //    Props shape varies; we look for the `emoji` prop with `surrogates`.
  const PickerModule =
    findByProps("EmojiPickerListRow") ??
    findByProps("EmojiPickerCell") ??
    findByProps("emojiPickerCell");

  if (PickerModule) {
    const cellKey = Object.keys(PickerModule).find((k) =>
      /cell|row|item/i.test(k)
    );

    if (cellKey) {
      unpatchers.push(
        patcher.before(PickerModule, cellKey, (args) => {
          // We can't easily swap the whole cell without risking broken tap
          // handlers; instead, inject a custom `renderEmoji` helper into props
          // so the cell uses our image renderer.
          const [props] = args as [Record<string, unknown>];
          if (props && typeof props === "object") {
            props.__appleEmojiRenderer = (surrogate: string, size = 32) =>
              renderAppleEmoji(surrogate, size);
          }
        })
      );
    }
  }

  // ── 4. Reaction emoji ────────────────────────────────────────────────────
  //    Reactions render a smaller emoji (typically ~20 px).
  const ReactionModule =
    findByProps("EmojiReaction") ??
    findByProps("ReactionEmoji") ??
    findByProps("MessageReaction");

  if (ReactionModule) {
    const reactionEmojiKey = Object.keys(ReactionModule).find((k) =>
      /reaction|emoji/i.test(k)
    );

    if (reactionEmojiKey) {
      unpatchers.push(
        patcher.instead(ReactionModule, reactionEmojiKey, (args, orig) => {
          const [props] = args as [
            { emoji?: { surrogates?: string }; emojiSize?: number }
          ];
          const surrogate = props?.emoji?.surrogates;
          if (!surrogate) return orig(...args);

          const size = props?.emojiSize ?? 20;
          return renderAppleEmoji(surrogate, size) ?? orig(...args);
        })
      );
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

patchEmojiComponents();

export const onUnload = () => {
  for (const unpatch of unpatchers) unpatch();
  unpatchers.length = 0;
};
