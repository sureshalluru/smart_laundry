import type { WashMode } from '../types';

export interface StartTransactionParams {
  transId: string;
  type: WashMode;
  operatorName: string;
  uniqId: string;
  date: string; // ISO format
  cam?: string; // optional camera identifier
}

/** Trim a base URL of trailing slashes so path joins are clean. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Normalize a user-entered base URL: trim whitespace/trailing slashes and
 * prepend `http://` when no scheme is present, so values like
 * `localhost:4000` or `192.168.1.100:8000` work without the user typing the
 * scheme. A bare host without a scheme otherwise makes `fetch` treat the value
 * as a relative path and fail.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = trimBase(baseUrl.trim());
  if (trimmed === '') return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/**
 * Build the Jetson `GET /transaction/` start URL.
 *
 * All required parameters (`id`, `type`, `operator_name`, `uniq_id`, `date`)
 * are included and URL-encoded via `URLSearchParams`, so decoding any value
 * reproduces the original input exactly — including spaces (e.g. "Before
 * Wash") and reserved characters.
 *
 * @remarks Requirement 6.2.
 */
export function buildStartTransactionUrl(
  baseUrl: string,
  params: StartTransactionParams,
): string {
  const search = new URLSearchParams();
  search.set('id', params.transId);
  search.set('type', params.type);
  search.set('operator_name', params.operatorName);
  search.set('uniq_id', params.uniqId);
  search.set('date', params.date);
  if (params.cam !== undefined) {
    search.set('cam', params.cam);
  }
  return `${trimBase(baseUrl)}/transaction/?${search.toString()}`;
}

/**
 * Build the Jetson `POST /transaction/` stop request body (form-encoded).
 *
 * @remarks Requirement 6.5.
 */
export function buildStopTransactionBody(uniqId: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set('status', '0');
  body.set('uniq_id', uniqId);
  return body;
}
