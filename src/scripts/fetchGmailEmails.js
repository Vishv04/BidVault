/**
 * Gmail Email Fetcher with Timestamp-Based Synchronization and Attachment Handling
 * 
 * This script authenticates with Gmail using OAuth 2.0, fetches emails since the last sync,
 * and stores them in a PostgreSQL database using Prisma.
 * 
 * It uses timestamp-based tracking to efficiently fetch only new emails that have arrived
 * since the last synchronization, avoiding the need to check for duplicates in the database.
 * 
 * Additionally, it saves email attachments to Google Drive and stores the access links in the database.
 */

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { PrismaClient } = require('@prisma/client');
const config = require('./config');
const stream = require('stream');
const path = require('path');

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
 * Decode email body (text or HTML) and extract attachments
 * @param {Object} message - Gmail message object
 * @returns {Object} - Decoded email body (text and HTML) and attachments
 */
function decodeEmailBody(message) {
  const result = {
    text: null,
    html: null,
    attachments: []
  };
  
  if (!message.payload) return result;
  
  // Function to process parts recursively
  function processParts(parts) {
    if (!parts || !Array.isArray(parts)) return;
    
    parts.forEach(part => {
      // Handle text parts
      if (part.mimeType === 'text/plain' && part.body.data) {
        result.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body.data) {
        result.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } 
      // Handle attachment parts
      else if (part.filename && part.filename.length > 0) {
        // This is an attachment
        result.attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
          partId: part.partId || ''
        });
      }
      
      // Process nested parts recursively
      if (part.parts) {
        processParts(part.parts);
      }
    });
  }
  
  // Handle multipart messages
  if (message.payload.parts && message.payload.parts.length > 0) {
    processParts(message.payload.parts);
  } 
  // Handle single part messages
  else if (message.payload.body && message.payload.body.data) {
    if (message.payload.mimeType === 'text/plain') {
      result.text = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.mimeType === 'text/html') {
      result.html = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
  }
  
  return result;
}

/**
 * Download attachment from Gmail
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {string} messageId - Gmail message ID
 * @param {string} attachmentId - Gmail attachment ID
 * @returns {Promise<Buffer>} - Attachment data as Buffer
 */
async function downloadAttachment(auth, messageId, attachmentId) {
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId
    });
    
    if (!response.data.data) {
      throw new Error('No attachment data found');
    }
    
    // Convert base64 data to Buffer
    return Buffer.from(response.data.data, 'base64');
  } catch (error) {
    console.error(`Error downloading attachment ${attachmentId}:`, error);
    throw error;
  }
}

/**
 * Upload file to Google Drive
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {Buffer} fileData - File data as Buffer
 * @param {string} fileName - File name
 * @param {string} mimeType - File MIME type
 * @returns {Promise<Object>} - Google Drive file object
 */
async function uploadToDrive(auth, fileData, fileName, mimeType) {
  try {
    const drive = google.drive({ version: 'v3', auth });
    
    // Create a folder for email attachments if it doesn't exist
    let folderId;
    const folderName = 'BidVault Email Attachments';
    
    // Check if folder already exists
    const folderResponse = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });
    
    if (folderResponse.data.files && folderResponse.data.files.length > 0) {
      folderId = folderResponse.data.files[0].id;
      console.log(`Using existing folder: ${folderName} (${folderId})`);
    } else {
      // Create a new folder
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      
      folderId = folder.data.id;
      console.log(`Created new folder: ${folderName} (${folderId})`);
    }
    
    // Create a readable stream from the file buffer
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileData);
    
    // File metadata
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };
    
    // Upload file
    const media = {
      mimeType: mimeType,
      body: bufferStream
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });
    
    console.log(`Uploaded file to Drive: ${fileName} (${file.data.id})`);
    return file.data;
  } catch (error) {
    console.error(`Error uploading file to Drive: ${fileName}`, error);
    throw error;
  }
}

