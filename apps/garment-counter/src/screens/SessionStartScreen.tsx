import { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useCounterStore } from '../store/counterStore';
import { extractOrderId } from '../lib/qr';
import type { WashMode } from '../types';

export interface SessionStartScreenProps {
  onStarted?: () => void;
  onOpenSettings?: () => void;
  onOpenDashboard?: () => void;
}

/**
 * Select or scan an order, pick a mode, and start a session. The After Wash
 * guard and any Jetson 409 are surfaced through the store's `startError`.
 *
 * @remarks Requirements 4.1, 6.1, 6.2, 6.3, 6.7, 7.4.
 */
export default function SessionStartScreen({
  onStarted,
  onOpenSettings,
  onOpenDashboard,
}: SessionStartScreenProps) {
  const settings = useCounterStore((s) => s.settings);
  const startSession = useCounterStore((s) => s.startSession);
  const startError = useCounterStore((s) => s.startError);

  const [orderId, setOrderId] = useState('');
  const [mode, setMode] = useState<WashMode>('Before Wash');
  const [operatorName, setOperatorName] = useState(settings.operatorName);
  const [busy, setBusy] = useState(false);

  const handleScanInput = (raw: string) => {
    // A scanner types the payload then Enter; normalize any URL/token form.
    const extracted = extractOrderId(raw);
    setOrderId(extracted ?? raw);
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const ok = await startSession({ transId: orderId.trim(), mode, operatorName });
      if (ok) onStarted?.();
    } finally {
      setBusy(false);
    }
  };

  const canStart = orderId.trim() !== '' && operatorName.trim() !== '' && !busy;

  return (
    <Box maxW="720px" mx="auto" p={8}>
      <VStack align="stretch" spacing={8}>
        <HStack justify="space-between">
          <Heading size="xl">Start Counting</Heading>
          <HStack>
            {onOpenDashboard && (
              <Button variant="outline" onClick={onOpenDashboard}>
                Dashboard
              </Button>
            )}
            {onOpenSettings && (
              <Button variant="outline" onClick={onOpenSettings}>
                Settings
              </Button>
            )}
          </HStack>
        </HStack>

        <Box>
          <Text fontSize="xl" mb={2}>
            Order
          </Text>
          <Input
            size="lg"
            fontSize="2xl"
            placeholder="Scan or enter order ID"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleScanInput((e.target as HTMLInputElement).value);
            }}
            aria-label="Order ID"
            autoFocus
          />
        </Box>

        <Box>
          <Text fontSize="xl" mb={2}>
            Mode
          </Text>
          <HStack spacing={4}>
            {(['Before Wash', 'After Wash'] as WashMode[]).map((m) => (
              <Button
                key={m}
                flex={1}
                size="lg"
                height="72px"
                fontSize="xl"
                colorScheme={mode === m ? 'green' : 'gray'}
                variant={mode === m ? 'solid' : 'outline'}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
              >
                {m}
              </Button>
            ))}
          </HStack>
        </Box>

        <Box>
          <Text fontSize="xl" mb={2}>
            Operator
          </Text>
          <Input
            size="lg"
            placeholder="Your name"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            aria-label="Operator name"
          />
        </Box>

        {startError && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            {startError}
          </Alert>
        )}

        <Button
          colorScheme="green"
          size="lg"
          height="80px"
          fontSize="2xl"
          isDisabled={!canStart}
          isLoading={busy}
          onClick={handleStart}
        >
          Start Session
        </Button>
      </VStack>
    </Box>
  );
}
