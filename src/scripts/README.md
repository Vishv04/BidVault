# Gmail Integration Scripts

This directory contains scripts for integrating with Gmail using OAuth 2.0 to fetch and store emails in a PostgreSQL database.

## Prerequisites

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail API for your project
3. Create OAuth 2.0 credentials (Web application type)
4. Add authorized redirect URIs (e.g., `http://localhost:3000/api/auth/callback/google`)
5. Add the following environment variables to your `.env` file:

```
# Gmail OAuth 2.0 credentials
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/callback/google
```

## Scripts

### 1. Setup OAuth 2.0 Authentication

Before you can fetch emails, you need to authenticate with Gmail using OAuth 2.0:

```bash
node src/scripts/setupOAuth.js <userId>
```

This script will:
- Generate an authorization URL
- Prompt you to visit the URL and authorize the application
- Ask for the authorization code
- Exchange the code for access and refresh tokens
- Store the tokens in the database for the specified user

### 2. Fetch Unread Emails

Once OAuth is set up, you can fetch unread emails:

```bash
node src/scripts/fetchEmails.js <userId>
```

This script will:
- Fetch unread emails from the user's Gmail inbox
- Extract metadata (subject, sender, recipients, date)
- Decode email body (text and HTML)
- Store the emails in the PostgreSQL database
- Mark the emails as read in Gmail

## Database Schema

The emails are stored in the `Email` model with the following fields:

- `id`: Unique identifier for the email record
- `messageId`: Gmail message ID
- `threadId`: Gmail thread ID
- `userId`: User ID who owns the email
- `subject`: Email subject
- `sender`: Email sender
- `recipients`: Array of recipient email addresses
- `body`: Plain text email body
- `bodyHtml`: HTML email body
- `snippet`: Short snippet of the email content
- `receivedAt`: Date when the email was received
- `isRead`: Whether the email has been read
- `labels`: Array of Gmail labels
- `createdAt`: Record creation timestamp
- `updatedAt`: Record update timestamp

## Automation

You can automate email fetching by setting up a cron job or scheduled task:

```bash
# Example cron job to fetch emails every hour
0 * * * * node /path/to/src/scripts/fetchEmails.js <userId>
```

## Error Handling

The scripts include error handling and logging. If you encounter issues:

1. Check that your OAuth credentials are correct
2. Ensure the user exists in the database
3. Verify that the user has valid OAuth tokens
4. Check the console output for specific error messages
