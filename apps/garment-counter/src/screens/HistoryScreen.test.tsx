import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import HistoryScreen from './HistoryScreen';
import type { DetectionEvent } from '../types';
import type { TransactionSummary } from '../services/ec2Service';

const HISTORY: TransactionSummary[] = [
  {
    transId: 'IS-42',
    uniqId: 'u-1',
    type: 'Before Wash',
    operatorName: 'Jane',
    date: '2026-01-01T10:00:00.000Z',
  },
];

function item(clothId: number, clothType: string): DetectionEvent {
  return {
    clothId,
    clothType,
    filePath: 'p',
    date: '2026-01-01T10:00:00.000Z',
    isModified: false,
    washType: 'Before Wash',
    transId: 'IS-42',
    operatorName: 'Jane',
    uniqId: 'u-1',
    status: 'ok',
  };
}

function makeEc2() {
  return () => ({
    getTransactionHistory: async () => HISTORY,
    getTransactionItems: async () => [item(1, 'shirts'), item(2, 'shirts'), item(3, 'pants')],
  });
}

function renderScreen() {
  return render(
    <ChakraProvider theme={theme}>
      <HistoryScreen makeEc2={makeEc2()} />
    </ChakraProvider>,
  );
}

describe('HistoryScreen', () => {
  it('lists past transactions and drills into per-category counts (Req 11.3)', async () => {
    const user = userEvent.setup();
    renderScreen();

    // list loads
    await waitFor(() =>
      expect(screen.getByTestId('transaction-u-1')).toBeInTheDocument(),
    );
    expect(screen.getByText('Order IS-42')).toBeInTheDocument();

    // drill into detail
    await user.click(screen.getByTestId('transaction-u-1'));
    await waitFor(() =>
      expect(screen.getByTestId('detail-counts')).toBeInTheDocument(),
    );
    expect(screen.getByText(/shirts:/i)).toBeInTheDocument();
    expect(screen.getByText(/pants:/i)).toBeInTheDocument();
  });
});
