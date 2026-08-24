import { render, screen, within } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import userEvent from '@testing-library/user-event';
import DiscrepancyAlertScreen from './DiscrepancyAlertScreen';
import { useCounterStore } from '../store/counterStore';
import type { CategoryComparison, CategoryTally, DetectionEvent } from '../types';

function seedDiscrepancies(rows: CategoryComparison[]) {
  useCounterStore.setState({ discrepancies: rows });
}

function detection(clothId: number, clothType: string): DetectionEvent {
  return {
    clothId,
    clothType,
    filePath: `mock/${clothId}.jpg`,
    date: '2026-01-01T00:00:00.000Z',
    isModified: false,
    washType: 'Before Wash',
    transId: 'T1',
    operatorName: 'op',
    uniqId: 'u1',
    status: 'ok',
  };
}

function tally(category: string, items: DetectionEvent[]): CategoryTally {
  return { category, count: items.length, items };
}

function renderAlert(onMountAlarm?: () => void) {
  return render(
    <ChakraProvider theme={theme}>
      <DiscrepancyAlertScreen onMountAlarm={onMountAlarm} />
    </ChakraProvider>,
  );
}

describe('DiscrepancyAlertScreen', () => {
  beforeEach(() => {
    // Reset the shared store slices this suite mutates, so tests stay isolated.
    useCounterStore.setState({
      discrepancies: [],
      beforeWashTallies: null,
      items: [],
    });
  });

  it('lists per-category before/after/diff for each discrepancy (Req 5.4)', () => {
    seedDiscrepancies([
      { category: 'shirts', beforeCount: 5, afterCount: 4, difference: -1, isResolved: false },
      { category: 'pants', beforeCount: 3, afterCount: 3, difference: 0, isResolved: false },
    ]);
    renderAlert();

    // Only the discrepant row (shirts) is shown; pants (diff 0) is not.
    expect(screen.getByTestId('discrepancy-row-shirts')).toBeInTheDocument();
    expect(screen.queryByTestId('discrepancy-row-pants')).not.toBeInTheDocument();
  });

  it('plays the alarm once when the alert mounts (Req 5.3)', () => {
    seedDiscrepancies([
      { category: 'shirts', beforeCount: 5, afterCount: 4, difference: -1, isResolved: false },
    ]);
    const alarm = vi.fn();
    renderAlert(alarm);
    expect(alarm).toHaveBeenCalledTimes(1);
  });

  it('shows resolved state for already-resolved discrepancies (Req 5.6, 5.7)', () => {
    seedDiscrepancies([
      { category: 'towels', beforeCount: 2, afterCount: 3, difference: 1, isResolved: true },
    ]);
    renderAlert();
    expect(screen.getByTestId('resolved-towels')).toBeInTheDocument();
  });

  it('expands a category to compare Before vs After Wash photos', async () => {
    const user = userEvent.setup();
    // Before Wash had 2 shirts; After Wash has 1 -> mismatch, and we can see
    // both sets of photos to spot what is missing.
    useCounterStore.setState({
      discrepancies: [
        { category: 'shirts', beforeCount: 2, afterCount: 1, difference: -1, isResolved: false },
      ],
      beforeWashTallies: new Map([
        ['shirts', tally('shirts', [detection(101, 'shirts'), detection(102, 'shirts')])],
      ]),
      items: [detection(1, 'shirts')],
    });
    renderAlert();

    // photos hidden until the row is tapped
    expect(screen.queryByTestId('photo-compare-shirts')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('discrepancy-row-shirts'));
    const compare = screen.getByTestId('photo-compare-shirts');
    expect(compare).toBeInTheDocument();
    // Before Wash strip shows both intake photos, After Wash shows one
    expect(within(compare).getByText(/Before Wash \(2\)/)).toBeInTheDocument();
    expect(within(compare).getByText(/After Wash \(so far\) \(1\)/)).toBeInTheDocument();
  });
});
