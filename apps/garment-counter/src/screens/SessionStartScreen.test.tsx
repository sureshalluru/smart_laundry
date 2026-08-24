import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import SessionStartScreen from './SessionStartScreen';

function renderScreen() {
  return render(
    <ChakraProvider theme={theme}>
      <SessionStartScreen />
    </ChakraProvider>,
  );
}

describe('SessionStartScreen', () => {
  it('disables Start until an order id and operator are provided (Req 6.1)', async () => {
    const user = userEvent.setup();
    renderScreen();

    const startBtn = screen.getByRole('button', { name: /start session/i });
    expect(startBtn).toBeDisabled();

    await user.type(screen.getByLabelText('Order ID'), 'IS-42');
    // operator may be prefilled empty; ensure it is set
    const operator = screen.getByLabelText('Operator name');
    await user.clear(operator);
    await user.type(operator, 'Jane');

    expect(startBtn).toBeEnabled();
  });

  it('lets the operator switch between Before Wash and After Wash (Req 4.1)', async () => {
    const user = userEvent.setup();
    renderScreen();

    const before = screen.getByRole('button', { name: 'Before Wash' });
    const after = screen.getByRole('button', { name: 'After Wash' });

    // Before Wash is the default selection
    expect(before).toHaveAttribute('aria-pressed', 'true');
    expect(after).toHaveAttribute('aria-pressed', 'false');

    await user.click(after);
    expect(after).toHaveAttribute('aria-pressed', 'true');
    expect(before).toHaveAttribute('aria-pressed', 'false');
  });
});
