import { theme } from './theme';

// Component-level check for WCAG AA contrast (Req 7.3). Full WCAG validation
// still requires manual testing with assistive technologies and expert review;
// this guards the core foreground/background token pairings automatically.

/** Relative luminance per WCAG 2.x from an #rrggbb hex string. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  const int = parseInt(m[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe('theme WCAG AA contrast (Req 7.3)', () => {
  const base = theme.colors.surface.base as string;
  const raised = theme.colors.surface.raised as string;
  const fg = '#f8fafc'; // global text color set in theme styles

  it('primary text meets AA on the base and raised surfaces', () => {
    expect(contrastRatio(fg, base)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(fg, raised)).toBeGreaterThanOrEqual(AA);
  });

  it('status colors are legible against the base surface', () => {
    const status = theme.colors.status as Record<string, string>;
    // green/amber/red status text on dark base should clear AA
    expect(contrastRatio(status.connected, base)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(status.offline, base)).toBeGreaterThanOrEqual(AA);
  });
});
