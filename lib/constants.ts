export const COLORS = {
  forest: '#0a2f1c',
  bronze: '#A6833C',
  cream: '#F5F1E8',
  charcoal: '#1a1a1a',
  greyLight: '#e5e5e5',
} as const;

export const FONTS = {
  primary: 'var(--font-montserrat)',
} as const;

export const DESIGN_SYSTEM = {
  colors: COLORS,
  fonts: FONTS,
  minTouchTarget: '48px',
  borderRadius: '12px',
} as const;
