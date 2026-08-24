import {
  Badge,
  Button,
  HStack,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import type { DetectionEvent } from '../types';
import { isLowConfidence } from '../lib/tally';

export interface CorrectionOverlayProps {
  isOpen: boolean;
  categories: string[];
  onSelect: (category: string) => void;
  onClose: () => void;
  /** The item being corrected — shown so the employee can judge from the photo. */
  detection?: DetectionEvent | null;
  /** Base URL to resolve the detection image. */
  ec2Url?: string;
}

/**
 * Category selection overlay for correcting a misclassified item. Shows the
 * detected photo and the AI's current guess + confidence at the top, then
 * renders all available categories as large (>=44x44pt) tap targets. The
 * current category is visually distinguished. Requires zero keyboard input and
 * dismisses without changes on backdrop tap.
 *
 * @remarks Requirements 3.1, 3.6, 3.7, 3.8.
 */
export default function CorrectionOverlay({
  isOpen,
  categories,
  onSelect,
  onClose,
  detection,
  ec2Url,
}: CorrectionOverlayProps) {
  const low = detection ? isLowConfidence(detection) : false;
  const imgSrc =
    detection && ec2Url
      ? `${ec2Url.replace(/\/+$/, '')}/${detection.filePath.replace(/^\/+/, '')}`
      : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
      {/* Backdrop click closes without changes (Req 3.8) */}
      <ModalOverlay />
      <ModalContent bg="surface.raised">
        <ModalHeader fontSize="2xl">Reassign category</ModalHeader>
        <ModalCloseButton size="lg" />
        <ModalBody pb={8}>
          {detection && (
            <HStack spacing={4} mb={5} align="center">
              {imgSrc && (
                <Image
                  src={imgSrc}
                  alt={`Detected ${detection.clothType}`}
                  boxSize="96px"
                  objectFit="cover"
                  borderRadius="lg"
                  borderWidth="3px"
                  borderColor={low ? 'status.warning' : 'surface.border'}
                  fallbackSrc="/favicon.svg"
                />
              )}
              <VStack align="start" spacing={1}>
                <Text color="gray.400">AI detected</Text>
                <HStack>
                  <Text fontSize="2xl" fontWeight="bold" textTransform="capitalize">
                    {detection.clothType}
                  </Text>
                  {detection.confidence !== undefined && (
                    <Badge fontSize="md" colorScheme={low ? 'orange' : 'green'}>
                      {detection.confidence}%
                    </Badge>
                  )}
                </HStack>
                <Text color="gray.400" fontSize="sm">
                  Tap the correct category below
                </Text>
              </VStack>
            </HStack>
          )}
          <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
            {categories.map((category) => {
              const isCurrent = detection?.clothType === category;
              return (
                <Button
                  key={category}
                  height="80px"
                  minW="44px"
                  fontSize="xl"
                  colorScheme={isCurrent ? 'gray' : 'green'}
                  variant={isCurrent ? 'outline' : 'solid'}
                  onClick={() => onSelect(category)}
                  textTransform="capitalize"
                >
                  {category}
                  {isCurrent ? ' (current)' : ''}
                </Button>
              );
            })}
          </SimpleGrid>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
