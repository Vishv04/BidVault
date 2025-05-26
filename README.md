# BidVault Email Processing System

This document provides detailed information about the email processing system in BidVault, including the Gmail API integration, scheduling mechanism, and local setup.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Screenshots and Video Demo](#screenshots-and-video-demo)
3. [Architecture](#architecture)
4. [Key Components](#key-components)
5. [Gmail API Integration](#gmail-api-integration)
6. [Database Setup](#database-setup)
7. [Database Schema](#database-schema)
8. [Email Scheduler](#email-scheduler)
9. [Running the Scheduler](#running-the-scheduler)
10. [Troubleshooting](#troubleshooting)
11. [Security Considerations](#security-considerations)

## Project Overview

BidVault is a Next.js application that integrates with Gmail to fetch, process, and display emails in a dashboard interface. The system uses OAuth 2.0 for authentication with Gmail, stores emails in a PostgreSQL database, and provides a responsive UI for viewing and managing emails.

### Core Features

- **OAuth 2.0 Authentication**: Secure authentication with Google's services
- **Automated Email Fetching**: Scheduled retrieval of emails using node-cron
- **Attachment Handling**: Processing and storing email attachments in Google Drive
- **Email Dashboard**: User-friendly interface for viewing and managing emails
- **Timestamp-Based Synchronization**: Efficient email fetching based on last sync time

## Screenshots and Video Demo

### Home page
![Home page](https://github.com/user-attachments/assets/7199713c-47ce-4887-9b2c-f43dbf926c22)
*The main dashboard showing the email list and statistics.*

### Dashboard View
![Dashboard View](![image](https://github.com/user-attachments/assets/a6174768-3a7d-4d68-bfec-0edd8f4ca450))
*Detailed view of an email with attachments and formatting preserved.*

### Attachments and CC Recipients
![Attachments and CC Recipients](https://github.com/user-attachments/assets/719850e9-47f1-4a2c-bcd7-2cf052aac17b)
*Attachments(redirect link to google drive document) and CC Recipients.*

### Thread of mail preserved
![Thread of mail preserved](https://github.com/user-attachments/assets/dcded805-375c-46e0-8748-07c4d264cbcc)
*Thread of mail preserved.*

### Video Demo

Watch a complete demonstration of the BidVault email processing system:

[▶️ BidVault Email System Demo](https://drive.google.com/file/d/1Cc30Cv2TOAMsIIpQYSNKQOX6ppRtbP0j/view?usp=drive_link)

### Flow chart
![Untitled Diagram drawio](https://github.com/user-attachments/assets/290005e7-56c3-4863-a3c1-04392c5adcef)


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

The email scheduler is a critical component that runs as a background process to periodically(every 5 minutes) fetch new emails.

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

## Database Setup

### Local PostgreSQL Setup

1. **Install PostgreSQL**:
   ```bash
   # For Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   
   # For macOS with Homebrew
   brew install postgresql
   ```

2. **Start PostgreSQL Service**:
   ```bash
   # For Ubuntu/Debian
   sudo service postgresql start
   
   # For macOS
   brew services start postgresql
   ```

3. **Create a Database User and Database**:
   ```bash
   # Access PostgreSQL command line
   sudo -u postgres psql
   
   # Inside PostgreSQL shell, create a user
   CREATE USER bidvault_user WITH PASSWORD 'your_password';
   
   # Create the database
   CREATE DATABASE bid_vault;
   
   # Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE bid_vault TO bidvault_user;
   
   # Exit PostgreSQL shell
   \q
   ```

4. **Configure Environment Variables**:
   Update your `.env` file with the PostgreSQL connection string:
   ```
   DATABASE_URL="postgresql://bidvault_user:your_password@localhost:5432/bid_vault?schema=public"
   ```

5. **Run Prisma Migrations**:
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run migrations
   npx prisma migrate dev --name init
   ```

## Running the Scheduler

The email scheduler is run as a Node.js script that can be executed from the command line. Here are the commands to run the scheduler with different configurations:

### Basic Usage

```bash
# Run the scheduler for all users with the default schedule (every minute)
node src/scripts/scheduleEmailFetch.js
```

This command will:
1. Find all users with valid OAuth tokens in the database
2. Set up a cron job for each user to fetch emails every minute
3. Log the email fetching process to the console

### Running for a Specific User

```bash
# Run for a specific user (replace USER_ID with the actual user ID)
node src/scripts/scheduleEmailFetch.js USER_ID
```

Example output:
```
Scheduling email fetch for user cmb4p8tlk0000oke1qpvoi3lk with schedule: */1 * * * *
Scheduled email fetching for user cmb4p8tlk0000oke1qpvoi3lk
[2025-05-26T06:39:00.010Z] Running scheduled email fetch for user cmb4p8tlk0000oke1qpvoi3lk
Processing emails for user: cmb4p8tlk0000oke1qpvoi3lk
...
```

### Custom Schedule

```bash
# Run with a custom cron schedule (e.g., every 30 minutes)
node src/scripts/scheduleEmailFetch.js USER_ID "*/30 * * * *"

# Run hourly
node src/scripts/scheduleEmailFetch.js USER_ID "0 * * * *"

# Run daily at midnight
node src/scripts/scheduleEmailFetch.js USER_ID "0 0 * * *"
```

### Running as a Background Process

To run the scheduler as a background process that continues after you close the terminal:

```bash
# Using nohup
nohup node src/scripts/scheduleEmailFetch.js > email_scheduler.log 2>&1 &

# Using PM2 (recommended for production)
npm install -g pm2
pm2 start src/scripts/scheduleEmailFetch.js --name "email-scheduler"

# View PM2 logs
pm2 logs email-scheduler

# Stop the PM2 process
pm2 stop email-scheduler
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
---

This documentation provides a comprehensive overview of the email processing system in BidVault. For more detailed information about specific components, refer to the code comments and docstrings in the respective files.
