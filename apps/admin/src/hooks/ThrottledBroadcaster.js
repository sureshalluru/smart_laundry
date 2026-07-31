/**
 * Throttles API calls to enforce a minimum interval between consecutive calls.
 */
export class ThrottledBroadcaster {
  constructor(minInterval = 10000) {
    this.minInterval = minInterval;
    this.lastSentTimestamp = 0;
  }

  /**
   * Returns true if enough time has passed since the last allowed call.
   */
  canSend(now = Date.now()) {
    return (now - this.lastSentTimestamp) >= this.minInterval;
  }

  /**
   * Mark that a send was performed at the given time.
   */
  markSent(now = Date.now()) {
    this.lastSentTimestamp = now;
  }

  /**
   * Attempt to send. Returns true if allowed, false if throttled.
   */
  tryAcquire(now = Date.now()) {
    if (this.canSend(now)) {
      this.markSent(now);
      return true;
    }
    return false;
  }
}
