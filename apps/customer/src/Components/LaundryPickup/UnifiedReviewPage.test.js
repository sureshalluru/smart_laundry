import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import UnifiedReviewPage from './UnifiedReviewPage';

const mockCart = {
  items: [
    { serviceId: 's1', serviceName: 'Wash & Fold', categoryId: 'cat_1', categoryName: 'Laundry', price: 1.89, inputWeight: true, quantity: 15 },
    { serviceId: 's2', serviceName: 'Comforter', categoryId: 'cat_2', categoryName: 'Bedding', price: 35, inputWeight: false, quantity: 2 },
  ]
};

const emptyCart = { items: [] };

const defaultProps = {
  cart: mockCart,
  dispatch: jest.fn(),
  pickupDate: '2024-06-15',
  pickupTime: '9:00 AM - 11:00 AM',
  dropoffDate: '2024-06-17',
  dropoffTime: '9:00 AM - 11:00 AM',
  tip: { tipAmount: '0' },
  setTip: jest.fn(),
  taxRate: 0,
  onPlaceOrder: jest.fn(),
  onEdit: jest.fn(),
  orderProcessing: false,
};

function renderWithChakra(ui) {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
}

describe('UnifiedReviewPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays all cart items with correct service names', () => {
    renderWithChakra(<UnifiedReviewPage {...defaultProps} />);

    expect(screen.getByText('Wash & Fold')).toBeInTheDocument();
    expect(screen.getByText('Comforter')).toBeInTheDocument();
  });

  it('shows correct line total (quantity × price) for each item', () => {
    renderWithChakra(<UnifiedReviewPage {...defaultProps} />);

    // Wash & Fold: 15 lbs × $1.89/lb = $28.35
    expect(screen.getByText(/15 lbs × \$1\.89\/lb = \$28\.35/)).toBeInTheDocument();
    // Comforter: 2 × $35.00 = $70.00
    expect(screen.getByText(/2 × \$35\.00 = \$70\.00/)).toBeInTheDocument();
  });

  it('shows "* final price based on actual weight" disclaimer when per-pound items present', () => {
    renderWithChakra(<UnifiedReviewPage {...defaultProps} />);

    expect(screen.getByText(/\* final price based on actual weight/)).toBeInTheDocument();
  });

  it('does NOT show disclaimer when only per-piece items', () => {
    const pieceOnlyCart = {
      items: [
        { serviceId: 's2', serviceName: 'Comforter', categoryId: 'cat_2', categoryName: 'Bedding', price: 35, inputWeight: false, quantity: 2 },
      ]
    };

    renderWithChakra(
      <UnifiedReviewPage {...defaultProps} cart={pieceOnlyCart} />
    );

    expect(screen.queryByText(/\* final price based on actual weight/)).not.toBeInTheDocument();
  });

  it('delete (✕) button dispatches REMOVE_ITEM action', () => {
    const dispatch = jest.fn();
    renderWithChakra(
      <UnifiedReviewPage {...defaultProps} dispatch={dispatch} />
    );

    // Click the remove button for Wash & Fold
    const removeBtn = screen.getByRole('button', { name: /remove wash & fold/i });
    fireEvent.click(removeBtn);

    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_ITEM', serviceId: 's1' });
  });

  it('"Edit Services" button calls onEdit callback', () => {
    const onEdit = jest.fn();
    renderWithChakra(
      <UnifiedReviewPage {...defaultProps} onEdit={onEdit} />
    );

    const editBtn = screen.getByRole('button', { name: /edit services/i });
    fireEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('Place Order button is disabled when cart is empty', () => {
    renderWithChakra(
      <UnifiedReviewPage {...defaultProps} cart={emptyCart} />
    );

    const placeOrderBtn = screen.getByRole('button', { name: /place order/i });
    expect(placeOrderBtn).toBeDisabled();
  });

  it('Place Order button calls onPlaceOrder when clicked', () => {
    const onPlaceOrder = jest.fn();
    renderWithChakra(
      <UnifiedReviewPage {...defaultProps} onPlaceOrder={onPlaceOrder} />
    );

    const placeOrderBtn = screen.getByRole('button', { name: /place order/i });
    fireEvent.click(placeOrderBtn);

    expect(onPlaceOrder).toHaveBeenCalledTimes(1);
  });
});
