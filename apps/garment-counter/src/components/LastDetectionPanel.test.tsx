import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import LastDetectionPanel from './LastDetectionPanel';
import type { DetectionEvent } from '../types';

function makeDetection(confidence?: number): DetectionEvent {
  return {
    clothId: 1,
    clothType: 'shirts',
    filePath: '/img/1.jpg',
    date: '2026-01-01T00:00:00.000Z',
    isModified: false,
    washType: 'Before Wash',
    transId: 'T1',
    operatorName: 'op',
    uniqId: 'u1',
    status: 'ok',
    confidence,
  };
}

function renderPanel(detection: DetectionEvent | null) {
  return render(
    <ChakraProvider theme={theme}>
      <LastDetectionPanel detection={detection} ec2Url="http://ec2:8000" />
    </ChakraProvider>,
  );
}

describe('LastDetectionPanel', () => {
  it('highlights low-confidence detections (Req 1.5)', () => {
    renderPanel(makeDetection(55));
    expect(screen.getByTestId('last-detection')).toHaveAttribute(
      'data-low-confidence',
      'true',
    );
  });

  it('does not highlight high-confidence detections', () => {
    renderPanel(makeDetection(92));
    expect(screen.getByTestId('last-detection')).toHaveAttribute(
      'data-low-confidence',
      'false',
    );
  });

  it('shows a waiting state when there is no detection', () => {
    renderPanel(null);
    expect(screen.getByText(/waiting for first item/i)).toBeInTheDocument();
  });
});
