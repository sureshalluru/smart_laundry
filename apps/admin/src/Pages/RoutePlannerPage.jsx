import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Spinner,
  useToast,
  HStack,
  Input,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure,
  Badge,
} from '@chakra-ui/react';
import axios from 'axios';
import { format } from 'date-fns';
import DriverSelector, { CLUSTER_COLORS } from '../Components/RouteOptimization/DriverSelector';
import ClusteredMap from '../Components/RouteOptimization/ClusteredMap';

const API_URL = process.env.REACT_APP_AWS_API_URL;

const RoutePlannerPage = ({ laundryId }) => {
  const toast = useToast();
  const authToken = localStorage.getItem('idToken');
  const headers = { Authorization: `Bearer ${authToken}` };

  // State
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [stops, setStops] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [sequencePositions, setSequencePositions] = useState({});
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [existingAssignments, setExistingAssignments] = useState(null);

  // Re-optimize confirmation dialog
  const { isOpen: isReoptimizeOpen, onOpen: onReoptimizeOpen, onClose: onReoptimizeClose } = useDisclosure();
  const cancelRef = React.useRef();

  // Fetch stops and drivers on date change
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [stopsRes, driversRes, assignmentsRes] = await Promise.all([
        axios.get(`${API_URL}/api/routes/stops`, {
          params: { laundryId, date: selectedDate },
          headers,
        }),
        axios.get(`${API_URL}/api/routes/drivers`, {
          params: { laundryId },
          headers,
        }),
        axios.get(`${API_URL}/api/routes/assignments`, {
          params: { laundryId, date: selectedDate },
          headers,
        }),
      ]);

      setStops(stopsRes.data.stops || []);
      setDrivers(driversRes.data.drivers || []);

      // Load existing assignments if present
      const assignments = assignmentsRes.data.assignments || {};
      if (Object.keys(assignments).length > 0) {
        setExistingAssignments(assignments);
        // Rebuild clusters from existing assignments
        const driverIds = Object.keys(assignments);
        setSelectedDrivers(driverIds);
        const rebuiltClusters = driverIds.map((dId, idx) => ({
          clusterIndex: idx,
          stops: assignments[dId].map((s) => s.orderId),
        }));
        setClusters(rebuiltClusters);
        // Build sequence positions
        const seqPos = {};
        Object.values(assignments).forEach((driverStops) => {
          driverStops.forEach((s) => {
            seqPos[s.orderId] = s.sequencePosition;
          });
        });
        setSequencePositions(seqPos);
      } else {
        setExistingAssignments(null);
        setClusters([]);
        setSequencePositions({});
      }
    } catch (err) {
      console.error('Error fetching route data:', err);
      toast({
        title: 'Error loading data',
        description: err.response?.data?.message || 'Failed to fetch route data',
        status: 'error',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [laundryId, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle driver selection
  const handleToggleDriver = (driverId) => {
    setSelectedDrivers((prev) =>
      prev.includes(driverId)
        ? prev.filter((id) => id !== driverId)
        : [...prev, driverId]
    );
  };

  // Compute stop counts per driver
  const stopCounts = {};
  clusters.forEach((cluster, idx) => {
    const driverId = selectedDrivers[idx];
    if (driverId) {
      stopCounts[driverId] = cluster.stops?.length || 0;
    }
  });

  // Optimize routes (clustering)
  const handleOptimize = async () => {
    if (selectedDrivers.length < 2) {
      toast({
        title: 'Select at least 2 drivers',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (stops.length === 0) {
      toast({
        title: 'No stops available',
        description: 'No pending stops for this date.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    setOptimizing(true);
    try {
      const stopsPayload = stops.map((s) => ({
        orderId: s.orderId,
        latitude: s.latitude,
        longitude: s.longitude,
      }));

      const response = await axios.post(
        `${API_URL}/api/routes/optimize`,
        {
          laundryId,
          stops: stopsPayload,
          driverCount: selectedDrivers.length,
        },
        { headers }
      );

      setClusters(response.data.clusters || []);
      setSequencePositions({});
      toast({
        title: 'Routes optimized',
        description: `${stops.length} stops clustered across ${selectedDrivers.length} drivers`,
        status: 'success',
        duration: 3000,
      });
    } catch (err) {
      console.error('Optimization error:', err);
      toast({
        title: 'Optimization failed',
        description: err.response?.data?.message || 'Could not optimize routes',
        status: 'error',
        duration: 4000,
      });
    } finally {
      setOptimizing(false);
    }
  };

  // Assign routes (save + optimize order)
  const handleAssign = async () => {
    if (clusters.length === 0) {
      toast({ title: 'Run optimization first', status: 'warning', duration: 3000 });
      return;
    }

    setAssigning(true);
    try {
      const assignments = clusters.map((cluster, idx) => ({
        driverId: selectedDrivers[idx] || selectedDrivers[0],
        orderIds: cluster.stops || [],
      }));

      const response = await axios.post(
        `${API_URL}/api/routes/assign`,
        {
          laundryId,
          date: selectedDate,
          assignments,
        },
        { headers }
      );

      if (response.data.status === 'success') {
        // Update sequence positions from response
        const seqPos = {};
        (response.data.routes || []).forEach((route) => {
          Object.entries(route.sequencePositions || {}).forEach(([oid, pos]) => {
            seqPos[oid] = pos;
          });
        });
        setSequencePositions(seqPos);
        setExistingAssignments(true); // Mark as assigned

        toast({
          title: 'Routes assigned',
          description: 'Route assignments saved and optimized.',
          status: 'success',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Assignment failed',
          description: response.data.message || 'Could not save assignments',
          status: 'error',
          duration: 4000,
        });
      }
    } catch (err) {
      console.error('Assignment error:', err);
      toast({
        title: 'Assignment failed',
        description: err.response?.data?.message || 'Could not save assignments',
        status: 'error',
        duration: 4000,
      });
    } finally {
      setAssigning(false);
    }
  };

  // Re-optimize (clear + re-cluster)
  const handleReoptimize = async () => {
    onReoptimizeClose();
    try {
      await axios.delete(`${API_URL}/api/routes/assignments`, {
        params: { laundryId, date: selectedDate },
        headers,
        data: { confirm: true },
      });
      setClusters([]);
      setSequencePositions({});
      setExistingAssignments(null);
      toast({ title: 'Assignments cleared', status: 'info', duration: 2000 });
    } catch (err) {
      console.error('Clear assignments error:', err);
      toast({
        title: 'Error clearing assignments',
        status: 'error',
        duration: 3000,
      });
    }
  };

  // Reassign a stop to a different cluster (also handles manual assignment without prior clustering)
  const handleReassign = (orderId, targetClusterIndex) => {
    setClusters((prev) => {
      // If no clusters exist yet (manual assignment mode), create empty clusters for each selected driver
      let newClusters = prev.length > 0
        ? prev.map((c) => ({ ...c, stops: [...(c.stops || [])] }))
        : selectedDrivers.map((_, idx) => ({ clusterIndex: idx, stops: [] }));

      // Remove from current cluster (if already assigned)
      newClusters.forEach((c) => {
        c.stops = c.stops.filter((id) => id !== orderId);
      });
      // Add to target cluster
      if (newClusters[targetClusterIndex]) {
        newClusters[targetClusterIndex].stops.push(orderId);
      }
      return newClusters;
    });
  };

  // Single driver fallback: open Google Maps directly
  const handleSingleDriverRoute = () => {
    if (stops.length === 0) return;
    const waypoints = stops.map((s) => encodeURIComponent(s.address)).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&waypoints=${waypoints}`;
    window.open(url, '_blank');
  };

  return (
    <Box p={[3, 4]}>
      <Text fontSize="xl" fontWeight="bold" mb={4}>
        🗺️ Route Planner
      </Text>

      {/* Date picker */}
      <HStack mb={4} spacing={3} wrap="wrap">
        <Text fontWeight="medium" fontSize="sm">Date:</Text>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          maxW="200px"
          size="sm"
        />
        {existingAssignments && (
          <Badge colorScheme="green" fontSize="xs">Assignments exist</Badge>
        )}
      </HStack>

      {loading ? (
        <Flex justify="center" align="center" minH="200px">
          <Spinner size="lg" />
          <Text ml={3}>Loading stops…</Text>
        </Flex>
      ) : (
        <>
          {stops.length === 0 ? (
            <Box textAlign="center" py={10}>
              <Text fontSize="md" color="gray.500">
                No pending stops for {selectedDate}
              </Text>
            </Box>
          ) : (
            <Flex direction={{ base: 'column', lg: 'row' }} gap={4}>
              {/* Left panel: driver selector + actions */}
              <Box minW="240px">
                <DriverSelector
                  drivers={drivers}
                  selectedDrivers={selectedDrivers}
                  onToggleDriver={handleToggleDriver}
                  stopCounts={stopCounts}
                />

                <Box mt={4}>
                  <Text fontSize="xs" color="gray.500" mb={2}>
                    {stops.length} pending stops
                  </Text>

                  {selectedDrivers.length === 1 ? (
                    <Button
                      colorScheme="blue"
                      size="sm"
                      width="100%"
                      onClick={handleSingleDriverRoute}
                    >
                      Open in Google Maps
                    </Button>
                  ) : (
                    <>
                      <Button
                        colorScheme="teal"
                        size="sm"
                        width="100%"
                        mb={2}
                        onClick={handleOptimize}
                        isLoading={optimizing}
                        isDisabled={selectedDrivers.length < 2}
                      >
                        Optimize Routes
                      </Button>

                      <Button
                        colorScheme="blue"
                        size="sm"
                        width="100%"
                        mb={2}
                        onClick={handleAssign}
                        isLoading={assigning}
                        isDisabled={clusters.length === 0 || clusters.every(c => (c.stops || []).length === 0)}
                      >
                        Assign Routes
                      </Button>

                      {existingAssignments && (
                        <Button
                          colorScheme="orange"
                          variant="outline"
                          size="sm"
                          width="100%"
                          onClick={onReoptimizeOpen}
                        >
                          Re-optimize
                        </Button>
                      )}
                    </>
                  )}
                </Box>

                {/* Legend */}
                {clusters.length > 0 && (
                  <Box mt={4} p={3} bg="gray.50" borderRadius="md" borderWidth="1px">
                    <Text fontSize="xs" fontWeight="bold" mb={2}>Legend</Text>
                    {selectedDrivers.map((dId, idx) => {
                      const driver = drivers.find((d) => d.driverId === dId);
                      const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
                      return (
                        <HStack key={dId} spacing={2} mb={1}>
                          <Box w="10px" h="10px" borderRadius="full" bg={color} />
                          <Text fontSize="xs">{driver?.name || dId}</Text>
                          <Text fontSize="xs" color="gray.500">
                            ({clusters[idx]?.stops?.length || 0})
                          </Text>
                        </HStack>
                      );
                    })}
                  </Box>
                )}
              </Box>

              {/* Map */}
              <Box flex={1} minH="500px" borderRadius="md" overflow="hidden">
                <ClusteredMap
                  stops={stops}
                  clusters={clusters}
                  selectedDrivers={selectedDrivers}
                  onReassign={handleReassign}
                  sequencePositions={sequencePositions}
                />
              </Box>
            </Flex>
          )}
        </>
      )}

      {/* Re-optimize confirmation dialog */}
      <AlertDialog
        isOpen={isReoptimizeOpen}
        leastDestructiveRef={cancelRef}
        onClose={onReoptimizeClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Re-optimize Routes
            </AlertDialogHeader>
            <AlertDialogBody>
              This will clear existing route assignments (except completed stops) and allow you to run clustering again. Continue?
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onReoptimizeClose}>
                Cancel
              </Button>
              <Button colorScheme="orange" onClick={handleReoptimize} ml={3}>
                Re-optimize
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

export default RoutePlannerPage;
