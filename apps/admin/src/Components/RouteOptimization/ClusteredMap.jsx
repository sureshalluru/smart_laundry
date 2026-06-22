import React, { useState, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { CLUSTER_COLORS } from './DriverSelector';

const containerStyle = {
  width: '100%',
  height: '500px',
};

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

/**
 * Google Map with color-coded pins per driver/cluster.
 * Props:
 *  - stops: [{orderId, customerName, address, latitude, longitude, orderType}]
 *  - clusters: [{clusterIndex, stops: [orderId, ...]}] or null
 *  - selectedDrivers: [driverId, ...]
 *  - driverMap: {clusterIndex: driverId} mapping clusters to drivers
 *  - onReassign: (orderId, targetClusterIndex) => void
 *  - sequencePositions: {orderId: position} (optional, after optimization)
 */
const ClusteredMap = ({
  stops = [],
  clusters = [],
  selectedDrivers = [],
  driverMap = {},
  onReassign,
  sequencePositions = {},
}) => {
  const [selectedStop, setSelectedStop] = useState(null);

  // Build a lookup: orderId -> clusterIndex
  const orderClusterMap = {};
  clusters.forEach((cluster) => {
    (cluster.stops || []).forEach((orderId) => {
      orderClusterMap[orderId] = cluster.clusterIndex;
    });
  });

  // Compute map center from stops
  const center = stops.length > 0
    ? {
        lat: stops.reduce((sum, s) => sum + s.latitude, 0) / stops.length,
        lng: stops.reduce((sum, s) => sum + s.longitude, 0) / stops.length,
      }
    : defaultCenter;

  const getMarkerColor = (orderId) => {
    const clusterIdx = orderClusterMap[orderId];
    if (clusterIdx === undefined) return '#718096'; // gray for unclustered
    return CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length];
  };

  const handleMarkerClick = useCallback((stop) => {
    setSelectedStop(stop);
  }, []);

  const handleReassign = (orderId, targetClusterIndex) => {
    if (onReassign) {
      onReassign(orderId, targetClusterIndex);
    }
    setSelectedStop(null);
  };

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={12}
    >
      {stops.map((stop) => {
        const color = getMarkerColor(stop.orderId);
        const seqPos = sequencePositions[stop.orderId];

        return (
          <Marker
            key={stop.orderId}
            position={{ lat: stop.latitude, lng: stop.longitude }}
            onClick={() => handleMarkerClick(stop)}
            label={seqPos ? { text: String(seqPos), color: 'white', fontWeight: 'bold', fontSize: '11px' } : undefined}
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: seqPos ? 14 : 10,
            }}
            title={`${stop.customerName} - ${stop.orderType}`}
          />
        );
      })}

      {selectedStop && (
        <InfoWindow
          position={{ lat: selectedStop.latitude, lng: selectedStop.longitude }}
          onCloseClick={() => setSelectedStop(null)}
        >
          <div style={{ maxWidth: '220px', fontSize: '13px' }}>
            <strong>{selectedStop.customerName}</strong>
            <p style={{ margin: '4px 0' }}>{selectedStop.address}</p>
            <p style={{ margin: '4px 0', color: '#666' }}>
              Type: {selectedStop.orderType === 'pickup' ? '📦 Pickup' : '🚚 Delivery'}
            </p>
            {onReassign && selectedDrivers.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Assign to driver:</label>
                <select
                  style={{ width: '100%', marginTop: '4px', fontSize: '12px', padding: '4px' }}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value !== '') {
                      handleReassign(selectedStop.orderId, parseInt(e.target.value));
                    }
                  }}
                >
                  <option value="">-- Select driver --</option>
                  {selectedDrivers.map((driverId, idx) => (
                    <option key={idx} value={idx}>
                      {driverId} ({clusters[idx]?.stops?.length || 0} stops)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
};

export default ClusteredMap;
