import { useMemo, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { useCounterStore } from '../store/counterStore';
import ConnectionIndicators from '../components/ConnectionIndicators';
import CategoryGrid from '../components/CategoryGrid';
import LastDetectionPanel from '../components/LastDetectionPanel';
import CorrectionOverlay from '../components/CorrectionOverlay';
import DetectionGallery from '../components/DetectionGallery';
import { hasMidSessionWarning, isOvercount } from '../lib/discrepancy';
import type { DetectionEvent } from '../types';

export interface LiveCountingScreenProps {
  onEnded?: () => void;
}

/**
 * Main counting screen. Shows the session header (order badge, mode indicator,
 * connection indicators, mute toggle), the dynamic category grid, the last-
 * detection panel, the correction overlay, an offline banner, and End Session.
 *
 * @remarks Requirements 1.1–1.5, 4.6, 4.7, 6.4, 7.2, 7.5, 9.2, 9.5, 10.1.
 */
export default function LiveCountingScreen({ onEnded }: LiveCountingScreenProps) {
  const toast = useToast();
  const session = useCounterStore((s) => s.session);
  const tallies = useCounterStore((s) => s.tallies);
  const items = useCounterStore((s) => s.items);
  const activeCategories = useCounterStore((s) => s.activeCategories);
  const beforeWashTallies = useCounterStore((s) => s.beforeWashTallies);
  const connection = useCounterStore((s) => s.connection);
  const settings = useCounterStore((s) => s.settings);
  const correctCategory = useCounterStore((s) => s.correctCategory);
  const endSession = useCounterStore((s) => s.endSession);
  const toggleMute = useCounterStore((s) => s.toggleMute);
  const paused = useCounterStore((s) => s.paused);
  const pendingCount = useCounterStore((s) => s.pendingItems.length);
  const togglePause = useCounterStore((s) => s.togglePause);
  const discrepancies = useCounterStore((s) => s.discrepancies);
  const finalizeCount = useCounterStore((s) => s.finalizeCount);

  const [confirmEnd, setConfirmEnd] = useState(false);
  // The item currently being corrected (from the last-detection panel or any
  // gallery tile). Null means the overlay is closed.
  const [correcting, setCorrecting] = useState<DetectionEvent | null>(null);

  const lastDetection = items.length > 0 ? items[items.length - 1] : null;
  const cloudOffline = connection.ec2 === 'offline';
  const isAfterWash = session?.mode === 'After Wash';
  // Mid-session: only over-counts (after > before) are real warnings.
  const overcounts = discrepancies.filter(isOvercount);
  const showOvercountWarning = isAfterWash && hasMidSessionWarning(discrepancies);

  const overlayCategories = useMemo(() => {
    const set = new Set<string>([...activeCategories, ...settings.knownCategories]);
    return [...set];
  }, [activeCategories, settings.knownCategories]);

  if (!session) return null;

  const handleCorrect = async (category: string) => {
    const target = correcting;
    setCorrecting(null);
    if (!target) return;
    try {
      await correctCategory(target.clothId, category);
    } catch {
      toast({
        title: 'Correction failed',
        description: 'The item stayed in its original category. Try again.',
        status: 'error',
        duration: 4000,
      });
    }
  };

  const handleEnd = async () => {
    await endSession();
    onEnded?.();
  };

  return (
    <Flex direction="column" h="100vh" p={6} gap={5}>
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <HStack spacing={4}>
          <Badge fontSize="2xl" px={4} py={2} colorScheme="blue" borderRadius="lg">
            Order {session.transId}
          </Badge>
          <Badge
            fontSize="modeIndicator"
            px={4}
            py={2}
            colorScheme={session.mode === 'Before Wash' ? 'teal' : 'purple'}
            borderRadius="lg"
            data-testid="mode-indicator"
          >
            {session.mode}
          </Badge>
        </HStack>
        <HStack spacing={4}>
          <ConnectionIndicators connection={connection} />
          <Button
            colorScheme={paused ? 'green' : 'yellow'}
            size="lg"
            onClick={togglePause}
            data-testid="pause-toggle"
          >
            {paused ? `▶ Resume${pendingCount > 0 ? ` (${pendingCount})` : ''}` : '⏸ Pause'}
          </Button>
          <IconButton
            aria-label={settings.audioMuted ? 'Unmute audio' : 'Mute audio'}
            onClick={toggleMute}
            fontSize="2xl"
            icon={<span>{settings.audioMuted ? '🔇' : '🔊'}</span>}
          />
        </HStack>
      </Flex>

      {paused && (
        <Alert status="info" borderRadius="md" data-testid="paused-banner">
          <AlertIcon />
          Paused for review — counts are frozen so you can verify and correct.
          {pendingCount > 0
            ? ` ${pendingCount} new item${pendingCount === 1 ? '' : 's'} detected and waiting.`
            : ' New detections will be held until you resume.'}
        </Alert>
      )}

      {cloudOffline && (
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          Cloud Offline — the camera system is still recording. Corrections are
          paused until the cloud reconnects.
        </Alert>
      )}

      {showOvercountWarning && (
        <Alert status="error" borderRadius="md" data-testid="overcount-warning">
          <AlertIcon />
          More items than the Before Wash count in:{' '}
          {overcounts.map((r) => `${r.category} (+${r.difference})`).join(', ')}.
          Check for a misclassification.
        </Alert>
      )}
      <Box flex={1} overflowY="auto">
        <VStack align="stretch" spacing={5}>
          <CategoryGrid
            tallies={tallies}
            activeCategories={activeCategories}
            beforeWashTallies={session.mode === 'After Wash' ? beforeWashTallies : null}
          />
          <LastDetectionPanel
            detection={lastDetection}
            ec2Url={settings.ec2Url}
            onTap={
              cloudOffline || !lastDetection
                ? undefined
                : () => setCorrecting(lastDetection)
            }
          />
          <Box>
            <Text fontSize="lg" mb={2} color="gray.300">
              All detected items ({items.length})
            </Text>
            <DetectionGallery
              items={items}
              ec2Url={settings.ec2Url}
              onSelect={cloudOffline ? undefined : (d) => setCorrecting(d)}
            />
          </Box>
          {cloudOffline && (
            <Text color="gray.400" textAlign="center">
              Tap-to-correct is disabled while the cloud is offline.
            </Text>
          )}
        </VStack>
      </Box>

      {/* Footer */}
      <Flex justify="space-between" align="center">
        {isAfterWash ? (
          <Button
            colorScheme="blue"
            size="lg"
            onClick={finalizeCount}
            data-testid="finish-verify"
          >
            Finish &amp; Verify
          </Button>
        ) : (
          <Box />
        )}
        {confirmEnd ? (
          <HStack>
            <Text fontSize="lg">End this session?</Text>
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleEnd}>
              Confirm End
            </Button>
          </HStack>
        ) : (
          <Button colorScheme="red" size="lg" onClick={() => setConfirmEnd(true)}>
            End Session
          </Button>
        )}
      </Flex>

      <CorrectionOverlay
        isOpen={correcting !== null}
        categories={overlayCategories}
        onSelect={handleCorrect}
        onClose={() => setCorrecting(null)}
        detection={correcting}
        ec2Url={settings.ec2Url}
      />
    </Flex>
  );
}
