// Colors are packed 0xRRGGBB integers everywhere in the art code.

export const hex = (s) => parseInt(s.replace('#', ''), 16);
export const rgb = (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
export const R = (c) => (c >> 16) & 255;
export const G = (c) => (c >> 8) & 255;
export const B = (c) => c & 255;
export const toHex = (c) => '#' + c.toString(16).padStart(6, '0');

export function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return rgb(
    Math.round(R(a) + (R(b) - R(a)) * t),
    Math.round(G(a) + (G(b) - G(a)) * t),
    Math.round(B(a) + (B(b) - B(a)) * t),
  );
}

export const scale = (c, k) => rgb(
  Math.min(255, Math.round(R(c) * k)), Math.min(255, Math.round(G(c) * k)), Math.min(255, Math.round(B(c) * k)));

export function toHSL(c) {
  const r = R(c) / 255, g = G(c) / 255, b = B(c) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

export function fromHSL(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return rgb(f(0), f(8), f(4));
}

/**
 * Pixel-art shading ramp from one base color: shadows drift toward blue/purple,
 * highlights toward warm yellow (hue shifting), like hand-picked palettes.
 */
export function ramp(base) {
  const [h, s, l] = toHSL(base);
  const shiftToward = (target, amt) => {
    let d = target - h;
    if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
    return h + d * amt;
  };
  return {
    dark: fromHSL(shiftToward(0.7, 0.18), Math.min(1, s * 0.85), l * 0.42),
    shade: fromHSL(shiftToward(0.7, 0.1), Math.min(1, s * 0.95), l * 0.7),
    base,
    light: fromHSL(shiftToward(0.15, 0.08), Math.min(1, s * 0.95), Math.min(0.92, l + (1 - l) * 0.35)),
    hi: fromHSL(shiftToward(0.15, 0.14), Math.min(1, s * 0.7), Math.min(0.96, l + (1 - l) * 0.65)),
  };
}
