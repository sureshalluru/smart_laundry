import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, Grid, GridItem, Spinner, Alert, AlertIcon , Button, Select, FormControl, FormLabel, Flex, useToast } from '@chakra-ui/react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export const fetchShopDetails = async (laundryId) => {
  const authToken = localStorage.getItem('idToken');
  try {
    const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-stats`, {
      params: {
        operation: 'fetchShopDetails',
        laundryId,
      },
      headers: {
        // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
        'Authorization': `Bearer ${authToken}`
      },
    });
    return response.data.body || { name: 'N/A', address: 'N/A', phone: 'N/A', email: 'N/A' };
  } catch (error) {
    console.error('Error fetching shop details:', error);
    throw new Error('Failed to fetch shop details.');
  }
};

export const fetchMonthlySummary = async (laundryId) => {
  const authToken = localStorage.getItem('idToken');
  try {
    const response = await axios.get(`${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-stats`, {
      params: {
        operation: 'monthlySummary',
        laundryId,
      },
      headers: {
        // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
        'Authorization': `Bearer ${authToken}`
      },
    });
    return response.data.body || { totalOrders: 0, averageCost: 0.0 , monthlySales: 0.0 };
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    throw new Error('Failed to fetch monthly summary.');
  }
};

const AdminHomePage = () => {
  const { laundryId } = useParams();
  const [summary, setSummary] = useState({ totalOrders: 0, averageCost: 0.0 ,monthlySales:0.0});
  const [shopInfo, setShopInfo] = useState({ name: '', address: '', phone: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [reportRange, setReportRange] = useState('');
  const [dateRangeError, setDateRangeError] = useState(null);
  const toast = useToast();
  const authToken = localStorage.getItem('idToken');


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, shopData] = await Promise.all([
          fetchMonthlySummary(laundryId),
          fetchShopDetails(laundryId),
        ]);
        setSummary(summaryData);
        setShopInfo(shopData);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [laundryId]);

  useEffect(() => {
    if (!reportRange) {
      setDateRangeError(null);
      return;
    }

    if (reportRange === 'custom_date_range' && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);

      if (start > end) {
        setDateRangeError('End date cannot be earlier than start date.');
        return;
      }

      const dayDiff = (end - start) / (1000 * 60 * 60 * 24);
      if (dayDiff > 180) {
        setDateRangeError('Date range cannot exceed 6 months.');
        return;
      }
      setDateRangeError(null);
    } else {
      setDateRangeError(null);
    }
  }, [reportRange, customStart, customEnd]);

  useEffect(() => {
    if (dateRangeError) {
      toast({
        title: 'Invalid Date Range',
        description: dateRangeError,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  }, [dateRangeError, toast]);

  const getUTCDateRange = (range, customStart, customEnd) => {
    const now = new Date();
    let start_date, end_date;

    const toUTCMidnight = (date) => {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
    };

    // Converts a JS Date to an ISO string with microsecond precision
    const toISOStringWithMicroseconds = (date) => {
      const isoString = date.toISOString(); // standard: "YYYY-MM-DDTHH:MM:SS.mmmZ"
      // Replace .mmm with .mmm000 to simulate microseconds (actual precision is limited to ms)
      return isoString.replace(/\.(\d{3})Z$/, `.$1000Z`);
    };

    if (range === "today") {
      start_date = toISOStringWithMicroseconds(toUTCMidnight(now));
      end_date = toISOStringWithMicroseconds(new Date(toUTCMidnight(now).setUTCHours(23, 59, 59)));
    } else if (range === "last_7_days") {
      start_date = toISOStringWithMicroseconds(toUTCMidnight(new Date(now.setUTCDate(now.getUTCDate() - 7))));
      end_date = toISOStringWithMicroseconds(toUTCMidnight(new Date()));
    } else if (range === "last_30_days") {
      start_date = toISOStringWithMicroseconds(toUTCMidnight(new Date(now.setUTCDate(now.getUTCDate() - 30))));
      end_date = toISOStringWithMicroseconds(toUTCMidnight(new Date()));
    } else if (range === "custom_date_range" && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      start_date = toISOStringWithMicroseconds(toUTCMidnight(start));
      end_date = toISOStringWithMicroseconds(toUTCMidnight(end));
    }

    return { start_date, end_date };
  };

  const handleGenerateReport = async () => {
    const { start_date, end_date } = getUTCDateRange(reportRange, customStart, customEnd);
    try {
      const response = await axios.post(
          `${process.env.REACT_APP_AWS_API_URL}/api/admin/generate-reports`,
          {
            start_date: start_date,
            end_date: end_date,
            operation: 'generateReports',
            laundryId: laundryId,
          },
          {
            params: {
              operation: 'generateReports',
              laundryId: laundryId,
            },
            headers: {
              // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
              'Authorization': `Bearer ${authToken}`
            },
          }
      );

      toast({
        title: 'Report Generated',
        description: response.data.message || 'Report generated successfully.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while generating the report.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  if (loading) {
    return (
      <Box padding={6}>
        <Spinner size="xl" color="blue.500" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={6}>
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          {error}
        </Alert>
      </Box>
    );
  }

  const todayLocalISO = new Date().toISOString().split('T')[0];

  return (
    <Box padding={6}>
      <Heading as="h1" size="lg" mb={6}>
        Admin Dashboard
      </Heading>
      <Text fontSize="md" mb={4}>
        Welcome to the Admin Home Page. Use the navigation to manage orders.
      </Text>
      <Box bg="#F7FAFC" p={4} mb={6} borderRadius="md" boxShadow="sm">
        <Heading as="h2" size="md" mb={2}>
          Laundry Shop Details
        </Heading>
        <Text><strong>Name:</strong> {shopInfo.name}</Text>
        <Text><strong>Address:</strong> {shopInfo.address}</Text>
        <Text><strong>Phone:</strong> {shopInfo.phone}</Text>
        <Text><strong>Email:</strong> {shopInfo.email}</Text>
      </Box>
      <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={6}>
        <GridItem bg="#F7FAFC" p={4} borderRadius="md" boxShadow="sm">
          <Text fontSize="lg" fontWeight="bold" mb={2}>
            Total Orders (This Month)
          </Text>
          <Text fontSize="3xl" color="blue.700">
            {summary.totalOrders}
          </Text>
        </GridItem>
        <GridItem bg="#F7FAFC" p={4} borderRadius="md" boxShadow="sm">
          <Text fontSize="lg" fontWeight="bold" mb={2}>
            Total Sales (This Month)
          </Text>
          <Text fontSize="3xl" color="purple.700">
            ${summary.monthlySales.toFixed(2)}
          </Text>
        </GridItem>
        <GridItem bg="#F7FAFC" p={4} borderRadius="md" boxShadow="sm">
          <Text fontSize="lg" fontWeight="bold" mb={2}>
            Average Order Cost
          </Text>
          <Text fontSize="3xl" color="green.700">
            ${summary.averageCost.toFixed(2)}
          </Text>
        </GridItem>
        <GridItem bg="#F7FAFC" p={4} borderRadius="md" boxShadow="sm">
          <Text fontSize="lg" fontWeight="bold" mb={2}>
            Generate Reports
          </Text>
          <FormControl mb={4}>
            <Select value={reportRange}
                onChange={(e) => setReportRange(e.target.value)} >
              <option value="" disabled>
                Choose a Report Range
              </option>
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="custom_date_range">Custom Date Range</option>

            </Select>
          </FormControl>

          {/* Show Date Inputs If Custom Date Range Is Selected */}
          {reportRange === 'custom_date_range' && (
              <Grid templateColumns="1fr 1fr" gap={4} mb={4}>
                {/* Start Date Input */}
                <FormControl>
                  <FormLabel>Start Date</FormLabel>
                  <input
                      type="date"
                      value={customStart}
                      max={todayLocalISO}
                      onChange={(e) => {
                        setCustomStart(e.target.value);

                        // Automatically adjust End Date if it's before the new Start Date
                        if (customEnd && new Date(e.target.value) >= new Date(customEnd)) {
                          const nextDay = new Date(e.target.value);
                          nextDay.setDate(nextDay.getDate() + 1); // Add 1 day
                          setCustomEnd(nextDay.toISOString().split('T')[0]); // Format as YYYY-MM-DD
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '5px',
                        border: '1px solid #ccc'
                      }}
                  />
                </FormControl>

                {/* End Date Input */}
                <FormControl>
                  <FormLabel>End Date</FormLabel>
                  <input
                      type="date"
                      value={customEnd}
                      min={customStart ? new Date(new Date(customStart).setDate(new Date(customStart).getDate() + 1)).toISOString().split('T')[0] : ''}
                      max={todayLocalISO}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '5px',
                        border: '1px solid #ccc'
                      }}
                  />
                </FormControl>
              </Grid>
          )}

          <Button colorScheme="blue" onClick={handleGenerateReport}
                  disabled={ !reportRange || (reportRange === 'custom_date_range' && (!customStart || !customEnd || dateRangeError) ) }>
            Generate Report
          </Button>
        </GridItem>
      </Grid>
    </Box>

  );
};

export default AdminHomePage;

