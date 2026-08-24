import fc from 'fast-check';
import { loadSettings, saveSettings, type SettingsStorage } from './settings';
import type { AppSettings } from '../types';

/** In-memory storage stub implementing the SettingsStorage interface. */
function memoryStorage(): SettingsStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

// Feature: realtime-garment-counter-ipad, Property 14: Settings and category-
// list persistence round-trip — For any valid Jetson URL, EC2 URL, and known-
// category list, saving them and then loading returns the same URLs and the
// same category list.
// Validates: Requirements 2.5, 11.4, 12.4
describe('Property 14: Settings and category-list persistence round-trip', () => {
  const settingsArb: fc.Arbitrary<AppSettings> = fc.record({
    jetsonUrl: fc.webUrl(),
    ec2Url: fc.webUrl(),
    audioMuted: fc.boolean(),
    knownCategories: fc.uniqueArray(fc.string({ maxLength: 16 }), { maxLength: 10 }),
    operatorName: fc.string({ maxLength: 30 }),
  });

  it('save then load returns identical settings', () => {
    fc.assert(
      fc.property(settingsArb, (settings) => {
        const storage = memoryStorage();
        saveSettings(settings, storage);
        const loaded = loadSettings(storage);

        expect(loaded.jetsonUrl).toBe(settings.jetsonUrl);
        expect(loaded.ec2Url).toBe(settings.ec2Url);
        expect(loaded.audioMuted).toBe(settings.audioMuted);
        expect(loaded.knownCategories).toEqual(settings.knownCategories);
        expect(loaded.operatorName).toBe(settings.operatorName);
      }),
      { numRuns: 100 },
    );
  });

  it('last write wins across repeated saves', () => {
    fc.assert(
      fc.property(settingsArb, settingsArb, (first, second) => {
        const storage = memoryStorage();
        saveSettings(first, storage);
        saveSettings(second, storage);
        const loaded = loadSettings(storage);
        expect(loaded.jetsonUrl).toBe(second.jetsonUrl);
        expect(loaded.ec2Url).toBe(second.ec2Url);
        expect(loaded.knownCategories).toEqual(second.knownCategories);
      }),
      { numRuns: 100 },
    );
  });
});
