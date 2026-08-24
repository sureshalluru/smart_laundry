import type { AppSettings } from '../types';

const STORAGE_KEY = 'garment-counter:settings';

/** Default settings used when nothing is persisted yet. */
export const DEFAULT_SETTINGS: AppSettings = {
  jetsonUrl: '',
  ec2Url: '',
  audioMuted: false,
  knownCategories: [],
  operatorName: '',
};

/** Storage abstraction so the module is testable without a real localStorage. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SettingsStorage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // access to localStorage can throw (privacy mode) — treat as unavailable
  }
  return null;
}

/** Coerce an unknown parsed value into a well-formed AppSettings. */
function coerce(raw: unknown): AppSettings {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const r = raw as Partial<Record<keyof AppSettings, unknown>>;
  return {
    jetsonUrl: typeof r.jetsonUrl === 'string' ? r.jetsonUrl : DEFAULT_SETTINGS.jetsonUrl,
    ec2Url: typeof r.ec2Url === 'string' ? r.ec2Url : DEFAULT_SETTINGS.ec2Url,
    audioMuted:
      typeof r.audioMuted === 'boolean' ? r.audioMuted : DEFAULT_SETTINGS.audioMuted,
    knownCategories: Array.isArray(r.knownCategories)
      ? r.knownCategories.filter((c): c is string => typeof c === 'string')
      : [...DEFAULT_SETTINGS.knownCategories],
    operatorName:
      typeof r.operatorName === 'string' ? r.operatorName : DEFAULT_SETTINGS.operatorName,
  };
}

/**
 * Persist settings to storage. Silently no-ops if storage is unavailable.
 *
 * @remarks Requirements 2.5, 11.4, 12.4.
 */
export function saveSettings(
  settings: AppSettings,
  storage: SettingsStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota or serialization failure — non-fatal for a kiosk
  }
}

/**
 * Load settings from storage, merging over defaults. Returns defaults when
 * nothing is stored or the stored value is malformed.
 *
 * @remarks Requirements 2.5, 11.4, 12.4.
 */
export function loadSettings(
  storage: SettingsStorage | null = defaultStorage(),
): AppSettings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_SETTINGS };
    return coerce(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
