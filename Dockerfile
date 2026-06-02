FROM node:18 AS frontend-build

# Build admin app
WORKDIR /app/apps/admin
COPY apps/admin/package*.json ./
RUN npm install
COPY apps/admin/ ./
RUN npm run build

# Build customer app
WORKDIR /app/apps/customer
COPY apps/customer/package*.json ./
RUN npm install
COPY apps/customer/ ./
RUN npm run build

# Python runtime
FROM python:3.11-slim

WORKDIR /app

# Copy built React apps
COPY --from=frontend-build /app/apps/admin/build /app/apps/admin/build
COPY --from=frontend-build /app/apps/customer/build /app/apps/customer/build

# Install Python dependencies
COPY services/api/requirements.txt /app/services/api/
RUN pip install --no-cache-dir -r /app/services/api/requirements.txt

# Copy API source
COPY services/api/ /app/services/api/

EXPOSE 8000

WORKDIR /app/services/api
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
