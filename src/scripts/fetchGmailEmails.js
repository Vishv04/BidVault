/**
 * Gmail Email Fetcher
 * 
 * This script authenticates with Gmail using OAuth 2.0, fetches unread emails,
 * and stores them in a PostgreSQL database using Prisma.
 */

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { PrismaClient } = require('@prisma/client');
const config = require('./config');

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Create an OAuth2 client with the given credentials
 * @param {Object} tokens - OAuth tokens (access_token, refresh_token, etc.)
 * @returns {OAuth2Client} - Authenticated OAuth2 client
 */
function createOAuth2Client(tokens) {
  const oAuth2Client = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
  
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
}

/**
 * Fetch unread emails from Gmail
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {number} maxResults - Maximum number of emails to fetch (default: 10)
 * @returns {Promise<Array>} - Array of email messages
 */
async function fetchUnreadEmails(auth, maxResults = 10) {
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    // Search for unread emails
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: maxResults
    });
    
    const messages = res.data.messages || [];
    console.log(`Found ${messages.length} unread messages`);
    
    // Fetch full message details for each email
    const fullMessages = await Promise.all(
      messages.map(async (message) => {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        return res.data;
      })
    );
    
    return fullMessages;
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
}

/**
 * Parse email headers to extract metadata
 * @param {Object} headers - Email headers
 * @returns {Object} - Parsed email metadata
 */
function parseEmailHeaders(headers) {
  const metadata = {
    subject: '',
    sender: '',
    recipients: [],
    date: null
  };
  
  headers.forEach(header => {
    switch (header.name.toLowerCase()) {
      case 'subject':
        metadata.subject = header.value;
        break;
      case 'from':
        metadata.sender = header.value;
        break;
      case 'to':
        metadata.recipients = header.value
          .split(',')
          .map(email => email.trim());
        break;
      case 'cc':
        const ccRecipients = header.value
          .split(',')
          .map(email => email.trim());
        metadata.recipients = [...metadata.recipients, ...ccRecipients];
        break;
      case 'date':
        metadata.date = new Date(header.value);
        break;
    }
  });
  
  return metadata;
}

/**
 * Decode email body (text or HTML)
 * @param {Object} message - Gmail message object
 * @returns {Object} - Decoded email body (text and HTML)
 */
function decodeEmailBody(message) {
  const body = {
    text: null,
    html: null
  };
  
  if (!message.payload) return body;
  
  // Check if the message has parts (multipart email)
  if (message.payload.parts && message.payload.parts.length > 0) {
    message.payload.parts.forEach(part => {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body.data) {
        body.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      
      // Check for nested multipart content
      if (part.parts) {
        part.parts.forEach(nestedPart => {
          if (nestedPart.mimeType === 'text/plain' && nestedPart.body.data) {
            body.text = Buffer.from(nestedPart.body.data, 'base64').toString('utf-8');
          } else if (nestedPart.mimeType === 'text/html' && nestedPart.body.data) {
            body.html = Buffer.from(nestedPart.body.data, 'base64').toString('utf-8');
          }
        });
      }
    });
  } else if (message.payload.body && message.payload.body.data) {
    // Handle single part email
    if (message.payload.mimeType === 'text/plain') {
      body.text = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.mimeType === 'text/html') {
      body.html = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
  }
  
  return body;
}

/**
 * Store email in PostgreSQL database
 * @param {Object} email - Parsed email object
 * @param {string} userId - User ID to associate with the email
 * @returns {Promise<Object>} - Created email record
 */
async function storeEmailInDatabase(email, userId) {
  try {
    const storedEmail = await prisma.email.create({
      data: {
        messageId: email.id,
        threadId: email.threadId,
        userId: userId,
        subject: email.subject,
        sender: email.sender,
        recipients: email.recipients,
        body: email.body.text,
        bodyHtml: email.body.html,
        snippet: email.snippet,
        receivedAt: email.date,
        isRead: false,
        labels: email.labels || []
      }
    });
    
    console.log(`Stored email with ID: ${storedEmail.id}`);
    return storedEmail;
  } catch (error) {
    console.error('Error storing email:', error);
    throw error;
  }
}

/**
 * Mark email as read in Gmail
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<void>}
 */
async function markEmailAsRead(auth, messageId) {
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });
    
    console.log(`Marked email ${messageId} as read`);
  } catch (error) {
    console.error(`Error marking email ${messageId} as read:`, error);
    throw error;
  }
}

/**
 * Main function to process emails
 * @param {string} userId - User ID to fetch emails for
 * @returns {Promise<void>}
 */
async function processEmails(userId) {
  try {
    // Fetch user with OAuth tokens from database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.accessToken) {
      throw new Error(`User ${userId} not found or missing OAuth tokens`);
    }
    
    // Create OAuth client with user's tokens
    const tokens = {
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
      expiry_date: user.expiresAt ? user.expiresAt.getTime() : null
    };
    
    const auth = createOAuth2Client(tokens);
    
    // Fetch unread emails
    const emails = await fetchUnreadEmails(auth);
    
    // Process each email
    for (const message of emails) {
      // Parse email metadata
      const metadata = parseEmailHeaders(message.payload.headers);
      
      // Decode email body
      const body = decodeEmailBody(message);
      
      // Create email object
      const email = {
        id: message.id,
        threadId: message.threadId,
        subject: metadata.subject,
        sender: metadata.sender,
        recipients: metadata.recipients,
        date: metadata.date,
        snippet: message.snippet,
        body: body,
        labels: message.labelIds || []
      };
      
      // Store email in database
      await storeEmailInDatabase(email, userId);
      
      // Mark email as read in Gmail
      await markEmailAsRead(auth, message.id);
    }
    
    console.log(`Processed ${emails.length} emails for user ${userId}`);
  } catch (error) {
    console.error('Error processing emails:', error);
    throw error;
  } finally {
    // Close Prisma client connection
    await prisma.$disconnect();
  }
}

/**
 * Run the script with command line arguments
 */
async function main() {
  try {
    // Get user ID from command line arguments
    const userId = process.argv[2];
    
    if (!userId) {
      console.error('Please provide a user ID as a command line argument');
      process.exit(1);
    }
    
    await processEmails(userId);
    console.log('Email processing completed successfully');
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = {
  processEmails,
  fetchUnreadEmails,
  storeEmailInDatabase
};
