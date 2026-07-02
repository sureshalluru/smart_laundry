import React from 'react';
import { Box, Flex, Text, Circle, Divider } from '@chakra-ui/react';
import { CheckIcon } from '@chakra-ui/icons';

const STAGES = ["Received", "Processing", "Ready", "Delivered"];

/**
 * Maps an order status string to the active stage index (0-based).
 * Stages: 0=Received, 1=Processing, 2=Ready, 3=Delivered
 * 
 * The index represents the CURRENT stage. Stages below it show checkmarks.
 * Returns -1 for unknown statuses.
 */
export function getActiveStageIndex(orderStatus) {
  switch (orderStatus) {
    case 'OrderSubmitted':
    case 'ReadyForIntake':
      return 0;
    case 'ReceivedAtFacility':
    case 'InProgress':
    case 'ProcessingStarted':
      return 1;
    case 'ProcessingCompleted':
    case 'ReadyForDelivery':
      return 2;
    case 'EnRouteToDelivery':
      return 2;
    case 'Delivered':
    case 'OrderPickedUp':
      return 3;
    default:
      return -1;
  }
}

export default function ProgressBar({ orderStatus }) {
  const activeIndex = getActiveStageIndex(orderStatus);

  return (
    <Box
      w="100%"
      py={4}
      px={2}
      role="group"
      aria-label="Order progress"
    >
      <Flex align="center" justify="space-between" position="relative">
        {STAGES.map((stage, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <React.Fragment key={stage}>
              {/* Connector line before this step (except the first) */}
              {index > 0 && (
                <Divider
                  flex="1"
                  borderColor={index <= activeIndex ? 'green.400' : 'gray.300'}
                  borderWidth="2px"
                  mx={1}
                  aria-hidden="true"
                />
              )}

              {/* Step indicator */}
              <Flex
                direction="column"
                align="center"
                minW="60px"
                role="listitem"
                aria-label={`${stage}${isComplete ? ', completed' : isActive ? ', current' : ', upcoming'}`}
                aria-current={isActive ? 'step' : undefined}
              >
                <Circle
                  size="32px"
                  bg={isComplete ? 'green.400' : isActive ? 'green.500' : 'gray.200'}
                  color={isComplete || isActive ? 'white' : 'gray.500'}
                  border={isActive ? '3px solid' : 'none'}
                  borderColor={isActive ? 'green.300' : undefined}
                  mb={2}
                >
                  {isComplete ? (
                    <CheckIcon boxSize={3} />
                  ) : (
                    <Text fontSize="xs" fontWeight="bold">
                      {index + 1}
                    </Text>
                  )}
                </Circle>
                <Text
                  fontSize="xs"
                  fontWeight={isActive ? 'bold' : 'normal'}
                  color={isComplete || isActive ? 'green.600' : 'gray.500'}
                  textAlign="center"
                >
                  {stage}
                </Text>
              </Flex>
            </React.Fragment>
          );
        })}
      </Flex>
    </Box>
  );
}
