import boto3
import json
import time
import random
import re
import logging
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB resources
dynamodb = boto3.resource('dynamodb')
employee_table = dynamodb.Table('Employee')
shop_info_table = dynamodb.Table('LaundryShopInfo')

# Notification Lambda name
NOTIFICATION_LAMBDA_NAME = "customerNotificationService"

# Initialize AWS Lambda client
lambda_client = boto3.client('lambda')


def lambda_handler(event, context):
    try:
        logger.info("Event received: %s", event)
        query_params = event.get("queryStringParameters", {})
        operation = query_params.get("operation")
        if not operation:
            logger.error("Missing required query parameter: operation")
            return generate_response(400, {"message": "Missing required query parameter: operation"})

        if operation == "createEmployee":
            return handle_create_employee(event)
        elif operation == "sendEmpCredentials":
            emp_id = query_params.get("empId")
            laundry_id = query_params.get("laundryId")
            return handle_send_emp_credentials(emp_id, laundry_id)
        elif operation == "showAllEmployees":
            laundry_id = query_params.get("laundryId")  # Optional parameter
            return handle_show_all_employees(laundry_id)
        elif operation == "deleteEmployee":
            body = event.get("body", {})
            if isinstance(body, str):
                body = json.loads(body)
            emp_id = body.get("empId")
            laundry_id = query_params.get("laundryId")
            return handle_delete_employee(emp_id, laundry_id)
        else:
            logger.error("Unsupported operation: %s", operation)
            return generate_response(400, {"message": f"Unsupported operation: {operation}"})
    except Exception as e:
        logger.exception("Error in lambda_handler")
        return generate_response(500, {"message": "Internal Server Error"})


def handle_create_employee(event):
    body = event.get("body", {})
    if isinstance(body, str):
        body = json.loads(body)
    elif not isinstance(body, dict):
        logger.error("Invalid body format")
        return generate_response(400, {"message": "Invalid body format"})

    # Support bulk employee creation
    employees = body if isinstance(body, list) else [body]
    created_employees = []
    failed_employees = []

    for employee_data in employees:
        try:
            logger.info("Validating employee data: %s", employee_data)
            validate_employee_data(employee_data)

            # Extract parameters
            first_name = employee_data["firstName"]
            last_name = employee_data["lastName"]
            joining_date = employee_data["joiningDate"]
            role = employee_data["role"]
            phone = employee_data["phone"]
            email = employee_data["email"]
            address = employee_data["address"]
            laundry_id = employee_data["laundryId"]

            # Retrieve shop details
            shop_details = get_laundry_shop_details(laundry_id)
            if "error" in shop_details:
                raise ValueError(shop_details["error"])
            laundry_name = shop_details.get("laundryName")
            shop_email = shop_details.get("email")

            # Generate empId and passcode
            emp_id = generate_emp_id()
            passcode = generate_jumbled_name_number_passcode(first_name, last_name)

            # Create the employee entry with a condition to avoid overwrites
            logger.info("Creating employee with empId: %s", emp_id)
            create_employee(emp_id, first_name, last_name, joining_date, role, phone, email, address, laundry_id, passcode)

            

            # Notify the employee
            email_body = create_email_body(first_name, emp_id, passcode, laundry_name)
            notify_employee(email, f"Welcome to {laundry_name}", email_body, shop_email)

            logger.info("Employee created: %s", emp_id)
            created_employees.append({"empId": emp_id, "email": email})

        except ValueError as ve:
            logger.error("Validation Error: %s", ve)
            failed_employees.append({"data": employee_data, "error": str(ve)})
        except ClientError as ce:
            error_message = ce.response['Error']['Message']
            logger.error("DynamoDB Error: %s", error_message)
            failed_employees.append({"data": employee_data, "error": error_message})
        except Exception as ex:
            logger.exception("Unexpected error while creating employee")
            failed_employees.append({"data": employee_data, "error": str(ex)})

    response_body = {
        "createdEmployees": created_employees,
        "failedEmployees": failed_employees
    }
    status = 201 if created_employees else 400
    logger.info("handle_create_employee response: %s", response_body)
    return generate_response(status, response_body)


def handle_send_emp_credentials(emp_id, laundry_id):
    if not emp_id or not laundry_id:
        logger.error("Missing required parameters: empId and laundryId")
        return generate_response(400, {"message": "Missing required parameters: empId and laundryId"})

    employee = get_employee_details(emp_id, laundry_id)
    if not employee:
        logger.error("Employee not found for empId: %s, laundryId: %s", emp_id, laundry_id)
        return generate_response(404, {"message": "Employee not found"})

    shop_details = get_laundry_shop_details(laundry_id)
    if "error" in shop_details:
        raise ValueError(shop_details["error"])

    laundry_name = shop_details.get("laundryName")
    shop_email = shop_details.get("email")
    email_body = notify_email_body(employee["firstName"], emp_id, employee["passcode"], laundry_name)
    notify_employee(employee["email"], f"Your Credentials for {laundry_name}", email_body, shop_email)

    logger.info("Credentials sent to employee: %s", employee["email"])
    return generate_response(200, {"message": f"Credentials sent to {employee['email']}"})


