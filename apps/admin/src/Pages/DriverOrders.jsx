// src/api/fetchDriverOrders.js

import axios from 'axios';

export const fetchDriverOrders = async (laundryId, startDate, endDate) => {
  const authToken = localStorage.getItem('idToken');  // optional if not used
  const url = `${process.env.REACT_APP_AWS_API_URL}/api/driver/laundry-orders-info`;
  const operation = "getDriverOrdersByDate";
  // console.log("authToken", authToken);

  try {
    const params = {
      operation,
      laundryId,
    };

    const body = {
      startDate,
      endDate,
    };

    const headers = {
        "Content-Type": "application/json",
        'Authorization': `Bearer ${authToken}`, 
      };

    const response = await axios.post(url, body, { params, headers });
    console.log("Fetched orders:", response);
    // console.log("Dates:", startDate, endDate);

    if (response.status === 200 && response.data.body?.orders) {
        // console.log("Fetched orders:", response.data.body.orders);
        return response.data.body.orders;
      }
      

    return [];
  } catch (error) {
    console.error('Error fetching driver orders:', error);
    return [];
  }
};
