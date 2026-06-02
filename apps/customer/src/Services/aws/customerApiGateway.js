import axios from "axios";

export const validateAddressAPI = async (laundryId,address) => {
     try {
         // Return the payload from the response
        return await axios.get(
            `${process.env.REACT_APP_AWS_API_URL}/api/laundry/validate-address`,
            {
                params: {
                    operation: 'validateAddress',
                    laundryId: laundryId,
                    address: address,
                },
                headers: {
                    'x-api-key': process.env.REACT_APP_AWS_API_KEY
                }
            }
        );
    } catch (error) {
        console.error("Error Validating address:", error);
        throw new Error("Unable to check phone number");
    }
};