def notify_email_body(first_name, emp_id, passcode, laundry_name):
    return f"""
    <html>
        <body style="font-family: Arial, sans-serif; text-align: center; background-color: #f9f9f9; padding: 20px;">
            <div style="background-color: #ffffff; border-radius: 10px; padding: 20px; max-width: 600px; margin: auto;">
                <h2 style="color: #4CAF50;">Your {laundry_name} Login Credentials</h2>
                <p style="font-size: 16px; color: #555555;">
                    Dear {first_name},
                </p>
                <p style="font-size: 16px; color: #555555;">
                    Below are your login credentials for accessing {laundry_name} systems:
                </p>
                <p style="font-size: 18px; color: #333333;">
                    <strong>Employee ID:</strong> {emp_id}
                </p>
                <p style="font-size: 18px; color: #333333;">
                    <strong>Passcode:</strong> {passcode}
                </p>
                <p style="font-size: 16px; color: #555555; margin-top: 20px;">
                    Please keep this information secure and do not share it with anyone.
                </p>
                <p style="font-size: 16px; color: #555555; margin-top: 20px;">
                    Best Regards,<br>
                    <strong>{laundry_name} Team</strong>
                </p>
            </div>
        </body>
    </html>
    """


def validate_employee_data(employee):
    required_fields = ["firstName", "lastName", "joiningDate", "role", "phone", "email", "address", "laundryId"]
    for field in required_fields:
        if field not in employee or not employee[field]:
            logger.error("Missing required parameter: %s", field)
            raise ValueError(f"Missing required parameter: {field}")

    if not re.match(r"[^@]+@[^@]+\.[^@]+", employee["email"]):
        logger.error("Invalid email format: %s", employee["email"])
        raise ValueError("Invalid email format")

    if not re.match(r"^\d{10}$", employee["phone"]):
        logger.error("Invalid phone number: %s", employee["phone"])
        raise ValueError("Invalid phone number. Must be 10 digits.")
    # valid_roles = ["Admin", "Manager", "Delivery Executive"]
    # if employee["role"] not in valid_roles:
    #     raise ValueError(f"Invalid role. Must be one of {valid_roles}")
    validate_address(employee["address"])


def validate_address(address):
    required_fields = ["street", "city", "state", "country", "zipCode"]
    for field in required_fields:
        if field not in address or not address[field]:
            logger.error("Missing required address field: %s", field)
            raise ValueError(f"Missing required address field: {field}")


def create_employee(emp_id, first_name, last_name, joining_date, role, phone, email, address, laundry_id, passcode):
    employee = {
        "empId": emp_id,
        "firstName": first_name,
        "lastName": last_name,
        "joiningDate": joining_date,
        "role": role,
        "phone": phone,
        "email": email,
        "address": address,
        "laundryId": laundry_id,
        "passcode": passcode,
        "createdAt": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    }
    logger.info("Putting employee item into DynamoDB: %s", employee)
    employee_table.put_item(
        Item=employee,
        ConditionExpression="attribute_not_exists(empId)"
    )


def get_employee_details(emp_id, laundry_id):
    try:
        response = employee_table.get_item(Key={"empId": emp_id, "laundryId": laundry_id})
        logger.info("Fetched employee details: %s", response.get("Item"))
        return response.get("Item")
    except Exception as e:
        logger.exception("Error fetching employee details for empId: %s, laundryId: %s", emp_id, laundry_id)
        return None


def create_email_body(first_name, emp_id, passcode, laundry_name):
    return f"""
    <html>
        <body style="font-family: Arial, sans-serif; text-align: center; background-color: #f9f9f9; padding: 20px;">
            <div style="background-color: #ffffff; border-radius: 10px; padding: 20px; max-width: 600px; margin: auto;">
                <h1 style="color: #4CAF50;">🎉 Welcome to {laundry_name}, {first_name}! 🎉</h1>
                <p style="font-size: 16px; color: #555555;">
                    We are thrilled to have you on board as part of our team!
                </p>
                <p style="font-size: 16px; color: #555555;">
                    Your employee account has been successfully created. Below are your credentials:
                </p>
                <p style="font-size: 18px; color: #333333;">
                    <strong>Employee ID:</strong> {emp_id}
                </p>
                <p style="font-size: 18px; color: #333333;">
                    <strong>Passcode:</strong> {passcode}
                </p>
                <p style="font-size: 16px; color: #555555; margin-top: 20px;">
                    We’re looking forward to achieving great things together. Welcome aboard and congratulations!
                </p>
                <img src="https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif" 
                     alt="Congratulations" 
                     style="width: 100%; border-radius: 10px; margin-top: 20px;">
                <p style="font-size: 16px; color: #555555; margin-top: 20px;">
                    Best Regards,<br>
                    <strong>{laundry_name} Team</strong>
                </p>
            </div>
        </body>
    </html>
    """


