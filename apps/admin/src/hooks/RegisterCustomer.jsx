import { handlePhoneNumberCheck, initiateSignUp } from "../Services/aws/UserAuthenticationApiGateway";

// Check if customer exists, else register
const RegisterCustomer = async ({
  laundryId,
  phoneNumber,
  firstName,
  lastName,
  email,
  receivePhoneNotification = true
}) => {
  const modifiedPhoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;

  try {
    // Check if customer exists
    const checkResponse = await handlePhoneNumberCheck(modifiedPhoneNumber, laundryId);
    if (checkResponse.exists) {
      return {
        customerId: checkResponse.customerId,
        specialInstructions: checkResponse.specialInstructions,
        isNew: false
      };
    }

    // Register if not exists
    const { isSignUpComplete, userId, nextStep } = await initiateSignUp(
      laundryId,
      email,
      modifiedPhoneNumber,
      firstName,
      lastName,
      true,
      receivePhoneNotification
    );

    if (isSignUpComplete && nextStep === "DONE") {
      return { customerId: userId, isNew: true };
    } else {
      throw new Error("Sign-up incomplete. Try logging in.");
    }

  } catch (error) {
    console.error("Customer registration/fetch failed:", error);
    throw error;
  }
};


export default RegisterCustomer;