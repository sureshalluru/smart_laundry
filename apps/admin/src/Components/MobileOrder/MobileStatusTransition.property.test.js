import fc from 'fast-check';

// Mock dependencies to avoid ESM/JSX import issues
jest.mock('axios', () => ({
  __esModule: true,
  default: { put: jest.fn() },
}));

jest.mock('@chakra-ui/react', () => ({
  Box: 'Box',
  VStack: 'VStack',
  HStack: 'HStack',
  Text: 'Text',
  Badge: 'Badge',
  Button: 'Button',
  Modal: 'Modal',
  ModalOverlay: 'ModalOverlay',
  ModalContent: 'ModalContent',
  ModalHeader: 'ModalHeader',
  ModalBody: 'ModalBody',
  ModalFooter: 'ModalFooter',
  ModalCloseButton: 'ModalCloseButton',
  useDisclosure: jest.fn(() => ({ isOpen: false, onOpen: jest.fn(), onClose: jest.fn() })),
  useToast: jest.fn(() => jest.fn()),
  Spinner: 'Spinner',
  Icon: 'Icon',
}));

jest.mock('react-icons/fa', () => ({
  FaExchangeAlt: 'FaExchangeAlt',
}));

import { getValidNextStatuses, STATUS_TRANSITIONS } from './MobileStatusTransition';

/**
 * Property 2: Status transitions are valid
 *
 * For any current order status, the getValidNextStatuses function SHALL return only
 * statuses that are valid transitions according to the status transition map, and SHALL
 * never return the current status itself or any status that is not in the defined workflow.
 *
 * **Validates: Requirements 3.4, 4.2**
 */
describe('Property 2: Status transitions are valid', () => {
  // All valid workflow statuses
  const ALL_WORKFLOW_STATUSES = [
    'OrderSubmitted',
    'ReadyForIntake',
    'ReceivedAtFacility',
    'Processing',
    'ProcessingStarted',
    'ProcessingCompleted',
    'ReadyForDelivery',
    'EnRouteToDelivery',
    'Delivered',
    'OrderCanceled',
  ];

  // Terminal statuses that should have no transitions
  const TERMINAL_STATUSES = ['Delivered', 'OrderCanceled'];

  // Arbitrary: valid statuses from the transition map (keys that have outgoing transitions)
  const validStatusArb = fc.constantFrom(...Object.keys(STATUS_TRANSITIONS));

  // Arbitrary: terminal statuses
  const terminalStatusArb = fc.constantFrom(...TERMINAL_STATUSES);

  // Arbitrary: any workflow status
  const anyWorkflowStatusArb = fc.constantFrom(...ALL_WORKFLOW_STATUSES);

  // Arbitrary: completely random strings (including empty, special chars, etc.)
  const randomStringArb = fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom('', 'Unknown', 'InvalidStatus', 'ready', 'delivered', 'PROCESSING'),
    fc.string({ minLength: 1, maxLength: 20 }).map(s => `Random_${s}`)
  );

  // Combined arbitrary: mix of valid statuses, terminal statuses, and random strings
  const anyStatusArb = fc.oneof(
    anyWorkflowStatusArb,
    terminalStatusArb,
    randomStringArb
  );

  it('only returns statuses that exist in the transition map values', () => {
    // Collect all statuses that appear as values in the transition map
    const allValidTargets = new Set(
      Object.values(STATUS_TRANSITIONS).flat()
    );

    fc.assert(
      fc.property(anyStatusArb, (currentStatus) => {
        const nextStatuses = getValidNextStatuses(currentStatus);

        // Every returned status must be a valid target in the transition map
        return nextStatuses.every(s => allValidTargets.has(s) || Object.keys(STATUS_TRANSITIONS).includes(s));
      }),
      { numRuns: 100 }
    );
  });

  it('never returns the current status in the list of next statuses', () => {
    fc.assert(
      fc.property(anyStatusArb, (currentStatus) => {
        const nextStatuses = getValidNextStatuses(currentStatus);

        // The current status should never appear in its own next statuses
        return !nextStatuses.includes(currentStatus);
      }),
      { numRuns: 100 }
    );
  });

  it('returns only statuses that are in the defined workflow', () => {
    fc.assert(
      fc.property(anyStatusArb, (currentStatus) => {
        const nextStatuses = getValidNextStatuses(currentStatus);

        // Every returned status must be part of the defined workflow
        return nextStatuses.every(s => ALL_WORKFLOW_STATUSES.includes(s));
      }),
      { numRuns: 100 }
    );
  });

  it('returns exactly the transitions defined in STATUS_TRANSITIONS for valid statuses', () => {
    fc.assert(
      fc.property(validStatusArb, (currentStatus) => {
        const nextStatuses = getValidNextStatuses(currentStatus);
        const expected = STATUS_TRANSITIONS[currentStatus];

        // Should return exactly what the map defines
        return (
          nextStatuses.length === expected.length &&
          nextStatuses.every(s => expected.includes(s)) &&
          expected.every(s => nextStatuses.includes(s))
        );
      }),
      { numRuns: 100 }
    );
  });

  it('returns an empty array for terminal statuses', () => {
    fc.assert(
      fc.property(terminalStatusArb, (currentStatus) => {
        const nextStatuses = getValidNextStatuses(currentStatus);
        return nextStatuses.length === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('returns an empty array for unknown/random statuses not in the map', () => {
    fc.assert(
      fc.property(randomStringArb, (currentStatus) => {
        // Filter out cases where the random string happens to be a valid status
        fc.pre(!Object.keys(STATUS_TRANSITIONS).includes(currentStatus));
        fc.pre(!TERMINAL_STATUSES.includes(currentStatus));

        const nextStatuses = getValidNextStatuses(currentStatus);
        return nextStatuses.length === 0;
      }),
      { numRuns: 100 }
    );
  });
});
