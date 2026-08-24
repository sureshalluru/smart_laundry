import React from 'react';
import { Box, Button, Text, Flex } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionButton = motion.create ? motion.create(Button) : motion(Button);

/**
 * CTAOverlay
 *
 * A persistent, non-intrusive call-to-action banner displayed at the bottom
 * of the Demo_Shell container. Encourages visitors to sign up after exploring
 * the demo.
 *
 * Props:
 * - enhanced (boolean): When true (after 30s of interaction), the overlay
 *   becomes slightly taller with an animated "Get Started" button.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
const CTAOverlay = ({ enhanced = false }) => {
  return (
    <Box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      maxH="15%"
      bg={enhanced ? 'rgba(26, 32, 44, 0.92)' : 'rgba(26, 32, 44, 0.85)'}
      backdropFilter="blur(4px)"
      py={enhanced ? 4 : 3}
      px={4}
      zIndex={10}
      borderTopWidth="1px"
      borderTopColor="whiteAlpha.200"
    >
      <Flex
        align="center"
        justify="center"
        gap={4}
        flexWrap="wrap"
        maxW="container.lg"
        mx="auto"
      >
        <Text
          color="whiteAlpha.900"
          fontSize={{ base: 'xs', md: 'sm' }}
          fontWeight="medium"
          textAlign="center"
        >
          Free to self-host · $49/mo managed
        </Text>

        {enhanced ? (
          <MotionButton
            as={RouterLink}
            to="/onboard"
            colorScheme="blue"
            size={{ base: 'sm', md: 'md' }}
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            Get Started
          </MotionButton>
        ) : (
          <Button
            as={RouterLink}
            to="/onboard"
            colorScheme="blue"
            size="sm"
            variant="solid"
          >
            Get Started
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default CTAOverlay;
