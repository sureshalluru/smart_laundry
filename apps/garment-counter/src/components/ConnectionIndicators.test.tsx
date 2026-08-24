import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import ConnectionIndicators from './ConnectionIndicators';
import type { ConnectionStatus } from '../types';

function renderWith(connection: ConnectionStatus) {
  return render(
    <ChakraProvider theme={theme}>
      <ConnectionIndicators connection={connection} />
    </ChakraProvider>,
  );
}

describe('ConnectionIndicators', () => {
  it('shows both Camera and Cloud indicators (Req 10.1)', () => {
    renderWith({ jetson: 'connected', ec2: 'connected', jetsonFailCount: 0, ec2FailCount: 0 });
    expect(screen.getByTestId('camera-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('cloud-indicator')).toBeInTheDocument();
  });

  it('reflects Camera disconnected and Cloud offline as distinct states (Req 10.4, 10.6)', () => {
    renderWith({ jetson: 'disconnected', ec2: 'offline', jetsonFailCount: 3, ec2FailCount: 1 });
    expect(screen.getByTestId('camera-indicator')).toHaveAttribute('data-state', 'disconnected');
    expect(screen.getByTestId('cloud-indicator')).toHaveAttribute('data-state', 'offline');
    // the two problem states use different values
    expect(
      screen.getByTestId('cloud-indicator').getAttribute('data-state'),
    ).not.toBe(screen.getByTestId('camera-indicator').getAttribute('data-state'));
  });
});
