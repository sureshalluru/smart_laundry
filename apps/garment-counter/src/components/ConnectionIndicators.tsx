import { HStack, Tag, TagLabel } from '@chakra-ui/react';
import type { ConnectionStatus } from '../types';

const JETSON_COLORS: Record<ConnectionStatus['jetson'], string> = {
  connected: 'green',
  disconnected: 'red',
  unknown: 'gray',
};

const EC2_COLORS: Record<ConnectionStatus['ec2'], string> = {
  connected: 'green',
  offline: 'yellow', // amber — distinct from Camera disconnected red
  unknown: 'gray',
};

/**
 * Two persistent status indicators — "Camera" (Jetson) and "Cloud" (EC2) —
 * always visible during a session. The Cloud offline state is amber, distinct
 * from the Camera disconnected red (Req 10.1, 10.4–10.7).
 */
export default function ConnectionIndicators({
  connection,
}: {
  connection: ConnectionStatus;
}) {
  return (
    <HStack spacing={3}>
      <Tag
        size="lg"
        colorScheme={JETSON_COLORS[connection.jetson]}
        borderRadius="full"
        data-testid="camera-indicator"
        data-state={connection.jetson}
      >
        <TagLabel>Camera: {connection.jetson}</TagLabel>
      </Tag>
      <Tag
        size="lg"
        colorScheme={EC2_COLORS[connection.ec2]}
        borderRadius="full"
        data-testid="cloud-indicator"
        data-state={connection.ec2}
      >
        <TagLabel>Cloud: {connection.ec2}</TagLabel>
      </Tag>
    </HStack>
  );
}
