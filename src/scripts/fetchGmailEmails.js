/**
 * Gmail Email Fetcher with Timestamp-Based Synchronization
 * 
 * This script authenticates with Gmail using OAuth 2.0, fetches emails since the last sync,
 * and stores them in a PostgreSQL database using Prisma.
 * 
 * It uses timestamp-based tracking to efficiently fetch only new emails that have arrived
 * since the last synchronization, avoiding the need to check for duplicates in the database.
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
 * Convert JavaScript Date to Unix timestamp (seconds since epoch)
 * @param {Date} date - JavaScript Date object
 * @returns {number} - Unix timestamp in seconds
 */
function dateToUnixTimestamp(date) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Get the last email sync timestamp for a user
 * @param {string} userId - User ID to get timestamp for
 * @returns {Promise<number>} - Unix timestamp of last sync
 */
async function getLastSyncTimestamp(userId) {
  try {
    // Find the user to get their last email timestamp
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    // If user has lastEmailSync field and it's not null, use it
    if (user && user.lastEmailSync) {
      console.log(`Found last sync timestamp: ${user.lastEmailSync}`);
      return dateToUnixTimestamp(user.lastEmailSync);
    }
    
    // Otherwise, default to 1 week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    console.log(`No previous sync found, using default (1 week ago): ${oneWeekAgo.toISOString()}`);
    return dateToUnixTimestamp(oneWeekAgo);
  } catch (error) {
    console.error('Error getting last sync timestamp:', error);
    // Default to 1 week ago if there's an error
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return dateToUnixTimestamp(oneWeekAgo);
  }
}

/**
 * Update the last email sync timestamp for a user
 * @param {string} userId - User ID to update timestamp for
 * @returns {Promise<void>}
 */
async function updateLastSyncTimestamp(userId) {
  try {
    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { lastEmailSync: now }
    });
    console.log(`Updated last sync timestamp to ${now.toISOString()} for user ${userId}`);
  } catch (error) {
    console.error('Error updating last sync timestamp:', error);
  }
}

/**
 * Fetch emails from Gmail with timestamp-based filtering and pagination
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {string} userId - User ID to fetch emails for
 * @param {number} maxEmails - Maximum number of emails to fetch (default: 2000)
 * @returns {Promise<Array>} - Array of email messages
 */
async function fetchEmails(auth, userId, maxEmails = 2000) {
  const gmail = google.gmail({ version: 'v1', auth });
  let allMessages = [];
  let pageToken = null;
  
  try {
    // Get the timestamp of the last email sync
    const lastSyncTimestamp = await getLastSyncTimestamp(userId);
    console.log(`Fetching emails after timestamp: ${lastSyncTimestamp} (${new Date(lastSyncTimestamp * 1000).toISOString()})`);
    
    // Keep fetching pages until we have all messages or reach the maximum
    do {
      // Search for emails after the last sync time with 'inbox' label
      console.log('Fetching new messages with timestamp filtering...');
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${lastSyncTimestamp}`, // Gmail search query for emails after timestamp
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
 * @returns {Promise<Object>} Result of the processing
 */
async function processEmails(userId) {
  try {
    console.log(`Processing emails for user: ${userId}`);
    
    // Fetch user from database
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
    
    // Fetch emails since last sync timestamp
    console.log(`Fetching emails for user ${userId} since last sync...`);
    const messages = await fetchEmails(auth, userId);
    console.log(`Found ${messages.length} new emails since last sync`);
    
    // Process each email
    let processedCount = 0;
    for (const message of messages) {
      try {
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
        
        // Mark email as read in Gmail if needed
        // await markEmailAsRead(auth, message.id);
        
        processedCount++;
      } catch (error) {
        console.error(`Error processing email ${message.id}:`, error);
      }
    }
    
    // Update the last sync timestamp
    await updateLastSyncTimestamp(userId);
    
    console.log(`Successfully processed ${processedCount} out of ${messages.length} emails`);
    return { success: true, processedCount, totalCount: messages.length };
  } catch (error) {
    console.error('Error processing emails:', error);
    return { success: false, error: error.message };
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
    
    // Process emails with timestamp-based approach
    const result = await processEmails(userId);
    
    if (result.success) {
      console.log(`Email processing completed successfully. Processed ${result.processedCount} out of ${result.totalCount} emails.`);
    } else {
      console.error(`Email processing failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  } finally {
    // Ensure Prisma client is disconnected
    await prisma.$disconnect();
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
