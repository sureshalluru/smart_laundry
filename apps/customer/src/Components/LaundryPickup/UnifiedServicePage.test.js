import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import UnifiedServicePage from './UnifiedServicePage';

const mockCategories = [
  { categoryId: 'cat_1', categoryName: 'Laundry' },
  { categoryId: 'cat_2', categoryName: 'Dry Cleaning' },
];

const mockServices = [
  { serviceId: 's1', serviceName: 'Wash & Fold', price: 1.89, inputWeight: true, categoryId: 'cat_1', categoryName: 'Laundry' },
  { serviceId: 's2', serviceName: 'Comforter', price: 35, inputWeight: false, categoryId: 'cat_2', categoryName: 'Dry Cleaning' },
];

const emptyCart = { items: [] };
const mockDispatch = jest.fn();
const mockOnContinue = jest.fn();

function renderWithChakra(ui) {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
}

describe('UnifiedServicePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all services grouped by category when categories exist', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={mockCategories}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    expect(screen.getByText('Laundry')).toBeInTheDocument();
    expect(screen.getByText('Dry Cleaning')).toBeInTheDocument();
    expect(screen.getByText('Wash & Fold')).toBeInTheDocument();
    expect(screen.getByText('Comforter')).toBeInTheDocument();
  });

  it('first accordion section is expanded by default', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={mockCategories}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    // First category service (Wash & Fold) should be visible
    expect(screen.getByText('Wash & Fold')).toBeVisible();
    // The first category header should be present
    expect(screen.getByText('Laundry')).toBeInTheDocument();
  });

  it('clicking a collapsed section expands it and collapses the previously expanded one', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={mockCategories}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    // Initially the first section (Laundry) is expanded.
    // When a section is expanded, its header renders a ChevronUpIcon (via svg path).
    // When collapsed, it renders a ChevronDownIcon.
    
    // Get the accordion buttons
    const laundryHeader = screen.getByText('Laundry').closest('button');
    const dryCleaningHeader = screen.getByText('Dry Cleaning').closest('button');

    // Before click: Laundry section should contain a ChevronUp SVG
    // (ChevronUpIcon has a different path than ChevronDownIcon)
    const laundrySvgBefore = laundryHeader.querySelector('svg');
    const dryCleanSvgBefore = dryCleaningHeader.querySelector('svg');
    
    // Both headers have SVG icons
    expect(laundrySvgBefore).toBeInTheDocument();
    expect(dryCleanSvgBefore).toBeInTheDocument();

    // Click on the "Dry Cleaning" header to expand it
    fireEvent.click(dryCleaningHeader);

    // After click: the SVG icons should swap
    // Laundry now collapsed (ChevronDown), Dry Cleaning now expanded (ChevronUp)
    const laundrySvgAfter = laundryHeader.querySelector('svg');
    const dryCleanSvgAfter = dryCleaningHeader.querySelector('svg');
    
    // The SVG path data should have changed indicating icon switch
    expect(laundrySvgAfter.innerHTML).not.toBe(laundrySvgBefore.innerHTML);
    expect(dryCleanSvgAfter.innerHTML).not.toBe(dryCleanSvgBefore.innerHTML);
  });

  it('shows WeightServiceRow for per-pound services (inputWeight=true)', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={mockCategories}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    // WeightServiceRow shows price as $/lb and has an "Add" button
    expect(screen.getByText('$1.89/lb')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('shows PieceServiceRow for per-piece services (inputWeight=false)', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={mockCategories}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    // Expand Dry Cleaning to see the PieceServiceRow
    fireEvent.click(screen.getByText('Dry Cleaning'));

    // PieceServiceRow shows price as $/piece and has an Add (+) icon button
    expect(screen.getByText('$35.00/piece')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('falls back to flat list when serviceCategories is empty (backward compatibility)', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={[]}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    // With no categories, services should render in a flat list
    expect(screen.getByText('Wash & Fold')).toBeInTheDocument();
    expect(screen.getByText('Comforter')).toBeInTheDocument();
    // Category names should not appear as accordion headers
    expect(screen.queryByText('Laundry')).not.toBeInTheDocument();
  });

  it('falls back to flat list when serviceCategories is null (backward compatibility)', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={null}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    expect(screen.getByText('Wash & Fold')).toBeInTheDocument();
    expect(screen.getByText('Comforter')).toBeInTheDocument();
  });

  it('StickyCartBar Continue button is disabled when cart is empty', () => {
    renderWithChakra(
      <UnifiedServicePage
        laundryServices={mockServices}
        serviceCategories={mockCategories}
        cart={emptyCart}
        dispatch={mockDispatch}
        onContinue={mockOnContinue}
      />
    );

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeDisabled();
  });
});
