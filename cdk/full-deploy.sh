#!/bin/bash

# Exit on error
set -e

echo "Starting full deploy process..."

# Text to Speech Lambda setup (needs root package.json)
echo "Installing dependencies for text-to-speech-lambda..."
cp -f package.json text-to-speech-lambda
yarn --cwd text-to-speech-lambda install --no-lockfile --production

# Sentence Quiz Lambda setup
echo "Installing dependencies for sentence-quiz-lambda..."
yarn --cwd sentence-quiz-lambda install --no-lockfile --production

# Create Exam Lambda setup
echo "Installing dependencies for create-exam-lambda..."
yarn --cwd create-exam-lambda install --no-lockfile --production

# Exam API Lambda setup
echo "Installing dependencies for exam-api-lambda..."
yarn --cwd exam-api-lambda install --no-lockfile --production

# Create Quiz Lambda setup
echo "Installing dependencies for create-quiz-lambda..."
yarn --cwd create-quiz-lambda install --no-lockfile --production

# Deploy the stack
echo "Deploying CDK stack..."
cdk deploy