def notify_employee(recipient, subject, email_body, shop_email):
    try:
        payload = {
            "type": "email",
            "recipient": recipient,
            "sender": shop_email,
            "subject": subject,
            "message": email_body
        }
        logger.info("Invoking notification lambda for recipient: %s", recipient)
        lambda_client.invoke(
            FunctionName=NOTIFICATION_LAMBDA_NAME,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )
    except Exception as e:
        logger.exception("Error notifying employee: %s", recipient)


def generate_emp_id():
    emp_id = str(int(time.time()))[-5:] + str(random.randint(100, 999))
    logger.debug("Generated empId: %s", emp_id)
    return emp_id


def generate_jumbled_name_number_passcode(first_name, last_name, length=8):
    name_initials = first_name[:2].lower() + last_name[:2].lower()
    numbers = ''.join(str(random.randint(0, 9)) for _ in range(length - len(name_initials)))
    passcode = ''.join(random.sample(name_initials + numbers, len(name_initials + numbers)))
    logger.debug("Generated passcode: %s", passcode)
    return passcode


def handle_show_all_employees(laundry_id=None):
    try:
        if laundry_id:
            logger.info("Fetching employees for laundryId: %s", laundry_id)
            response = employee_table.scan(
                FilterExpression=Key('laundryId').eq(laundry_id)
            )
        else:
            logger.error("laundryId not provided for fetching employees")
            return generate_response(500, {"message": "Error fetching employees laundryId not found"})

        employees = response.get("Items", [])
        logger.info("Number of employees fetched: %d", len(employees))
        formatted_employees = [
            {
                "employeeId": emp["empId"],
                "laundryId": emp["laundryId"],
                "fullName": f"{emp['firstName']} {emp['lastName']}",
                "joiningDate": emp["joiningDate"],
                "role": emp["role"],
                "contact": {
                    "email": emp["email"],
                    "phone": emp["phone"]
                }
            }
            for emp in employees
        ]
        return generate_response(200, {"employees": formatted_employees})
    except Exception as e:
        logger.exception("Error fetching employees")
        return generate_response(500, {"message": f"Error fetching employees: {str(e)}"})


def get_laundry_shop_details(laundryId):
    try:
        response = shop_info_table.query(
            KeyConditionExpression=Key('laundryId').eq(laundryId)
        )
        if 'Items' not in response or len(response['Items']) == 0:
            logger.error("No shop details found for laundryId: %s", laundryId)
            return {'error': f'No shop details found for laundryId: {laundryId}'}
        shop = response['Items'][0]
        logger.info("Shop details fetched for laundryId: %s", laundryId)
        contact_details = shop.get("contactDetails", {})
        laundry_address = shop.get("laundryAddress", {})
        return {
            "laundryName": shop.get("laundryName", "N/A"),
            "email": contact_details.get("email", "N/A"),
            "phone": contact_details.get("phoneNumber", "N/A"),
            "address": f"{laundry_address.get('street', '')}, {laundry_address.get('city', '')}, {laundry_address.get('state', '')}, {laundry_address.get('zipCode', '')}".strip(', ')
        }
    except Exception as e:
        logger.exception("Error fetching shop details for laundryId: %s", laundryId)
        return {"error": "Error fetching shop details"}


def generate_response(status_code, body):
    logger.info("Generating response with status: %s, body: %s", status_code, body)
    return {
        "statusCode": status_code,
        "body": body
    }


def handle_delete_employee(emp_id, laundry_id):
    if not emp_id or not laundry_id:
        logger.error("Missing required parameters: empId and laundryId")
        return generate_response(400, {"message": "Missing required parameters: empId and laundryId"})
    try:
        logger.info("Attempting to delete employee with empId: %s, laundryId: %s", emp_id, laundry_id)
        response = employee_table.delete_item(
            Key={
                "empId": emp_id,
                "laundryId": laundry_id
            },
            ConditionExpression="attribute_exists(empId) AND attribute_exists(laundryId)"
        )
        logger.info("Delete Response: %s", response)
        return generate_response(200, {"message": f"Employee with ID {emp_id} successfully deleted."})
    except ClientError as e:
        if e.response['Error']['Code'] == "ConditionalCheckFailedException":
            logger.error("Employee with ID %s not found.", emp_id)
            return generate_response(404, {"message": f"Employee with ID {emp_id} not found."})
        logger.exception("Error deleting employee with empId: %s", emp_id)
        return generate_response(500, {"message": "Error occurred while deleting employee"})
    except Exception as e:
        logger.exception("Unexpected error deleting employee with empId: %s", emp_id)
        return generate_response(500, {"message": "Internal Server Error"})
