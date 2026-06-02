import os
import boto3
import json
import logging
from botocore.exceptions import ClientError
from twilio.rest import Client
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import base64
import time

# Configure logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize SES client
ses_client = boto3.client('ses')

# Twilio test credentials and phone number
# TWILIO_ACCOUNT_SID = os.environ.get("TEST_TWILIO_ACCOUNT_SID")
# TWILIO_AUTH_TOKEN = os.environ.get("TEST_TWILIO_AUTH_TOKEN")
# TWILIO_PHONE_NUMBER = os.environ.get("TEST_TWILIO_PHONE_NUMBER")

# Twilio Live credentials and phone number
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER")
SOURCE_EMAIL = os.environ.get("SOURCE_EMAIL")

# Initialize Twilio client
twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

def lambda_handler(event, context):
    start_time = time.time()
    try:
        
        logger.info(f"Start Time: {start_time}")

        logger.info("Lambda function invoked with event: %s", json.dumps(event))
        # Extract notification parameters from the event
        notification_type = event.get("type")
        recipient = event.get("recipient")
        sender = event.get("sender")  # For email notifications
        subject = event.get("subject", "")
        message = event.get("message")
        attachment = event.get("attachment")

        logger.info("Notification Type: %s", notification_type)
        logger.info("Recipient: %s", recipient)
        logger.info("Sender: %s", sender if notification_type == "email" else "N/A")
        logger.info("Subject: %s", subject if notification_type == "email" else "N/A")
        logger.info("Message: %s", message)

        # Validate parameters
        if not notification_type or not recipient or not message:
            error_message = "Missing required parameters: 'type', 'recipient', 'message'"
            logger.error(error_message)
            return {
                "statusCode": 400,
                "body": json.dumps({"message": error_message})
            }

        # Handle notification types
        if notification_type == "email_with_attachment":
            if not attachment or not subject:
                return _error("Missing attachment or subject for email with attachment")
            logger.info(f"End Time email_with_attachment: {time.time()}, Total Duration: {time.time() - start_time:.2f}s")

            return send_email_with_attachment(sender, recipient, subject, message, attachment)

        elif notification_type == "email":
            if not sender:
                error_message = "Missing required parameter: 'sender' for email notifications"
                logger.error(error_message)
                logger.info(f"End Time email: {time.time()}, Total Duration: {time.time() - start_time:.2f}s")

                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": error_message})
                }
            if not subject:
                error_message = "Missing required parameter: 'subject' for email notifications"
                logger.error(error_message)
                logger.info(f"End Time: {time.time()}, Total Duration: {time.time() - start_time:.2f}s")

                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": error_message})
                }
            return send_email_notification(sender, recipient, subject, message)
        elif notification_type == "sms":
            logger.info(f"End Time sms: {time.time()}, Total Duration: {time.time() - start_time:.2f}s")

            return send_sms_notification(recipient, message)
        
        else:
            error_message = "Invalid notification type. Use 'email' or 'sms'."
            logger.error(error_message)
            logger.info(f"End Time error: {time.time()}, Total Duration: {time.time() - start_time:.2f}s")

            return {
                "statusCode": 400,
                "body": json.dumps({"message": error_message})
            }

    except Exception as e:
        logger.exception("Error in lambda_handler: %s", str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Internal server error: {str(e)}"})
        }

def send_email_notification(sender, recipient, subject, message):
    # SOURCE_EMAIL = "spinandshinelaundromat@gmail.com"
    full_start = time.time()
    
    try:
        logger.info("Sending email to %s with subject '%s'", recipient, subject)
        pre_ses_time = time.time()
        logger.info(f"📨 SES Send Start Time: {pre_ses_time}")
        
        response = ses_client.send_email(
            Source=sender, 
            Destination={"ToAddresses": [recipient]},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Html": {"Data": message}}
            }
        )

        post_ses_time = time.time()
        total_duration = post_ses_time - full_start
        ses_duration = post_ses_time - pre_ses_time
        non_ses_gap = total_duration - ses_duration

        logger.info(f"✅ SES Send Completed in {ses_duration:.2f}s")
        logger.info(f"🕰️ Total Function Duration: {total_duration:.2f}s")
        logger.info(f"🧮 Delay Before SES Call (gap): {non_ses_gap:.2f}s")
        logger.info(f"🔁 SES API Response: {json.dumps(response)}")

        logger.info("Email sent successfully: %s", response)

        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Email sent successfully to {recipient}"})
        }
    except ClientError as e:
        error_message = e.response['Error']['Message']
        logger.error("Failed to send email: %s", error_message)

        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Failed to send email: {error_message}"})
        }

