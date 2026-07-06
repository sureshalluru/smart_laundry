import React, { useState, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow, Polyline } from '@react-google-maps/api';
import { CLUSTER_COLORS } from './DriverSelector';

const containerStyle = {
  width: '100%',
  height: '100%',
  minHeight: '500px',
};

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

/**
 * Google Map with numbered, color-coded pins per driver/cluster.
 * Shows route lines connecting stops in sequence order.
 */
const ClusteredMap = ({
  stops = [],
  clusters = [],
  selectedDrivers = [],
  onReassign,
  sequencePositions = {},
  highlightedStop = null,
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

  // Build polylines for each cluster (connect stops in sequence order)
  const polylines = clusters.map((cluster, idx) => {
    const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
    const clusterStops = (cluster.stops || [])
      .map((orderId) => {
        const stop = stops.find((s) => s.orderId === orderId);
        const pos = sequencePositions[orderId] || 999;
        return stop ? { ...stop, pos } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.pos - b.pos);

    if (clusterStops.length < 2) return null;

    const path = clusterStops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
    return { path, color, key: `polyline-${idx}` };
  }).filter(Boolean);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={12}
      options={{
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      }}
    >
      {/* Route lines */}
      {polylines.map(({ path, color, key }) => (
        <Polyline
          key={key}
          path={path}
          options={{
            strokeColor: color,
            strokeOpacity: 0.6,
            strokeWeight: 3,
            geodesic: true,
          }}
        />
      ))}

      {/* Numbered markers */}
      {stops.map((stop) => {
        const color = getMarkerColor(stop.orderId);
        const seqPos = sequencePositions[stop.orderId];
        const isHighlighted = highlightedStop === stop.orderId;
        const isPickup = stop.orderType === 'pickup';

        return (
          <Marker
            key={stop.orderId}
            position={{ lat: stop.latitude, lng: stop.longitude }}
            onClick={() => handleMarkerClick(stop)}
            label={
              seqPos
                ? { text: String(seqPos), color: 'white', fontWeight: 'bold', fontSize: '12px' }
                : { text: isPickup ? 'P' : 'D', color: 'white', fontWeight: 'bold', fontSize: '11px' }
            }
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: isHighlighted ? '#000000' : '#ffffff',
              strokeWeight: isHighlighted ? 4 : 2,
              scale: seqPos ? 16 : 12,
            }}
            title={`${seqPos ? `#${seqPos} ` : ''}${stop.customerName} - ${stop.address}`}
            zIndex={isHighlighted ? 1000 : (seqPos || 100)}
          />
        );
      })}

      {selectedStop && (
        <InfoWindow
          position={{ lat: selectedStop.latitude, lng: selectedStop.longitude }}
          onCloseClick={() => setSelectedStop(null)}
        >
          <div style={{ maxWidth: '240px', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              {sequencePositions[selectedStop.orderId] && (
                <span style={{
                  background: getMarkerColor(selectedStop.orderId),
                  color: 'white',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}>
                  {sequencePositions[selectedStop.orderId]}
                </span>
              )}
              <strong>{selectedStop.customerName}</strong>
            </div>
            <p style={{ margin: '4px 0', color: '#333' }}>{selectedStop.address}</p>
            <p style={{ margin: '4px 0', color: '#666', fontSize: '12px' }}>
              {selectedStop.orderType === 'pickup' ? '📦 Pickup' : '🚚 Delivery'} • {selectedStop.orderId}
            </p>
            {onReassign && selectedDrivers.length > 0 && (
              <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Reassign to:</label>
                <select
                  style={{ width: '100%', marginTop: '4px', fontSize: '12px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
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
                      Driver {idx + 1} ({clusters[idx]?.stops?.length || 0} stops)
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
