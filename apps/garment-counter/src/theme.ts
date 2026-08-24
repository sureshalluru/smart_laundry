import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

// High-contrast palette tuned for glanceable, wall-mounted use.
// Foreground/background pairings below target WCAG AA (>= 4.5:1) — validated
// by an automated contrast check in the component tests (Req 7.3).
const colors = {
  surface: {
    base: '#0f172a', // slate-900 background
    raised: '#1e293b', // slate-800 cards
    border: '#334155', // slate-700
  },
  // status colors chosen for AA contrast against surface.base
  status: {
    connected: '#22c55e', // green-500
    disconnected: '#ef4444', // red-500 (Camera)
    offline: '#f59e0b', // amber-500 (Cloud) — distinct from disconnected
    warning: '#f59e0b',
    alert: '#dc2626', // red-600 full-screen discrepancy
  },
};

// Large, glanceable typography. Count numbers must be >= 48px (Req 1.4);
// `count` token below is well above that for 3-4 ft legibility.
const fontSizes = {
  count: '5rem', // 80px — primary category count
  countSm: '3rem', // 48px — minimum legible count size
  modeIndicator: '2rem',
};

// Minimum 44x44pt touch targets (Req 7.2) baked into interactive defaults.
const components = {
  Button: {
    baseStyle: {
      minH: '44px',
      minW: '44px',
      fontWeight: 'bold',
    },
    defaultProps: {
      size: 'lg',
    },
  },
};

export const theme = extendTheme({
  config,
  colors,
  fontSizes,
  components,
  styles: {
    global: {
      'html, body, #root': {
        height: '100%',
        margin: 0,
        backgroundColor: colors.surface.base,
        color: '#f8fafc', // slate-50, AA contrast on surface.base
        // discourage text selection / long-press callouts on kiosk
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        overscrollBehavior: 'none',
      },
    },
  },
});
