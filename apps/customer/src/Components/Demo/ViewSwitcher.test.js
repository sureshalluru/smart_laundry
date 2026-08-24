import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import ViewSwitcher from './ViewSwitcher';

// Mock useBreakpointValue to control desktop/mobile behavior
jest.mock('@chakra-ui/react', () => {
  const actual = jest.requireActual('@chakra-ui/react');
  return {
    ...actual,
    useBreakpointValue: jest.fn(() => false), // default: desktop
  };
});

const { useBreakpointValue } = require('@chakra-ui/react');

const MockIcon = () => <span data-testid="mock-icon">📦</span>;

const sampleViews = [
  { key: 'dashboard', label: 'Dashboard', icon: MockIcon, path: '/slb/demo/dashboard' },
  { key: 'driver', label: 'Driver Dispatch', icon: MockIcon, path: '/slb/demo/driver' },
  { key: 'tracking', label: 'Tracking', icon: MockIcon, path: '/slb/demo/tracking' },
];

const renderComponent = (views = sampleViews, initialPath = '/slb/demo/dashboard') => {
  return render(
    <ChakraProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <ViewSwitcher views={views} />
      </MemoryRouter>
    </ChakraProvider>
  );
};

describe('ViewSwitcher', () => {
  beforeEach(() => {
    useBreakpointValue.mockReturnValue(false); // desktop
  });

  it('renders all view tabs on desktop', () => {
    renderComponent();
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Driver Dispatch' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tracking' })).toBeInTheDocument();
  });

  it('has role="tablist" on the container (desktop)', () => {
    renderComponent();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('each tab has role="tab" and aria-label', () => {
    renderComponent();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    tabs.forEach((tab, i) => {
      expect(tab).toHaveAttribute('aria-label', sampleViews[i].label);
    });
  });

  it('highlights the active tab matching the current route', () => {
    renderComponent(sampleViews, '/slb/demo/dashboard');
    const dashboardTab = screen.getByRole('tab', { name: 'Dashboard' });
    expect(dashboardTab).toHaveClass('active');
  });

  it('supports keyboard navigation with ArrowRight', () => {
    renderComponent();
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
  });

  it('supports keyboard navigation with ArrowLeft wrapping', () => {
    renderComponent();
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    // Should wrap to the last tab
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('renders hamburger toggle on mobile', () => {
    useBreakpointValue.mockReturnValue(true); // mobile
    renderComponent();
    expect(screen.getByLabelText('Open navigation menu')).toBeInTheDocument();
  });

  it('shows tabs when hamburger is clicked on mobile', () => {
    useBreakpointValue.mockReturnValue(true); // mobile
    renderComponent();
    const toggle = screen.getByLabelText('Open navigation menu');
    fireEvent.click(toggle);
    // Chakra's Collapse renders the content in JSDOM even if CSS hides it;
    // verify the tablist container exists in the document
    const tablist = document.querySelector('[role="tablist"]');
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute('aria-label', 'Demo view navigation');
  });

  it('renders without crashing when views is empty', () => {
    renderComponent([]);
    // Should still render the tablist container
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
