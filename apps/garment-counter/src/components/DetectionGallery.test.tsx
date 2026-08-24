import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import DetectionGallery from './DetectionGallery';
import type { DetectionEvent } from '../types';

function item(clothId: number, clothType: string, confidence?: number): DetectionEvent {
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
    confidence,
  };
}

function renderGallery(items: DetectionEvent[], onSelect?: (d: DetectionEvent) => void) {
  return render(
    <ChakraProvider theme={theme}>
      <DetectionGallery items={items} ec2Url="http://ec2:8000" onSelect={onSelect} />
    </ChakraProvider>,
  );
}

describe('DetectionGallery', () => {
  it('renders a tile for every detected item', () => {
    renderGallery([item(1, 'shirts'), item(2, 'pants'), item(3, 'towels')]);
    expect(screen.getByTestId('gallery-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-item-2')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-item-3')).toBeInTheDocument();
  });

  it('selecting a tile reports the specific item (correction on any item)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderGallery([item(1, 'shirts'), item(2, 'pants')], onSelect);
    await user.click(screen.getByTestId('gallery-item-2'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ clothId: 2 }));
  });

  it('shows an empty state when there are no items', () => {
    renderGallery([]);
    expect(screen.getByText(/detected items will appear here/i)).toBeInTheDocument();
  });
});
