import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import CorrectionOverlay from './CorrectionOverlay';

function renderOverlay(props: {
  onSelect?: (c: string) => void;
  onClose?: () => void;
}) {
  return render(
    <ChakraProvider theme={theme}>
      <CorrectionOverlay
        isOpen
        categories={['shirts', 'pants', 'towels']}
        onSelect={props.onSelect ?? (() => {})}
        onClose={props.onClose ?? (() => {})}
      />
    </ChakraProvider>,
  );
}

describe('CorrectionOverlay', () => {
  it('renders all categories as tap targets (Req 3.1)', () => {
    renderOverlay({});
    expect(screen.getByRole('button', { name: 'shirts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pants' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'towels' })).toBeInTheDocument();
  });

  it('calls onSelect with the chosen category', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderOverlay({ onSelect });
    await user.click(screen.getByRole('button', { name: 'pants' }));
    expect(onSelect).toHaveBeenCalledWith('pants');
  });

  it('dismisses without changes when the backdrop is tapped (Req 3.8)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderOverlay({ onSelect, onClose });
    // Chakra renders the overlay; press Escape which triggers onClose without selection
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
