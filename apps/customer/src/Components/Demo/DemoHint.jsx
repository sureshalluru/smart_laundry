import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
`;

/**
 * DemoHint
 *
 * A small pulsing badge that draws attention to interactive elements in demo views.
 * Place it next to or inside clickable elements to guide visitors.
 *
 * Props:
 * - text: string — short hint text (e.g., "Click to expand", "Try this")
 * - position: 'inline' | 'absolute-top-right' — how to position the hint
 * - show: boolean — whether to display the hint (can be hidden after first interaction)
 */
const DemoHint = ({ text = '👆 Try this', position = 'inline', show = true }) => {
  if (!show) return null;

  const baseStyles = {
    fontSize: '10px',
    fontWeight: 'bold',
    color: 'blue.600',
    bg: 'blue.50',
    border: '1px dashed',
    borderColor: 'blue.300',
    borderRadius: 'full',
    px: 2,
    py: 0.5,
    animation: `${pulse} 2s ease-in-out infinite`,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    pointerEvents: 'none',
  };

  if (position === 'absolute-top-right') {
    return (
      <Box
        position="absolute"
        top={-1}
        right={-1}
        zIndex={5}
        {...baseStyles}
      >
        <Text as="span" fontSize="10px">{text}</Text>
      </Box>
    );
  }

  return (
    <Box as="span" display="inline-flex" alignItems="center" ml={2} {...baseStyles}>
      <Text as="span" fontSize="10px">{text}</Text>
    </Box>
  );
};

export default DemoHint;
