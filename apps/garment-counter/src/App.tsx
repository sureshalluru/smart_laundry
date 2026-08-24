import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useCounterStore } from './store/counterStore';
import SettingsScreen from './screens/SettingsScreen';
import SessionStartScreen from './screens/SessionStartScreen';
import LiveCountingScreen from './screens/LiveCountingScreen';
import DiscrepancyAlertScreen from './screens/DiscrepancyAlertScreen';
import HistoryScreen from './screens/HistoryScreen';
import SessionSummaryScreen from './screens/SessionSummaryScreen';
import OrdersDashboardScreen from './screens/OrdersDashboardScreen';

type Overlay = 'settings' | 'history' | 'dashboard' | null;

/**
 * Root view controller. The primary screen is derived from store state:
 *  - active session + unresolved discrepancy alert -> DiscrepancyAlertScreen
 *  - active session -> LiveCountingScreen
 *  - just-ended session (lastSummary set) -> SessionSummaryScreen
 *  - no session -> SessionStartScreen
 * Settings, History, and the Orders Dashboard are modal-style overlays.
 */
export default function App() {
  const session = useCounterStore((s) => s.session);
  const discrepancies = useCounterStore((s) => s.discrepancies);
  const alertDismissed = useCounterStore((s) => s.alertDismissed);
  const finalized = useCounterStore((s) => s.finalized);
  const lastSummary = useCounterStore((s) => s.lastSummary);

  const [overlay, setOverlay] = useState<Overlay>(null);

  // The full-screen mismatch alert only fires once the employee finalizes the
  // count — mid-session undercounts are expected (folding out of intake order).
  const hasUnresolvedAlert =
    finalized &&
    discrepancies.some((d) => d.difference !== 0 && !d.isResolved) &&
    !alertDismissed;

  if (overlay === 'settings') {
    return (
      <Box h="100vh" overflowY="auto">
        <SettingsScreen onDone={() => setOverlay(null)} />
      </Box>
    );
  }

  if (overlay === 'history') {
    return (
      <Box h="100vh" overflowY="auto">
        <HistoryScreen onBack={() => setOverlay(null)} />
      </Box>
    );
  }

  if (overlay === 'dashboard') {
    return (
      <Box h="100vh" overflowY="auto">
        <OrdersDashboardScreen onBack={() => setOverlay(null)} />
      </Box>
    );
  }

  if (session) {
    if (hasUnresolvedAlert) {
      return <DiscrepancyAlertScreen />;
    }
    return <LiveCountingScreen onEnded={() => undefined} />;
  }

  // After a session ends, show its summary before returning to start.
  if (lastSummary) {
    return (
      <Box h="100vh" overflowY="auto">
        <SessionSummaryScreen onViewDashboard={() => setOverlay('dashboard')} />
      </Box>
    );
  }

  return (
    <SessionStartScreen
      onOpenSettings={() => setOverlay('settings')}
      onOpenDashboard={() => setOverlay('dashboard')}
    />
  );
}
