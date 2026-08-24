import type { ConnectionStatus } from '../types';

/** Number of consecutive Jetson check failures before showing disconnected. */
export const JETSON_DISCONNECT_THRESHOLD = 3;

export type JetsonState = ConnectionStatus['jetson']; // 'connected' | 'disconnected' | 'unknown'
export type Ec2State = ConnectionStatus['ec2']; // 'connected' | 'offline' | 'unknown'

/**
 * Advance the Jetson ("Camera") connection state after a single check outcome.
 *
 * A successful check resets the consecutive-failure count to zero and returns
 * the connected state. A failed check increments the count; the indicator is
 * `disconnected` if and only if the current run of consecutive failures is at
 * least {@link JETSON_DISCONNECT_THRESHOLD}, otherwise it stays `connected`.
 *
 * @remarks Requirements 10.4, 10.5.
 */
export function nextJetsonState(
  failCount: number,
  success: boolean,
): { state: JetsonState; failCount: number } {
  if (success) {
    return { state: 'connected', failCount: 0 };
  }
  const nextFail = failCount + 1;
  return {
    state: nextFail >= JETSON_DISCONNECT_THRESHOLD ? 'disconnected' : 'connected',
    failCount: nextFail,
  };
}

/**
 * Advance the EC2 ("Cloud") connection state after a single poll outcome.
 *
 * A failed poll immediately shows `offline` (amber) — distinct from the Jetson
 * `disconnected` state — and a subsequent successful poll returns to
 * `connected`. The fail count is tracked for display but does not gate the
 * offline transition.
 *
 * @remarks Requirements 10.2, 10.3, 10.6, 10.7.
 */
export function nextEc2State(
  failCount: number,
  success: boolean,
): { state: Ec2State; failCount: number } {
  if (success) {
    return { state: 'connected', failCount: 0 };
  }
  return { state: 'offline', failCount: failCount + 1 };
}
