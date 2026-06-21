from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://localhost:5432/smart_laundry"
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "smart_laundry"
    db_user: str = "postgres"
    db_password: str = ""

    # JWT (self-hosted auth — replaces Cognito)
    jwt_secret_key: str = "change-this-to-a-random-secret-in-production"

    # AWS Cognito (legacy — remove after full migration)
    cognito_user_pool_id: str = "us-east-1_54Ly6WLVN"
    cognito_client_id: str = "1nbbfeeuvlthdf6gr2ogos2jfp"
    cognito_region: str = "us-east-1"

    # Stripe
    stripe_secret_key: str = ""

    # Twilio (SMS)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_verify_service_sid: str = ""

    # AWS SES (Email) — DEPRECATED, use Brevo instead
    source_email: str = ""
    aws_region: str = "us-east-1"

    # Brevo (email — replaces AWS SES)
    brevo_api_key: str = ""

    # Uber
    uber_client_id: str = ""
    uber_client_secret: str = ""
    uber_customer_id: str = ""

    # Google Maps
    google_maps_api_key: str = ""

    # S3
    s3_logo_bucket: str = "laundrylogos"
    s3_review_bucket: str = "laundry-review-images"
    s3_tracking_bucket: str = "laundry-item-tracking"

    # Anthropic (Claude Vision for item tracking)
    anthropic_api_key: str = ""

    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