def send_sms_notification(phone_number, message):
    try:
        logger.info("Sending SMS to %s with message '%s'", phone_number, message)
        response = twilio_client.messages.create(
            to=phone_number,
            from_=TWILIO_PHONE_NUMBER,
            body=message
        )
        logger.info("Twilio Response: %s", response)
        logger.info("Message SID: %s", response.sid)
        logger.info("Message Status: %s", response.status)
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"SMS sent successfully to {phone_number}", "sid": response.sid})
        }
    except Exception as e:
        logger.exception("Failed to send SMS: %s", str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Failed to send SMS: {str(e)}"})
        }

# def safe_base64_decode(b64_string):
#     # Add missing padding (=) if needed
#     padding_needed = 4 - (len(b64_string) % 4)
#     if padding_needed and padding_needed != 4:
#         b64_string += '=' * padding_needed
#     return base64.b64decode(b64_string)

# # Send email with base64 attachment (PDF or other)
# def send_email_with_attachment(sender, recipient, subject, html_message, attachment):
#     try:
#         msg = MIMEMultipart()
#         msg['Subject'] = subject
#         msg['From'] = sender
#         msg['To'] = recipient

#         msg.attach(MIMEText(html_message, 'html'))

#         # Attach file
#         # part = MIMEApplication(base64.b64decode(attachment['base64']))
#         decoded_file = safe_base64_decode(attachment['base64'])
#         part = MIMEApplication(decoded_file, _subtype="pdf")
#         part.add_header(
#             'Content-Disposition',
#             'attachment',
#             filename=attachment['fileName']
#         )
#         msg.attach(part)

#         response = ses_client.send_raw_email(
#             Source=sender,
#             Destinations=[recipient],
#             RawMessage={'Data': msg.as_string()}
#         )
#         logger.info("Email with attachment sent: %s", response)
#         return {
#             "statusCode": 200,
#             "body": json.dumps({"message": f"Email with attachment sent to {recipient}"})
#         }

#     except Exception as e:
#         logger.exception("Failed to send email with attachment")
#         return _error(f"Failed to send email with attachment: {str(e)}")

def _error(msg):
    logger.error(msg)
    return {
        "statusCode": 400,
        "body": json.dumps({"message": msg})
    }


def safe_base64_decode(b64_string):
    padding_needed = 4 - (len(b64_string) % 4)
    if padding_needed and padding_needed != 4:
        b64_string += '=' * padding_needed
    return base64.b64decode(b64_string)

# Send email with base64 attachment (PDF or other)
def send_email_with_attachment(sender, recipient, subject, html_message, attachment):
    try:
        msg = MIMEMultipart()
        msg['Subject'] = subject
        msg['From'] = sender
        msg['To'] = recipient

        # Attach HTML message body
        msg.attach(MIMEText(html_message, 'html'))

        # Decode the base64 file
        decoded_file = safe_base64_decode(attachment['base64'])

        # Create and encode attachment part
        part = MIMEBase("application", "pdf")
        part.set_payload(decoded_file)
        encoders.encode_base64(part)

        # Add headers and attach to email
        part.add_header(
            'Content-Disposition',
            'attachment',
            filename=attachment['fileName']
        )
        msg.attach(part)

        # Send raw email
        response = ses_client.send_raw_email(
            Source=sender,
            Destinations=[recipient],
            RawMessage={'Data': msg.as_string()}
        )
        logger.info("Email with attachment sent: %s", response)
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Email with attachment sent to {recipient}"})
        }

    except Exception as e:
        logger.exception("Failed to send email with attachment")
        return _error(f"Failed to send email with attachment: {str(e)}")
