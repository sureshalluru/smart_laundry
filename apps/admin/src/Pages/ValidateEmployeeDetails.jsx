import axios from 'axios';
import {fetchLaundryInfoById} from "./LaundryInfoManagement";
import { toast } from "@chakra-ui/react";

export const validateEmpCredentials = async (laundryId, empId, passcode) => {
    const authToken = localStorage.getItem('idToken');


    try {
        const url = `${process.env.REACT_APP_AWS_API_URL}/api/admin/validate-emp-credentials`;
    
        const payload = {
            laundryId: laundryId,
            empId: empId,
            passcode: passcode
        };
    
        const response = await axios.post(
            url,
            payload,
            {
                params: {
                    operation: 'validateEmployeeCredentials',
                },
                headers: {
                    // 'x-api-key': process.env.REACT_APP_AWS_API_KEY
                    'X-Amz-Date': laundryId,
                    'Authorization': `Bearer ${authToken}`
                },
            }
        );
        const { isValidated, role } = response.data.body;
        // console.log("Validation Response:", response.data);
        return { isValidated, role };;
    } catch (error) {
        console.error("Error validating credentials:", error);
        return { isValidated: false, role: null };
    }
    
};

export const fetchPrefix = async (laundryId) => {
    try {
      const laundryInfo = await fetchLaundryInfoById(laundryId);
      const prefix = laundryInfo?.laundryInfo?.[0]?.empPrefix || '';
    //   console.log("Fetched empPrefix:", prefix);
      return prefix; // ✅ you are returning it here
    } catch (error) {
      console.error("Error fetching prefix:", error);
      return ''; // ✅ even in case of error, returns an empty string
    }
  };
  