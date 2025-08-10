#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- CONFIGURATION ---
S3_BUCKET_NAME="abuts.fit"
CLOUDFRONT_DISTRIBUTION_ID="E3Q4N37DS75X0Y"
AWS_REGION="ap-south-1"

# 1. Build the project
echo "Building the project..."
npm run build

# 2. Sync with S3
echo "Syncing build files to S3 bucket ($S3_BUCKET_NAME)..."
aws s3 sync ./dist s3://$S3_BUCKET_NAME --region $AWS_REGION

# 3. Invalidate CloudFront cache
echo "Invalidating CloudFront cache for distribution ($CLOUDFRONT_DISTRIBUTION_ID)..."
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
  --paths "/*"

echo "\nDeployment finished successfully!"
