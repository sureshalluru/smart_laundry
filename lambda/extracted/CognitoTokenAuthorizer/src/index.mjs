import { CognitoJwtVerifier } from "aws-jwt-verify";

// Create a verifier that expects valid access tokens:
const verifier = CognitoJwtVerifier.create({
  userPoolId: "us-east-1_54Ly6WLVN",
  tokenUse: "id",
  clientId: "1nbbfeeuvlthdf6gr2ogos2jfp",
});

export const handler = async (event) => {
  console.log("=== Lambda Authorizer Started ===");
  console.log("Full incoming event:", JSON.stringify(event));
  console.log("Method ARN:", event.methodArn); // Add this for debuggin

  try {
    // Log headers
    console.log("Received headers:", JSON.stringify(event.headers));

    // Extract token from Authorization header (case-insensitive)
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    console.log("Authorization header value:", authHeader || "Not provided");

    const token = authHeader ? authHeader.split(" ")[1] : null;
    console.log("Extracted token snippet:", token ? token.slice(0, 20) + "..." : "No token extracted");

    if (!token) {
      console.log("No valid token provided.");
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Verify the token
    console.log("Verifying token...");
    const payload = await verifier.verify(token);
    console.log("Token verified successfully. Payload:", JSON.stringify(payload));

    // Extract laundryId from request:
    let requestLaundryId;
    console.log("Extracting laundryId from the request...");
    if (event.queryStringParameters && event.queryStringParameters.laundryId) {
      requestLaundryId = event.queryStringParameters.laundryId;
      console.log("Found laundryId in query string parameters:", requestLaundryId);
    } else if (event.headers) {
      console.log("Attempting to extract laundryId from the body...");
      try {
        requestLaundryId = event.headers?.['X-Amz-Date'] || event.headers?.['x-amz-date'];
        console.log("Found laundryId in the body:", requestLaundryId);
      } catch (e) {
        console.log("Error parsing the request body:", e);
      }
    } else {
      console.log("No laundryId found in query parameters or body.");
    }

    // Get the custom laundryId from the Cognito token payload
    const cognitoLaundryId = payload['custom:laundryId'];
    console.log(`Token's custom:laundryId: ${cognitoLaundryId}`);
    console.log(`Request's laundryId: ${requestLaundryId}`);

    // Compare values (using string conversion to avoid type issues)
    if (
      requestLaundryId &&
      cognitoLaundryId &&
      String(requestLaundryId).trim() === String(cognitoLaundryId).trim()
    ) {
      console.log("Laundry ID match found. Generating Allow policy...");
      return generatePolicy(payload.sub, 'Allow', event.methodArn, {
        userId: payload.sub,
        laundryId: cognitoLaundryId,
        scope: payload.scope,
      });
    }

    console.log("Laundry ID mismatch or missing. Generating Deny policy...");
    return generatePolicy(payload.sub, 'Deny', event.methodArn);
  } catch (error) {
    console.error("Token verification or processing error:", error);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

// Helper function to generate IAM policy for API Gateway
function generatePolicy(principalId, effect, resource, context) {
  console.log("Generating policy for principal:", principalId);
  console.log("Policy details - Effect:", effect, "Resource:", resource, "Context:", JSON.stringify(context));
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      }],
    },
    context,
  };
}
