# Customer Tracking Map Upgrade Notes

## Changes needed in TrackingPage.jsx:

### 6.2 Smoother animation
- Import `lerp`, `easeInOut` from './trackingUtils'
- Change ANIMATION_DURATION from 1000 to 2000
- Apply easeInOut to the interpolation t value
- Rotate car marker icon based on heading from API response

### 6.3 Arrival detection
- Import `isArriving` from './trackingUtils'
- On each poll response, check isArriving(driverPos, customerAddress)
- When within 200m, show toast "Driver is arriving!"
- Track `hasShownArrival` state to avoid repeated toasts

### 6.4 Stale location indicator
- Track `lastUpdateTimestamp` state
- After 60 seconds without update, show "Updating driver location..." overlay
- Hide car marker when stale to avoid showing inaccurate position

### 6.5 Driver info panel
- Display driver name from tracking API response
- Show status text: "Driver is arriving!" vs "Driver is on the way"

### 6.6 Polling interval
- Change POLL_INTERVAL to 10000 (from current 12000 or 15000)
- Ensure interval cleans up on unmount
