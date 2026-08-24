import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import SessionSummaryScreen from './SessionSummaryScreen';
import { useCounterStore } from '../store/counterStore';
import type { SessionSummary } from '../store/counterStore';

function seed(summary: SessionSummary) {
  useCounterStore.setState({ lastSummary: summary });
}

function renderSummary() {
  return render(
    <ChakraProvider theme={theme}>
      <SessionSummaryScreen />
    </ChakraProvider>,
  );
}

describe('SessionSummaryScreen', () => {
  beforeEach(() => {
    useCounterStore.setState({ lastSummary: null });
  });

  it('shows the per-category counts and total for the session', () => {
    seed({
      transId: 'ORD-1',
      mode: 'Before Wash',
      operatorName: 'Jane',
      total: 3,
      perCategory: [
        { category: 'shirts', count: 2 },
        { category: 'pants', count: 1 },
      ],
      discrepancies: [],
      hasMismatch: false,
    });
    renderSummary();
    expect(screen.getByText(/total 3/i)).toBeInTheDocument();
    expect(screen.getByText(/shirts:/i)).toBeInTheDocument();
    expect(screen.getByText(/pants:/i)).toBeInTheDocument();
  });

  it('shows a matched status for a reconciled After Wash session', () => {
    seed({
      transId: 'ORD-2',
      mode: 'After Wash',
      operatorName: 'Jane',
      total: 5,
      perCategory: [{ category: 'shirts', count: 5 }],
      discrepancies: [],
      hasMismatch: false,
    });
    renderSummary();
    expect(screen.getByTestId('summary-status')).toHaveTextContent(/all matched/i);
  });

  it('shows a mismatch status and breakdown for a discrepant After Wash session', () => {
    seed({
      transId: 'ORD-3',
      mode: 'After Wash',
      operatorName: 'Jane',
      total: 4,
      perCategory: [{ category: 'shirts', count: 4 }],
      discrepancies: [
        { category: 'shirts', beforeCount: 5, afterCount: 4, difference: -1, isResolved: false },
      ],
      hasMismatch: true,
    });
    renderSummary();
    expect(screen.getByTestId('summary-status')).toHaveTextContent(/mismatch/i);
  });
});
