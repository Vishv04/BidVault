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
 * Fetch emails from Gmail with pagination support
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {number} maxEmails - Maximum number of emails to fetch (default: 1000)
 * @returns {Promise<Array>} - Array of email messages
 */
async function fetchEmails(auth, maxEmails = 2000) {
  const gmail = google.gmail({ version: 'v1', auth });
  let allMessages = [];
  let pageToken = null;
  
  try {
    console.log('Fetching all messages from Primary category with pagination...');
    
    // Keep fetching pages until we have all messages or reach the maximum
    do {
      // Search for all emails with 'inbox' label
      console.log('Fetching all messages with INBOX label...');
      const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'], // Fetch only emails with 'inbox' label
        pageToken: pageToken,
        maxResults: 100 // Gmail API's maximum per page
      });
      
      const messages = res.data.messages || [];
      allMessages = [...allMessages, ...messages];
      pageToken = res.data.nextPageToken;
      
      console.log(`Fetched page of ${messages.length} messages. Total so far: ${allMessages.length}`);
      
      // Stop if we've reached the maximum number of emails to fetch
      if (allMessages.length >= maxEmails) {
        console.log(`Reached maximum of ${maxEmails} messages. Stopping pagination.`);
        break;
      }
    } while (pageToken);
    
    console.log(`Completed fetching. Found ${allMessages.length} total messages`);
    
    // Fetch full message details for each email
    // Note: For large numbers of emails, we process in batches to avoid memory issues
    const batchSize = 50;
    let fullMessages = [];
    
    for (let i = 0; i < allMessages.length; i += batchSize) {
      console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(allMessages.length/batchSize)}`);
      const batch = allMessages.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (message) => {
          try {
            const res = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });
            return res.data;
          } catch (error) {
            console.error(`Error fetching message ${message.id}:`, error.message);
            return null;
          }
        })
      );
      
      // Filter out any null results from errors
      fullMessages = [...fullMessages, ...batchResults.filter(msg => msg !== null)];
    }
    
    console.log(`Successfully fetched details for ${fullMessages.length} messages`);
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
    // First check if the email already exists
    const existingEmail = await prisma.email.findFirst({
      where: {
        messageId: email.id,
        userId: userId
      }
    });
    
    if (existingEmail) {
      console.log(`Email ${email.id} already exists for user ${userId}, skipping`);
      return existingEmail;
    }
    
    // Create new email record with proper error handling for null values
    const storedEmail = await prisma.email.create({
      data: {
        messageId: email.id,
        threadId: email.threadId || '',
        userId: userId,
        subject: email.subject || 'No Subject',
        sender: email.sender || 'Unknown Sender',
        recipients: Array.isArray(email.recipients) ? email.recipients : [],
        body: email.body?.text || '',
        bodyHtml: email.body?.html || '',
        snippet: email.snippet || '',
        receivedAt: email.date instanceof Date ? email.date : new Date(),
        isRead: false,
        labels: Array.isArray(email.labels) ? email.labels : []
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
    console.log(`Processing emails for user: ${userId}`);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: { provider: 'google' }
        }
      }
    });
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    const account = user.accounts[0];
    
    if (!account) {
      throw new Error(`No Google account found for user: ${userId}`);
    }
    
    if (!account.access_token) {
      throw new Error(`Google account missing access token for user: ${userId}`);
    }
    
    // Check if account has the required scopes
    console.log('Account scopes:', account.scope);
    
    // Verify that the account has the necessary Gmail scopes
    const requiredScopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ];
    
    const hasRequiredScopes = requiredScopes.some(scope => account.scope && account.scope.includes(scope));
    
    if (!hasRequiredScopes) {
      console.error('Google account missing required Gmail scopes:', account.scope);
      throw new Error('Insufficient Gmail permissions. Please sign out and sign in again to grant access to Gmail.');
    }
    
    // Create OAuth client with account tokens
    const tokens = {
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expiry_date: account.expires_at ? account.expires_at * 1000 : null
    };
    
    console.log('Using tokens:', {
      access_token_length: tokens.access_token ? tokens.access_token.length : 0,
      refresh_token_exists: !!tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });
    
    const auth = createOAuth2Client(tokens);
    
    // Fetch unread emails
    const emails = await fetchEmails(auth);
    
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
  fetchEmails,
  storeEmailInDatabase
};
