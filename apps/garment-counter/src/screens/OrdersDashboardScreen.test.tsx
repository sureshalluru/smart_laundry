import { render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import OrdersDashboardScreen from './OrdersDashboardScreen';
import type { OrderSummary } from '../services/ec2Service';

const ORDERS: OrderSummary[] = [
  {
    transId: 'ORD-1',
    operatorName: 'Jane',
    date: '2026-01-01',
    beforeTotal: 5,
    afterTotal: 5,
    beforeByCategory: { shirts: 5 },
    afterByCategory: { shirts: 5 },
    hasBefore: true,
    hasAfter: true,
    mismatch: false,
  },
  {
    transId: 'ORD-2',
    operatorName: 'Jane',
    date: '2026-01-01',
    beforeTotal: 4,
    afterTotal: 3,
    beforeByCategory: { pants: 4 },
    afterByCategory: { pants: 3 },
    hasBefore: true,
    hasAfter: true,
    mismatch: true,
  },
  {
    transId: 'ORD-3',
    operatorName: 'Jane',
    date: '2026-01-01',
    beforeTotal: 2,
    afterTotal: 0,
    beforeByCategory: { towels: 2 },
    afterByCategory: {},
    hasBefore: true,
    hasAfter: false,
    mismatch: false,
  },
];

function renderDashboard() {
  return render(
    <ChakraProvider theme={theme}>
      <OrdersDashboardScreen makeEc2={() => ({ getOrdersSummary: async () => ORDERS })} />
    </ChakraProvider>,
  );
}

describe('OrdersDashboardScreen', () => {
  it('lists each order with before/after totals and a status', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-table')).toBeInTheDocument());
    expect(screen.getByTestId('order-row-ORD-1')).toBeInTheDocument();
    expect(screen.getByTestId('order-row-ORD-2')).toBeInTheDocument();
    expect(screen.getByTestId('order-row-ORD-3')).toBeInTheDocument();
  });

  it('flags matched, mismatched, and awaiting-after-wash states', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('order-status-ORD-1')).toBeInTheDocument());
    expect(screen.getByTestId('order-status-ORD-1')).toHaveTextContent(/matched/i);
    expect(screen.getByTestId('order-status-ORD-2')).toHaveTextContent(/mismatch/i);
    expect(screen.getByTestId('order-status-ORD-3')).toHaveTextContent(/awaiting after wash/i);
  });
});
