import { create } from 'zustand';
import type {
  AppSettings,
  CategoryComparison,
  CategoryTally,
  ConnectionStatus,
  CountingSession,
  DetectionEvent,
  WashMode,
} from '../types';
import { EC2Service } from '../services/ec2Service';
import { JetsonService, TransactionConflictError } from '../services/jetsonService';
import { AudioService } from '../services/audioService';
import { PollingService } from '../services/pollingService';
import { aggregateTallies, deriveCategories } from '../lib/tally';
import { applyCorrection } from '../lib/correction';
import { buildComparisons, allDiscrepanciesResolved } from '../lib/discrepancy';
import { nextEc2State, nextJetsonState } from '../lib/connectionState';
import { loadSettings, saveSettings } from '../lib/settings';
import { tagWithSessionMode } from './sessionTagging';

const INITIAL_CONNECTION: ConnectionStatus = {
  jetson: 'unknown',
  ec2: 'unknown',
  jetsonFailCount: 0,
  ec2FailCount: 0,
};

/** Snapshot shown after a session ends. */
export interface SessionSummary {
  transId: string;
  mode: WashMode;
  operatorName: string;
  total: number;
  perCategory: Array<{ category: string; count: number }>;
  /** Present only for After Wash: any category whose after ≠ before. */
  discrepancies: CategoryComparison[];
  hasMismatch: boolean;
}

export interface GarmentCounterState {
  // --- Settings ---
  settings: AppSettings;
  setJetsonUrl(url: string): void;
  setEc2Url(url: string): void;
  setKnownCategories(categories: string[]): void;
  setOperatorName(name: string): void;

  // --- Session ---
  session: CountingSession | null;
  startError: string | null;
  startSession(params: {
    transId: string;
    mode: WashMode;
    operatorName: string;
  }): Promise<boolean>;
  endSession(): Promise<void>;

  // --- Detections / tallies ---
  items: DetectionEvent[];
  tallies: Map<string, CategoryTally>;
  beforeWashTallies: Map<string, CategoryTally> | null;
  activeCategories: string[];
  addDetection(event: DetectionEvent): void;
  correctCategory(clothId: number, newCategory: string): Promise<void>;
  /** Load the Before Wash session's items (by its uniq_id) for comparison. */
  loadBeforeWashTallies(beforeWashUniqId: string): Promise<void>;

  // --- Pause ---
  // When paused, new detections are buffered (not applied to the visible
  // tallies) so the employee can review/correct. Polling keeps running so no
  // detection is missed; buffered items flush in on resume.
  paused: boolean;
  pendingItems: DetectionEvent[];
  togglePause(): void;

  // --- Post-session summary ---
  // Snapshot of the just-ended session, shown before returning to the start
  // screen. Cleared when dismissed.
  lastSummary: SessionSummary | null;
  clearSummary(): void;

  // --- Discrepancy ---
  discrepancies: CategoryComparison[];
  resolvedCategories: Set<string>;
  computeDiscrepancies(): void;
  moveCloth(clothId: number, targetCategory: string): Promise<void>;
  alertDismissed: boolean;
  // Mid-session, only over-counts (after > before) warn — undercounts are
  // expected because folding happens out of intake order. The full mismatch
  // alert fires only once the employee finalizes the count.
  finalized: boolean;
  finalizeCount(): void;

  // --- Connection ---
  connection: ConnectionStatus;
  updateJetsonStatus(reachable: boolean): void;
  updateEC2Status(reachable: boolean): void;

  // --- Audio ---
  toggleMute(): void;
}

/** Dependencies injectable for testing; default to real services at runtime. */
export interface StoreDeps {
  makeEc2: (baseUrl: string) => Pick<
    EC2Service,
    | 'getLatestCloth'
    | 'correctCloth'
    | 'moveCloth'
    | 'getTransactionItems'
    | 'getBeforeWashItems'
    | 'checkBeforeWash'
  >;
  makeJetson: (baseUrl: string) => Pick<
    JetsonService,
    'startTransaction' | 'stopTransaction'
  >;
  audio: Pick<AudioService, 'playDetectionBeep' | 'playDiscrepancyAlarm' | 'setMuted' | 'isMuted'>;
  makePolling: (
    ec2: Pick<EC2Service, 'getLatestCloth'>,
    callbacks: {
      onDetection: (e: DetectionEvent) => void;
      onError: () => void;
      onConnectionChange: (connected: boolean) => void;
    },
  ) => Pick<PollingService, 'start' | 'stop'>;
}

function defaultDeps(): StoreDeps {
  const audio = new AudioService({ muted: loadSettings().audioMuted });
  return {
    makeEc2: (baseUrl) => new EC2Service({ baseUrl }),
    makeJetson: (baseUrl) => new JetsonService({ baseUrl }),
    audio,
    makePolling: (ec2, callbacks) => new PollingService({ ec2, ...callbacks }),
  };
}

