import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import DemoErrorBoundary from './DemoErrorBoundary';

// Component that throws on render to test boundary
const ThrowingChild = () => {
  throw new Error('Test error from lazy-loaded view');
};

const GoodChild = () => <div>Demo content loads fine</div>;

const renderWithChakra = (ui) =>
  render(<ChakraProvider>{ui}</ChakraProvider>);

describe('DemoErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React error boundary console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('renders children when no error occurs', () => {
    renderWithChakra(
      <DemoErrorBoundary>
        <GoodChild />
      </DemoErrorBoundary>
    );
    expect(screen.getByText('Demo content loads fine')).toBeInTheDocument();
  });

  it('renders static fallback with platform features when child throws', () => {
    renderWithChakra(
      <DemoErrorBoundary>
        <ThrowingChild />
      </DemoErrorBoundary>
    );

    expect(screen.getByText('Unable to load demo')).toBeInTheDocument();
    expect(screen.getByText(/Explore what Smart Laundry Basket offers/)).toBeInTheDocument();
  });

  it('displays all 10 platform feature bullet points in fallback', () => {
    renderWithChakra(
      <DemoErrorBoundary>
        <ThrowingChild />
      </DemoErrorBoundary>
    );

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(10);
  });

  it('does not crash the parent when child throws', () => {
    const { container } = renderWithChakra(
      <div data-testid="parent-page">
        <DemoErrorBoundary>
          <ThrowingChild />
        </DemoErrorBoundary>
      </div>
    );

    // Parent still renders
    expect(screen.getByTestId('parent-page')).toBeInTheDocument();
    // Fallback is shown inside the parent
    expect(container.querySelector('[data-testid="parent-page"]')).toContainElement(
      screen.getByText('Unable to load demo')
    );
  });
});
