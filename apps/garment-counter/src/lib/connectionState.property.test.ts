import fc from 'fast-check';
import {
  JETSON_DISCONNECT_THRESHOLD,
  nextEc2State,
  nextJetsonState,
} from './connectionState';

// Feature: realtime-garment-counter-ipad, Property 11: Jetson consecutive-
// failure disconnect state machine — For any sequence of check outcomes, the
// Camera indicator is disconnected iff the most recent run of consecutive
// failures is >= 3, and any success resets the count to zero (reconnecting).
// Validates: Requirements 10.4, 10.5
describe('Property 11: Jetson consecutive-failure disconnect state machine', () => {
  const outcomeSeqArb = fc.array(fc.boolean(), { maxLength: 100 });

  it('disconnected iff current run of failures >= threshold; success resets', () => {
    fc.assert(
      fc.property(outcomeSeqArb, (outcomes) => {
        let failCount = 0;
        let runOfFailures = 0;
        for (const success of outcomes) {
          const result = nextJetsonState(failCount, success);

          if (success) {
            runOfFailures = 0;
            expect(result.state).toBe('connected');
            expect(result.failCount).toBe(0);
          } else {
            runOfFailures += 1;
            const expectedState =
              runOfFailures >= JETSON_DISCONNECT_THRESHOLD ? 'disconnected' : 'connected';
            expect(result.state).toBe(expectedState);
            expect(result.failCount).toBe(runOfFailures);
          }
          failCount = result.failCount;
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: realtime-garment-counter-ipad, Property 12: EC2 reachability status
// transitions — For any sequence of poll outcomes, the Cloud indicator is
// offline after any failed poll and connected after any subsequent successful
// poll, using a state value distinct from the Camera disconnected state.
// Validates: Requirements 10.2, 10.3, 10.6, 10.7
describe('Property 12: EC2 reachability status transitions', () => {
  const outcomeSeqArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 100 });

  it('offline after any failure, connected after any success; distinct from disconnected', () => {
    fc.assert(
      fc.property(outcomeSeqArb, (outcomes) => {
        let failCount = 0;
        for (const success of outcomes) {
          const result = nextEc2State(failCount, success);
          expect(result.state).toBe(success ? 'connected' : 'offline');
          // EC2 offline must never collide with the Jetson disconnected value
          expect(result.state).not.toBe('disconnected');
          failCount = result.failCount;
        }
      }),
      { numRuns: 100 },
    );
  });
});