/**
 * Create the garment-counter store. Accepts injected {@link StoreDeps} so the
 * store logic can be unit-tested without real network/audio.
 */
export function createCounterStore(deps: StoreDeps = defaultDeps()) {
  let polling: Pick<PollingService, 'start' | 'stop'> | null = null;

  return create<GarmentCounterState>((set, get) => ({
    settings: loadSettings(),

    setJetsonUrl(url) {
      set((s) => {
        const settings = { ...s.settings, jetsonUrl: url };
        saveSettings(settings);
        return { settings };
      });
    },
    setEc2Url(url) {
      set((s) => {
        const settings = { ...s.settings, ec2Url: url };
        saveSettings(settings);
        return { settings };
      });
    },
    setKnownCategories(categories) {
      set((s) => {
        const settings = { ...s.settings, knownCategories: categories };
        saveSettings(settings);
        return { settings };
      });
    },
    setOperatorName(name) {
      set((s) => {
        const settings = { ...s.settings, operatorName: name };
        saveSettings(settings);
        return { settings };
      });
    },

    session: null,
    startError: null,

    async startSession({ transId, mode, operatorName }) {
      // Guard: require an order id (Req 6.1).
      if (!transId || transId.trim() === '') {
        set({ startError: 'Select or scan an order before starting.' });
        return false;
      }

      const { settings } = get();
      const ec2 = deps.makeEc2(settings.ec2Url);
      const jetson = deps.makeJetson(settings.jetsonUrl);

      // Guard: After Wash requires an existing Before Wash (Req 4.2, 4.3).
      if (mode === 'After Wash') {
        try {
          const { exists } = await ec2.checkBeforeWash(transId);
          if (!exists) {
            set({
              startError: 'Complete the Before Wash count for this order first.',
            });
            return false;
          }
        } catch {
          set({ startError: 'Could not verify Before Wash. Check the cloud connection.' });
          return false;
        }
      }

      const uniqId = crypto.randomUUID();
      const date = new Date().toISOString();

      try {
        await jetson.startTransaction({ transId, type: mode, operatorName, uniqId, date });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        set({
          startError:
            err instanceof TransactionConflictError
              ? err.message
              : `Could not start the transaction on the camera system. Check the Camera URL in Settings (${detail}).`,
        });
        return false;
      }

      // For After Wash, load the Before Wash baseline for the same order so
      // discrepancies can be computed as items arrive (Req 4.6, 5.2).
      let beforeWashTallies: Map<string, CategoryTally> | null = null;
      if (mode === 'After Wash') {
        try {
          const beforeItems = await ec2.getBeforeWashItems(transId);
          beforeWashTallies = aggregateTallies(beforeItems);
        } catch {
          // non-fatal; comparison simply lacks the before column
        }
      }

      const session: CountingSession = {
        transId,
        uniqId,
        mode,
        operatorName,
        startedAt: date,
        isActive: true,
        highestClothId: Number.NEGATIVE_INFINITY,
      };

      const seededTallies = aggregateTallies([], settings.knownCategories);

      set({
        session,
        startError: null,
        items: [],
        tallies: seededTallies,
        beforeWashTallies,
        activeCategories: deriveCategories(settings.knownCategories, []),
        discrepancies: [],
        resolvedCategories: new Set(),
        alertDismissed: false,
        finalized: false,
        paused: false,
        pendingItems: [],
        lastSummary: null,
      });

      // Persist operator name for next time.
      get().setOperatorName(operatorName);

      // Begin polling.
      polling = deps.makePolling(ec2, {
        onDetection: (e) => get().addDetection(e),
        onError: () => get().updateEC2Status(false),
        onConnectionChange: (connected) => get().updateEC2Status(connected),
      });
      polling.start();

      return true;
    },

    async endSession() {
      const { session, settings, tallies, discrepancies } = get();
      polling?.stop();
      polling = null;

      // Snapshot the ended session for the post-session summary screen.
      let lastSummary: SessionSummary | null = null;
      if (session) {
        const perCategory = [...tallies.values()]
          .map((t) => ({ category: t.category, count: t.count }))
          .sort((a, b) => a.category.localeCompare(b.category));
        const mismatchRows = discrepancies.filter((d) => d.difference !== 0);
        lastSummary = {
          transId: session.transId,
          mode: session.mode,
          operatorName: session.operatorName,
          total: [...tallies.values()].reduce((acc, t) => acc + t.count, 0),
          perCategory,
          discrepancies: session.mode === 'After Wash' ? mismatchRows : [],
          hasMismatch: session.mode === 'After Wash' && mismatchRows.length > 0,
        };
        try {
          const jetson = deps.makeJetson(settings.jetsonUrl);
          await jetson.stopTransaction({ uniqId: session.uniqId });
        } catch {
          // best-effort; still tear down the local session
        }
      }
      set({
        session: null,
        paused: false,
        pendingItems: [],
        finalized: false,
        lastSummary,
      });
    },

    items: [],
    tallies: new Map(),
    beforeWashTallies: null,
    activeCategories: [],
    paused: false,
    pendingItems: [],
    lastSummary: null,

    clearSummary() {
      set({ lastSummary: null });
    },

    addDetection(event) {
      const { session } = get();
      if (!session) return;
      // Tag with the session mode as wash type (Req 4.4, 4.5).
      const tagged = tagWithSessionMode(event, session.mode);

      // While paused, hold new detections aside so the visible tallies stay
      // frozen for review/correction. They flush in on resume.
      if (get().paused) {
        set({ pendingItems: [...get().pendingItems, tagged] });
        return;
      }

      const items = [...get().items, tagged];
      const tallies = aggregateTallies(items, get().settings.knownCategories);
      set({
        items,
        tallies,
        activeCategories: deriveCategories(get().settings.knownCategories, items),
      });
      deps.audio.playDetectionBeep();
      // Keep the After Wash comparison current as items arrive (Req 5.1).
      if (get().beforeWashTallies) get().computeDiscrepancies();
    },

    togglePause() {
      const wasPaused = get().paused;
      if (wasPaused) {
        // Resume: flush any buffered detections into the visible state.
        const { pendingItems, settings } = get();
        const items = [...get().items, ...pendingItems];
        const tallies = aggregateTallies(items, settings.knownCategories);
        set({
          paused: false,
          pendingItems: [],
          items,
          tallies,
          activeCategories: deriveCategories(settings.knownCategories, items),
          // Resuming means counting again, so drop the finalized lock; the
          // mismatch alert re-gates until the employee finalizes anew.
          finalized: false,
        });
        if (get().beforeWashTallies) get().computeDiscrepancies();
      } else {
        set({ paused: true });
      }
    },

    async loadBeforeWashTallies(beforeWashUniqId) {
      const { settings } = get();
      const ec2 = deps.makeEc2(settings.ec2Url);
      const beforeItems = await ec2.getTransactionItems(beforeWashUniqId);
      set({ beforeWashTallies: aggregateTallies(beforeItems) });
      get().computeDiscrepancies();
    },

    async correctCategory(clothId, newCategory) {
      const { session, settings } = get();
      if (!session) return;
      const ec2 = deps.makeEc2(settings.ec2Url);
      // Do not optimistically move on failure (design error-handling table).
      await ec2.correctCloth({ clothId, category: newCategory });
      const tallies = applyCorrection(get().tallies, clothId, newCategory);
      const items = get().items.map((i) =>
        i.clothId === clothId
          ? { ...i, clothType: newCategory, isModified: true }
          : i,
      );
      set({
        tallies,
        items,
        activeCategories: deriveCategories(settings.knownCategories, items),
      });
    },

    discrepancies: [],
    resolvedCategories: new Set<string>(),
    alertDismissed: false,
    finalized: false,

    finalizeCount() {
      // Freeze ingestion so the verified totals cannot shift after finalizing.
      // Any further detections buffer into pendingItems (like pause) and are
      // only applied if the employee explicitly resumes.
      set({ finalized: true, paused: true });
      get().computeDiscrepancies();
    },

    computeDiscrepancies() {
      const { beforeWashTallies, tallies, resolvedCategories } = get();
      if (!beforeWashTallies) {
        set({ discrepancies: [] });
        return;
      }
      const discrepancies = buildComparisons(
        beforeWashTallies,
        tallies,
        resolvedCategories,
      );
      set({ discrepancies });
    },

    async moveCloth(clothId, targetCategory) {
      const { session, settings } = get();
      if (!session) return;
      const ec2 = deps.makeEc2(settings.ec2Url);
      const result = await ec2.moveCloth({
        clothId,
        targetCategory,
        transId: session.transId,
      });
      if (result.mismatchResolved) {
        const resolvedCategories = new Set(get().resolvedCategories);
        resolvedCategories.add(targetCategory);
        set({ resolvedCategories });
        get().computeDiscrepancies();
        if (allDiscrepanciesResolved(get().discrepancies)) {
          set({ alertDismissed: true });
        }
      }
    },

    connection: INITIAL_CONNECTION,

    updateJetsonStatus(reachable) {
      set((s) => {
        const { state, failCount } = nextJetsonState(s.connection.jetsonFailCount, reachable);
        return {
          connection: { ...s.connection, jetson: state, jetsonFailCount: failCount },
        };
      });
    },

    updateEC2Status(reachable) {
      set((s) => {
        const { state, failCount } = nextEc2State(s.connection.ec2FailCount, reachable);
        return {
          connection: { ...s.connection, ec2: state, ec2FailCount: failCount },
        };
      });
    },

    toggleMute() {
      set((s) => {
        const audioMuted = !s.settings.audioMuted;
        deps.audio.setMuted(audioMuted);
        const settings = { ...s.settings, audioMuted };
        saveSettings(settings);
        return { settings };
      });
    },
  }));
}

/** Default app-wide store instance. */
export const useCounterStore = createCounterStore();
