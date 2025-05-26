# BidVault Email Processing System

This document provides detailed information about the email processing system in BidVault, including the Gmail API integration, scheduling mechanism, and deployment options.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Key Components](#key-components)
4. [Gmail API Integration](#gmail-api-integration)
5. [Database Schema](#database-schema)
6. [Email Scheduler](#email-scheduler)
7. [Deployment Options](#deployment-options)
8. [Running the Scheduler](#running-the-scheduler)
9. [Troubleshooting](#troubleshooting)
10. [Security Considerations](#security-considerations)

## Project Overview

BidVault is a Next.js application that integrates with Gmail to fetch, process, and display emails in a dashboard interface. The system uses OAuth 2.0 for authentication with Gmail, stores emails in a PostgreSQL database, and provides a responsive UI for viewing and managing emails.

### Core Features

- **OAuth 2.0 Authentication**: Secure authentication with Google's services
- **Automated Email Fetching**: Scheduled retrieval of emails using node-cron
- **Attachment Handling**: Processing and storing email attachments in Google Drive
- **Email Dashboard**: User-friendly interface for viewing and managing emails
- **Timestamp-Based Synchronization**: Efficient email fetching based on last sync time

## Architecture

The application follows a modern architecture with:

- **Frontend**: Next.js with React components and Tailwind CSS
- **Backend**: Next.js API routes for handling requests
- **Database**: PostgreSQL with Prisma ORM
- **Background Processing**: Node.js scripts for scheduled tasks
- **Authentication**: NextAuth.js for OAuth integration

## Key Components

### File Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/                # API routes
│   │   ├── auth/           # Authentication endpoints
│   │   └── emails/         # Email processing endpoints
│   ├── dashboard/          # Dashboard page
│   └── ...                 # Other app pages and components
├── lib/                    # Shared libraries
│   └── prisma.js           # Prisma client configuration
└── scripts/                # Background processing scripts
    ├── config.js           # Configuration for scripts
    ├── fetchGmailEmails.js # Core email fetching logic
    ├── scheduleEmailFetch.js # Scheduler for email fetching
    ├── setupOAuth.js       # OAuth setup utilities
    └── testGmailConnection.js # Testing utilities
```

## Gmail API Integration

The application uses the Gmail API to fetch emails and the Google Drive API to store attachments.

### Key API Endpoints Used

- **Gmail API**:
  - `users.messages.list`: Get a list of messages
  - `users.messages.get`: Get details of a specific message
  - `users.messages.attachments.get`: Download attachments
  - `users.messages.modify`: Mark messages as read

- **Google Drive API**:
  - `files.create`: Upload files to Google Drive
  - `permissions.create`: Set permissions for shared files

### Authentication Flow

1. User authenticates with Google via NextAuth.js
2. OAuth tokens (access and refresh) are stored in the database
3. Tokens are used to create authenticated clients for API requests
4. Refresh tokens are used to maintain access when tokens expire

## Database Schema

The database schema includes the following key models:

### User Model

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  
  // OAuth session data
  accessToken   String?   @db.Text
  refreshToken  String?   @db.Text
  expiresAt     DateTime?
  lastEmailSync DateTime? // Timestamp of last email synchronization
  
  // Relations
  emails        Email[]
}
```

### Email Model

```prisma
model Email {
  id            String       @id @default(cuid())
  messageId     String       @unique
  threadId      String
  userId        String
  subject       String?
  sender        String
  recipients    String[]     // Array of recipient email addresses
  ccRecipients  String[]     // Array of CC recipient email addresses
  body          String?      @db.Text
  bodyHtml      String?      @db.Text
  snippet       String?      @db.Text
  receivedAt    DateTime
  isRead        Boolean      @default(false)
  labels        String[]     // Array of Gmail labels
  
  // Store attachment links directly
  attachmentLinks String[]  
  
  // Relation to attachments for detailed information
  attachments   Attachment[]
  
  // Relation to user
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Attachment Model

```prisma
model Attachment {
  id          String   @id @default(cuid())
  emailId     String
  fileName    String
  mimeType    String
  fileSize    Int?
  driveFileId String   // Google Drive file ID
  driveLink   String   // Google Drive access link
  
  // Relation to email
  email       Email    @relation(fields: [emailId], references: [id], onDelete: Cascade)
}
```

## Email Scheduler

The email scheduler is a critical component that runs as a background process to periodically fetch new emails.

### Key Files

- **scheduleEmailFetch.js**: Sets up cron jobs to fetch emails at regular intervals
- **fetchGmailEmails.js**: Contains the core logic for fetching and processing emails

### How It Works

1. The scheduler uses node-cron to create scheduled tasks
2. Each task runs at specified intervals (default: every minute for testing)
3. The scheduler can be configured to run for all users or a specific user
4. When a task runs, it:
   - Retrieves the last sync timestamp for the user
   - Fetches only emails received since the last sync
   - Processes and stores the emails in the database
   - Updates the last sync timestamp

### Scheduler Functions

- **scheduleEmailFetch(userId, schedule)**: Schedule email fetching for a specific user
- **scheduleForAllUsers(schedule)**: Schedule email fetching for all users with valid OAuth tokens
- **processEmails(userId)**: Process emails for a specific user

## Deployment Options

The email scheduler can be deployed in several ways:

### 1. Local Development

Run the scheduler locally during development:

```bash
node src/scripts/scheduleEmailFetch.js [userId] [cronSchedule]
```

### 2. Docker Container

Use the provided Dockerfile.scheduler to build and run a containerized version:

```bash
# Build the image
docker build -t email-scheduler -f Dockerfile.scheduler .

# Run the container
docker run -p 8080:8080 --env-file .env email-scheduler
```

### 3. Google Cloud Run

Deploy as a serverless container on Google Cloud Run:

```bash
# Build and push the image
gcloud builds submit --tag gcr.io/PROJECT_ID/email-scheduler

# Deploy to Cloud Run
gcloud run deploy email-scheduler \
  --image gcr.io/PROJECT_ID/email-scheduler \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --min-instances 1
```

## Running the Scheduler

### Local Development

```bash
# Run for all users with default schedule (every minute)
node src/scripts/scheduleEmailFetch.js

# Run for a specific user
node src/scripts/scheduleEmailFetch.js user123

# Run with a custom schedule (every 30 minutes)
node src/scripts/scheduleEmailFetch.js user123 "*/30 * * * *"
```

### Docker Container

```bash
# Build the Docker image
docker build -t email-scheduler -f Dockerfile.scheduler .

# Run the container with environment variables
docker run -p 8080:8080 --env-file .env email-scheduler

# Test the server
curl http://localhost:8080
```

### Google Cloud Run

1. **Set up Google Cloud Project**:
   ```bash
   gcloud init
   gcloud projects create PROJECT_ID
   gcloud config set project PROJECT_ID
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com
   ```

2. **Build and push the Docker image**:
   ```bash
   gcloud auth configure-docker
   docker tag email-scheduler gcr.io/PROJECT_ID/email-scheduler:v1
   docker push gcr.io/PROJECT_ID/email-scheduler:v1
   ```

3. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy email-scheduler \
     --image gcr.io/PROJECT_ID/email-scheduler:v1 \
     --platform managed \
     --region asia-south1 \
     --allow-unauthenticated \
     --memory 512Mi \
     --min-instances 1
   ```

4. **Set up Cloud Scheduler for regular invocation**:
   ```bash
   gcloud services enable cloudscheduler.googleapis.com
   gcloud scheduler jobs create http email-scheduler-job \
     --schedule="0 * * * *" \
     --uri="CLOUD_RUN_URL/run" \
     --http-method=GET
   ```

## Troubleshooting

### Common Issues

1. **OAuth Token Expiration**:
   - Error: "Token has been expired or revoked"
   - Solution: Implement token refresh logic or have users re-authenticate

2. **Database Connection Issues**:
   - Error: "Could not connect to database"
   - Solution: Check DATABASE_URL environment variable and network connectivity

3. **Gmail API Rate Limiting**:
   - Error: "Quota exceeded for quota metric 'Queries'"
   - Solution: Implement exponential backoff and retry logic

4. **Missing Attachments**:
   - Issue: Attachments not showing up in the dashboard
   - Solution: Check Google Drive API permissions and quota

### Debugging

- Enable detailed logging by setting `DEBUG=true` in your environment
- Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision"`
- Test Gmail API connection: `node src/scripts/testGmailConnection.js userId`

## Security Considerations

1. **OAuth Tokens**:
   - Store tokens securely in the database
   - Never expose tokens in client-side code
   - Implement proper token refresh mechanisms

2. **Environment Variables**:
   - Use environment variables for all sensitive information
   - Set up different variables for development and production

3. **API Access**:
   - Limit Gmail API scopes to only what's needed
   - Implement rate limiting for API endpoints

4. **Database Security**:
   - Use strong passwords for database access
   - Enable SSL for database connections
   - Regularly backup your database

5. **Cloud Run Security**:
   - Consider adding authentication to your Cloud Run service
   - Use service accounts with minimal permissions
   - Set up proper IAM policies

---

This documentation provides a comprehensive overview of the email processing system in BidVault. For more detailed information about specific components, refer to the code comments and docstrings in the respective files.
