import type { DetectionEvent, WashMode } from '../types';

/**
 * Tag a detection with the active session's mode as its `washType`.
 *
 * Recording an item during a session always attributes it to that session's
 * mode (Before Wash or After Wash), regardless of what `washType` the raw
 * detection carried. Pure — returns a new event, does not mutate the input.
 *
 * @remarks Requirements 4.4, 4.5.
 */
export function tagWithSessionMode(
  event: DetectionEvent,
  mode: WashMode,
): DetectionEvent {
  return { ...event, washType: mode };
}
