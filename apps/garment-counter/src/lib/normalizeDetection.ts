import type { DetectionEvent } from '../types';

/**
 * Raw shape of a `/single_cloth/` response from the EC2 backend. Field names
 * are snake_case and types are loose because the backend payload is untrusted
 * and may evolve. This is the ONLY place that knows the raw format
 * (Requirement 2.3, 2.4).
 */
export interface RawSingleClothResponse {
  cloth_id?: unknown;
  cloth_type?: unknown;
  file_path?: unknown;
  date?: unknown;
  ismodified?: unknown;
  wash_type?: unknown;
  trans_id?: unknown;
  operator_name?: unknown;
  uniq_id?: unknown;
  status?: unknown;
  confidence?: unknown;
  [key: string]: unknown;
}

/** Coerce a value that should be a number; returns null if not coercible. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Coerce a value that should be a string; returns null if absent/empty. */
function toStringField(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Coerce a loosely-typed boolean (true/false, 1/0, "true"/"false", "1"/"0"). */
function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

/**
 * Normalize a raw EC2 `/single_cloth/` payload into a {@link DetectionEvent}.
 *
 * Returns `null` when the payload is malformed — i.e. missing any required
 * field (`cloth_id`, `cloth_type`, `file_path`, `date`, `wash_type`,
 * `trans_id`, `operator_name`, `uniq_id`, `status`). Callers (the polling
 * loop) skip null results without crashing.
 *
 * `confidence` is optional: present only when the raw payload supplies a
 * finite numeric confidence.
 *
 * @remarks Requirement 2.3 — insulates the rest of the app from the raw format.
 */
export function normalizeDetection(raw: unknown): DetectionEvent | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as RawSingleClothResponse;

  const clothId = toNumber(r.cloth_id);
  const clothType = toStringField(r.cloth_type);
  const filePath = toStringField(r.file_path);
  const date = toStringField(r.date);
  const washType = toStringField(r.wash_type);
  const transId = toStringField(r.trans_id);
  const operatorName = toStringField(r.operator_name);
  const uniqId = toStringField(r.uniq_id);
  const status = toStringField(r.status);

  // Every required field must be present and coercible.
  if (
    clothId === null ||
    clothType === null ||
    filePath === null ||
    date === null ||
    washType === null ||
    transId === null ||
    operatorName === null ||
    uniqId === null ||
    status === null
  ) {
    return null;
  }

  const event: DetectionEvent = {
    clothId,
    clothType,
    filePath,
    date,
    isModified: toBool(r.ismodified),
    washType,
    transId,
    operatorName,
    uniqId,
    status,
  };

  const confidence = toNumber(r.confidence);
  if (confidence !== null) {
    event.confidence = confidence;
  }

  return event;
}
