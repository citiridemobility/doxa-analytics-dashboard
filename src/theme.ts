export type ThemeMode = 'light' | 'dark';

/** Doxa app palette — charts stay in orange + neutral tones only. */
export const LIGHT = {
  bg: {
    primary: '#F8FAFC',
    secondary: '#FFFFFF',
    tertiary: '#EEF2F6',
    elevated: '#FFFFFF',
    dark1: '#F3F6FA',
  },
  text: {
    primary: '#111827',
    secondary: '#475569',
    tertiary: '#7C8794',
    muted: '#64748B',
  },
  accent: {
    primary: '#E98A07',
    dark: '#B85F00',
    light: '#FFE3A3',
  },
  status: {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  border: {
    primary: '#D8E0EA',
    secondary: '#E7ECF2',
  },
  chart: {
    primary: '#E98A07',
    secondary: '#B85F00',
    tertiary: '#F59E0B',
    muted: '#94A3B8',
    soft: '#CBD5E1',
    faint: '#E2E8F0',
    highlight: '#FFE3A3',
    series: ['#E98A07', '#B85F00', '#F59E0B', '#94A3B8', '#64748B', '#CBD5E1', '#FFE3A3'],
  },
};

export const DARK = {
  bg: {
    primary: '#000000',
    secondary: '#1a1a1a',
    tertiary: '#2a2a2a',
    elevated: '#0F0F0F',
    dark1: '#050505',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#CCCCCC',
    tertiary: '#999999',
    muted: '#6F6F6F',
  },
  accent: {
    primary: '#F59E0B',
    dark: '#D97706',
    light: '#FCD34D',
  },
  status: {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  border: {
    primary: '#333333',
    secondary: '#222222',
  },
  chart: {
    primary: '#F59E0B',
    secondary: '#D97706',
    tertiary: '#FCD34D',
    muted: '#999999',
    soft: '#6F6F6F',
    faint: '#333333',
    highlight: '#FBBF24',
    series: ['#F59E0B', '#D97706', '#FCD34D', '#CCCCCC', '#999999', '#6F6F6F', '#333333'],
  },
};

export type Palette = typeof LIGHT;

export const getPalette = (mode: ThemeMode): Palette => (mode === 'dark' ? DARK : LIGHT);

export const FONT_FAMILY = 'Poppins, system-ui, sans-serif';
