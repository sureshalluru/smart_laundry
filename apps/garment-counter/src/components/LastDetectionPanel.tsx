import { Badge, Box, HStack, Image, Text, VStack } from '@chakra-ui/react';
import type { DetectionEvent } from '../types';
import { isLowConfidence } from '../lib/tally';

export interface LastDetectionPanelProps {
  detection: DetectionEvent | null;
  /** Base URL used to resolve the detection image path on EC2. */
  ec2Url: string;
  onTap?: () => void;
}

/**
 * Shows the most recent detection: image, category label, and a confidence
 * badge. Low-confidence detections (< 70) are highlighted (Req 1.5). Tapping
 * opens the correction overlay for the most recent item (Req 3.1).
 */
export default function LastDetectionPanel({
  detection,
  ec2Url,
  onTap,
}: LastDetectionPanelProps) {
  if (!detection) {
    return (
      <Box
        bg="surface.raised"
        borderRadius="xl"
        p={5}
        minH="160px"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="gray.400" fontSize="xl">
          Waiting for first item…
        </Text>
      </Box>
    );
  }

  const low = isLowConfidence(detection);
  const imgSrc = `${ec2Url.replace(/\/+$/, '')}/${detection.filePath.replace(/^\/+/, '')}`;

  return (
    <Box
      bg="surface.raised"
      borderRadius="xl"
      p={5}
      borderWidth="3px"
      borderColor={low ? 'status.warning' : 'surface.border'}
      role={onTap ? 'button' : undefined}
      onClick={onTap}
      data-testid="last-detection"
      data-low-confidence={low ? 'true' : 'false'}
    >
      <HStack spacing={5} align="center">
        <Image
          src={imgSrc}
          alt={`Detected ${detection.clothType}`}
          boxSize="120px"
          objectFit="cover"
          borderRadius="lg"
          fallbackSrc="/favicon.svg"
        />
        <VStack align="start" spacing={2}>
          <Text fontSize="3xl" fontWeight="bold" textTransform="capitalize">
            {detection.clothType}
          </Text>
          <HStack>
            {detection.confidence !== undefined && (
              <Badge
                fontSize="lg"
                colorScheme={low ? 'orange' : 'green'}
                data-testid="confidence-badge"
              >
                {detection.confidence}%
              </Badge>
            )}
            {detection.isModified && (
              <Badge fontSize="lg" colorScheme="purple">
                corrected
              </Badge>
            )}
            {low && (
              <Badge fontSize="lg" colorScheme="orange">
                low confidence
              </Badge>
            )}
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
}
