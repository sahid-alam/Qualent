import { converter, displayable, formatHex, parse, wcagContrast } from "culori";

const INK = "#1a0f0a";
const WHITE = "#ffffff";
const toOklch = converter("oklch");
const MAX_LOGO_BYTES = 200_000;

export type Brand = {
  name?: string;
  logo?: string;
  brand?: string;
  solidFrom?: string;
  solidTo?: string;
  onSolid?: string;
  textDark?: string;
  textLight?: string;
  adjusted?: boolean;
};

function mapped(l: number, c: number, h: number) {
  const lightness = Math.min(Math.max(l, 0), 1);
  let chroma = c;
  // Reduce chroma until the color fits in sRGB, keeping its hue and lightness.
  while (chroma > 0 && !displayable({ mode: "oklch", l: lightness, c: chroma, h })) chroma -= 0.005;
  return formatHex({ mode: "oklch", l: lightness, c: Math.max(chroma, 0), h }) as string;
}

/**
 * Contrast cannot be guaranteed in CSS alone (DESIGN_SYSTEM.md section 9), so this
 * runs once, when a client's color is saved, and the result is stored.
 */
export function resolveBrand(hex: string): Brand {
  const parsed = parse(hex);
  if (!parsed) throw new Error("Not a color");
  const { l, c = 0, h = 0 } = toOklch(parsed);
  const stops = (L: number) => [mapped(L + 0.04, Math.min(c, 0.2), h), mapped(L - 0.06, Math.min(c, 0.2), h)] as const;
  const worst = (fg: string, [a, b]: readonly [string, string]) => Math.min(wcagContrast(fg, a), wcagContrast(fg, b));

  const first = stops(l);
  const onSolid = worst(WHITE, first) >= worst(INK, first) ? WHITE : INK;
  let solid = first;
  let adjusted = false;
  for (let shift = 0.02; worst(onSolid, solid) < 4.5 && shift <= 0.6; shift += 0.02) {
    solid = stops(onSolid === WHITE ? l - shift : l + shift); // Push the fill away from its label.
    adjusted = true;
  }
  return {
    brand: formatHex(parsed),
    solidFrom: solid[0],
    solidTo: solid[1],
    onSolid,
    textDark: mapped(0.79, Math.min(c, 0.14), h),
    textLight: mapped(0.48, Math.min(c, 0.16), h),
    adjusted,
  };
}

/** Accepts PNG or WebP only, checked by content and not by the name it claims. */
export function logoDataUrl(bytes: Uint8Array) {
  if (bytes.length > MAX_LOGO_BYTES) throw new Error("Logo must be under 200 KB");
  const head = Buffer.from(bytes.subarray(0, 12));
  const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP";
  if (!isPng && !isWebp) throw new Error("Logo must be a PNG or WebP file");
  return `data:image/${isPng ? "png" : "webp"};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Inline on a wrapper with data-theme, because these values resolve per element. */
export function brandStyle(brand: Brand): Record<string, string> {
  if (!brand.solidFrom) return {};
  return {
    "--brand": brand.brand!,
    "--brand-solid-from": brand.solidFrom,
    "--brand-solid-to": brand.solidTo!,
    "--brand-on-solid": brand.onSolid!,
    "--brand-text-dark": brand.textDark!,
    "--brand-text-light": brand.textLight!,
    "--brand-soft": "color-mix(in oklab, var(--brand) 13%, transparent)",
    "--brand-line": "color-mix(in oklab, var(--brand) 30%, transparent)",
    "--gradient-accent": "linear-gradient(135deg, var(--brand-solid-from), var(--brand-solid-to))",
  };
}
