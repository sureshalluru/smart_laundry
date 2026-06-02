import boto3
import json
import logging
from boto3.dynamodb.conditions import Key

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
employee_table = dynamodb.Table('Employee')

ROLE_PERMISSIONS = {
    "Attendant": ["validateEmployeeCredentials"],
    "LaundryCare Specialist": ["validateEmployeeCredentials"],
    "Manager": ["validateEmployeeCredentials", "showAllEmployees", "createEmployee"],
    "Employee": ["validateEmployeeCredentials"],
    "Admin": ["validateEmployeeCredentials"],
    "Delivery Driver": ["validateEmployeeCredentials"]
}


def lambda_handler(event, context):
    """
    Lambda to handle different operations, including validating employee credentials.
    """
    logger.info("Lambda invoked with event: %s", event)
    try:
        # Parse query string parameters
        query_params = event.get("queryStringParameters", {})
        operation = query_params.get("operation")
        logger.info("Operation received: %s", operation)

        if not operation:
            logger.error("Missing required query parameter: operation")
            return generate_response(400, {"message": "Missing required query parameter: operation"})

        if operation == "validateEmployeeCredentials":
            # Parse input parameters from the body
            body = event.get("body", {})
            if isinstance(body, str):
                logger.info("Parsing stringified JSON body")
                body = json.loads(body)
            elif not isinstance(body, dict):
                logger.error("Invalid body format")
                return generate_response(400, {"message": "Invalid body format"})

            # Extract parameters
            laundryId = body.get("laundryId")
            empId = body.get("empId")
            passcode = body.get("passcode")
            logger.info("Received credentials - laundryId: %s, empId: %s", laundryId, empId)

            # Input validation
            if not laundryId or not empId or not passcode:
                logger.error("Missing required parameters: laundryId, empId, or passcode")
                return generate_response(400, {"message": "Missing required parameters: laundryId, empId, or passcode"})

            # Call the validation function
            result = validate_credentials(laundryId, empId, passcode, operation)
            logger.info("Validation result: %s", result)
            return generate_response(200, result)
        else:
            logger.error("Unsupported operation: %s", operation)
            return generate_response(400, {"message": f"Unsupported operation: {operation}"})

    except Exception as e:
        logger.exception("Error in lambda_handler")
        return generate_response(500, {"message": "Internal Server Error"})

# def validate_credentials(laundryId, empId, passcode, operation):
#     """
#     Validates employee credentials from the Employee table and checks role-based permissions.
#     """
#     try:
#         # Query DynamoDB
#         response = employee_table.query(
#             KeyConditionExpression=Key('empId').eq(empId) & Key('laundryId').eq(laundryId)
#         )
#         if response.get('Items'):
#             employee = response['Items'][0]
#             if employee.get('passcode') == passcode:
#                 role = employee.get('role', 'Employee')  # Default role to 'Employee'
#                 if operation in ROLE_PERMISSIONS.get(role, []):
#                     return {"isValidated": True, "empId": empId}
#                 else:
#                     return {"isValidated": False, "empId": empId, "error": "Unauthorized action for this role"}
#         # Invalid credentials
#         return {"isValidated": False, "empId": empId, "error": "Invalid credentials"}

#     except Exception as e:
#         print(f"Error validating credentials: {str(e)}")
#         return {"isValidated": False, "error": str(e)}

def validate_credentials(laundryId, empId, passcode, operation):
    """
    Validates employee credentials from the Employee table and returns the employee's role.
    """
    logger.info("Validating credentials for empId: %s, laundryId: %s", empId, laundryId)
    try:
        # Query DynamoDB
        response = employee_table.query(
            KeyConditionExpression=Key('empId').eq(empId) & Key('laundryId').eq(laundryId)
        )
        logger.info("DynamoDB query response: %s", response)

        if response.get('Items'):
            employee = response['Items'][0]
            logger.info("Employee record found for empId: %s", empId)
            if employee.get('passcode') == passcode:
                role = employee.get('role')
                logger.info("Employee passcode validated; role: %s", role)
                if operation in ROLE_PERMISSIONS.get(role, []):
                    return {
                        "isValidated": True,
                        "empId": empId,
                        "role": role
                    }
                else:
                    logger.warning("Unauthorized action for role: %s", role)
                    return {
                        "isValidated": False,
                        "empId": empId,
                        "role": role,
                        "error": "Unauthorized action for this role"
                    }

        logger.warning("Invalid credentials for empId: %s", empId)
        return {
            "isValidated": False,
            "empId": empId,
            "role": None,
            "error": "Invalid credentials"
        }

    except Exception as e:
        logger.exception("Error validating credentials for empId: %s", empId)
        return {
            "isValidated": False,
            "error": str(e),
            "role": None
        }


def generate_response(status_code, body):
    """
    Generates a response for the API Gateway.
    """
    logger.info("Generating response with statusCode: %s, body: %s", status_code, body)
    return {
        "statusCode": status_code,
        "body": body
    }
