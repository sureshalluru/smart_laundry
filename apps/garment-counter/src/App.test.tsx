import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from './theme';
import App from './App';

describe('App shell', () => {
  it('shows the session start screen when no session is active', () => {
    render(
      <ChakraProvider theme={theme}>
        <App />
      </ChakraProvider>,
    );
    expect(screen.getByRole('heading', { name: /start counting/i })).toBeInTheDocument();
  });
});