/**
 * Process email attachments
 * @param {OAuth2Client} auth - Authenticated OAuth2 client
 * @param {string} messageId - Gmail message ID
 * @param {Array} attachments - Array of attachment metadata
 * @param {string} emailId - Database email ID
 * @returns {Promise<Array>} - Array of stored attachment records
 */
async function processAttachments(auth, messageId, attachments, emailId) {
  try {
    if (!attachments || attachments.length === 0) {
      return [];
    }
    
    console.log(`Processing ${attachments.length} attachments for email ${messageId}`);
    
    const storedAttachments = [];
    
    for (const attachment of attachments) {
      try {
        if (!attachment.attachmentId) {
          console.log(`Skipping attachment ${attachment.filename} - no attachmentId`);
          continue;
        }
        
        // Download attachment from Gmail
        const fileData = await downloadAttachment(auth, messageId, attachment.attachmentId);
        
        // Upload to Google Drive
        const driveFile = await uploadToDrive(auth, fileData, attachment.filename, attachment.mimeType);
        
        // Store attachment metadata in database
        const storedAttachment = await prisma.attachment.create({
          data: {
            emailId: emailId,
            fileName: attachment.filename,
            mimeType: attachment.mimeType,
            fileSize: attachment.size,
            driveFileId: driveFile.id,
            driveLink: driveFile.webViewLink
          }
        });
        
        console.log(`Stored attachment in database: ${attachment.filename}`);
        storedAttachments.push(storedAttachment);
      } catch (error) {
        console.error(`Error processing attachment ${attachment.filename}:`, error);
      }
    }
    
    return storedAttachments;
  } catch (error) {
    console.error(`Error processing attachments for email ${messageId}:`, error);
    return [];
  }
}

/**
 * Store email in PostgreSQL database
 * @param {Object} email - Parsed email object
 * @param {string} userId - User ID to associate with the email
 * @param {OAuth2Client} auth - Authenticated OAuth2 client for handling attachments
 * @returns {Promise<Object>} - Created email record
 */
async function storeEmailInDatabase(email, userId, auth) {
  try {
    // Check if email already exists in database
    const existingEmail = await prisma.email.findUnique({
      where: {
        messageId: email.id
      },
      include: {
        attachments: true
      }
    });
    
    if (existingEmail) {
      console.log(`Email ${email.id} already exists in database, skipping...`);
      return existingEmail;
    }
    
    // Create new email record with empty attachmentLinks array
    const createdEmail = await prisma.email.create({
      data: {
        messageId: email.id,
        threadId: email.threadId,
        userId: userId,
        subject: email.subject || 'No Subject',
        sender: email.sender || 'Unknown Sender',
        recipients: email.recipients || [],
        body: email.body.text || null,
        bodyHtml: email.body.html || null,
        snippet: email.snippet || '',
        receivedAt: email.date || new Date(),
        isRead: false,
        labels: email.labels || [],
        attachmentLinks: [] // Initialize empty array for attachment links
      }
    });
    
    console.log(`Stored email ${email.id} in database`);
    
    // Process attachments if present
    if (email.attachments && email.attachments.length > 0) {
      const storedAttachments = await processAttachments(auth, email.id, email.attachments, createdEmail.id);
      
      // Update email with attachment links
      if (storedAttachments && storedAttachments.length > 0) {
        const attachmentLinks = storedAttachments.map(att => att.driveLink);
        await prisma.email.update({
          where: { id: createdEmail.id },
          data: { attachmentLinks }
        });
        console.log(`Updated email ${email.id} with ${attachmentLinks.length} attachment links`);
      }
    }
    
    return createdEmail;
  } catch (error) {
    console.error(`Error storing email ${email.id} in database:`, error);
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
          attachments: body.attachments || [],
          labels: message.labelIds || []
        };
        
        // Store email in database with attachment handling
        await storeEmailInDatabase(email, userId, auth);
        
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
