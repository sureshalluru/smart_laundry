# Lambda → FastAPI Migration Guide

## What's Done

### Fully Ported (ready to use)
| Lambda | FastAPI Location | Status |
|--------|-----------------|--------|
| CognitoTokenAuthorizer | `app/auth.py` | ✅ Complete — JWT validation middleware |
| OrdersInformationService (GET) | `app/routes/orders_info.py` | ✅ Complete — order listing, pagination, history |
| ValidationService | `app/routes/validation.py` | ✅ Complete — checkLaundryId, getLaundryInfo |
| PaymentService | `app/services/payment_service.py` + `app/routes/payments.py` | ✅ Complete — all Stripe operations |
| customerNotificationService | `app/services/notification_service.py` + `app/routes/notifications.py` | ✅ Complete — email + SMS |
| validateEmployeeCredentials | `app/routes/employees.py` | ✅ Complete — credential validation |
| LaundryShopService (GET) | `app/routes/laundry_shop.py` | ✅ Complete — view services, products, shop info |

### Scaffolded (structure ready, needs business logic pasted in)
| Lambda | FastAPI Location | What's Needed |
|--------|-----------------|---------------|
| OrdersInformationService (POST) | `app/routes/orders_info.py` | updateOrder, captureInStorePayment — logic is in `lambda/extracted/` |
| OrderService | `app/routes/orders.py` | placeOrder, inStorePlaceOrder, cancelOrder |
| CustomerService | `app/routes/customers.py` | Full customer CRUD, reviews |
| LaundryShopService (POST) | `app/routes/laundry_shop.py` | updateServices, updateProducts, reports |
| EmployeeService | `app/routes/employees.py` | createEmployee, deleteEmployee |
| LaundryPromotionsService | `app/routes/promotions.py` | CRUD promotions, usage tracking |
| UberIntegration | `app/routes/uber.py` | Uber API calls, webhooks |
| OrderFrequencyService | `app/routes/frequency.py` | Scheduled order generation |

## How to Port Remaining Lambdas

Each Lambda's source code is in `lambda/extracted/<ServiceName>/src/`.
The pattern for porting:

1. Read the Lambda's `lambda_function.py`
2. Each `if operation == 'xxx'` block becomes a FastAPI route
3. Replace `import db` with `from app.services.db_compat import db_compat as db`
4. Replace `lambda_client.invoke(FunctionName='PaymentService', ...)` with direct function calls:
   ```python
   from app.services.payment_service import capture_payment
   result = capture_payment(...)
   ```
5. Replace `lambda_client.invoke(FunctionName='customerNotificationService', ...)` with:
   ```python
   from app.services.notification_service import send_notification
   send_notification(...)
   ```

## Key Architecture Changes

| Lambda Pattern | FastAPI Pattern |
|---------------|----------------|
| `lambda_client.invoke(FunctionName='X')` | Direct function call to service module |
| `event.get('queryStringParameters')` | FastAPI `Query()` parameters |
| `event.get('body')` | FastAPI `Body()` parameter |
| `generate_response(200, data)` | `return data` (FastAPI handles HTTP) |
| `db.close()` per invocation | Connection pool (automatic) |
| CloudWatch scheduled event | Render Cron Job calling `/api/frequency/process` |
| API Gateway CORS | FastAPI CORSMiddleware |
| Cognito Authorizer | `app/auth.py` middleware |

## Environment Variables Mapping

| Lambda Env Var | FastAPI .env Key |
|---------------|-----------------|
| DB_HOST | DB_HOST |
| DB_PORT | DB_PORT |
| DB_NAME | DB_NAME |
| DB_USER | DB_USER |
| DB_PASSWORD | DB_PASSWORD |
| (API Gateway) | CORS_ORIGINS |
| (Cognito config) | COGNITO_USER_POOL_ID, COGNITO_REGION |
| TWILIO_ACCOUNT_SID | TWILIO_ACCOUNT_SID |
| TWILIO_AUTH_TOKEN | TWILIO_AUTH_TOKEN |
| TWILIO_PHONE_NUMBER | TWILIO_PHONE_NUMBER |
| SOURCE_EMAIL | SOURCE_EMAIL |

## Deployment

1. Push to GitHub
2. Connect repo to Render
3. Render reads `render.yaml` and creates all services
4. Set environment variables in Render dashboard
5. Point your existing Postgres (RDS) connection to the Render service
   OR migrate data to Render Postgres

## Testing Locally

```bash
cd services/api
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env     # Fill in your values
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs
