import { getServerSession } from "next-auth/next";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { v4 as uuidv4 } from 'uuid';



// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Create an OAuth2 client with the given credentials
 * @param {Object} tokens - OAuth tokens (access_token, refresh_token, etc.)
 * @returns {OAuth2Client} - Authenticated OAuth2 client
 */
function createOAuth2Client(tokens) {
  const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL || "http://localhost:3000"
  );
  
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
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
    ccRecipients: [], // Added separate field for CC recipients
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
        if (header.value && header.value.trim()) {
          metadata.ccRecipients = header.value
            .split(',')
            .map(email => email.trim())
            .filter(email => email); // Filter out empty strings
          console.log('Found CC header with value:', header.value);
          console.log('Parsed CC recipients:', metadata.ccRecipients);
        } else {
          console.log('Found empty CC header');
          metadata.ccRecipients = [];
        }
        // Don't merge with recipients anymore as we want to keep them separate
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
    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(fileData);
    bufferStream.push(null);
    
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
        ccRecipients: email.ccRecipients || [], // Store CC recipients separately
        body: email.body.text || null, // Store full email content without limiting
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
    if (email.body.attachments && email.body.attachments.length > 0) {
      const storedAttachments = await processAttachments(auth, email.id, email.body.attachments, createdEmail.id);
      
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
 * Fetch emails from Gmail
 * @param {string} userId - User ID
 * @param {Object} account - Account with tokens
 * @returns {Promise<Array>} - Array of processed emails
 */
export async function fetchEmails(userId, account) {
  try {
    console.log('Fetching emails with tokens:', {
      access_token_length: account.access_token ? account.access_token.length : 0,
      refresh_token_length: account.refresh_token ? account.refresh_token.length : 0,
      expires_at: account.expires_at
    });
    
    // Create OAuth client with user's tokens
    const tokens = {
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expiry_date: account.expires_at ? account.expires_at * 1000 : null
    };
    
    const auth = createOAuth2Client(tokens);
    const gmail = google.gmail({ version: 'v1', auth });
    
    let messages = [];
    
    try {
      // First, test the connection by getting the user profile
      console.log('Testing Gmail API connection...');
      const profileResponse = await gmail.users.getProfile({
        userId: 'me'
      });
      
      console.log('Gmail connection successful, email:', profileResponse.data.emailAddress);
      
      // Get the last email sync timestamp for the user
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      let fetchAllEmails = false;
      let queryParams = {};
      
      // Check if user exists and has a lastEmailSync timestamp
      if (user && user.lastEmailSync) {
        // User exists and has synced before - fetch only new emails
        const lastSyncTime = user.lastEmailSync;
        // Convert to Unix timestamp (seconds since epoch)
        const lastSyncTimestamp = Math.floor(lastSyncTime.getTime() / 1000);
        console.log(`Found last sync timestamp: ${lastSyncTimestamp} (${lastSyncTime.toISOString()})`);
        console.log(`Fetching only emails after timestamp: ${lastSyncTimestamp}`);
        
        // Set query parameter to fetch emails after the timestamp
        queryParams = {
          q: `after:${lastSyncTimestamp}`, // Gmail search query for emails after timestamp
          labelIds: ['INBOX']
        };
      } else {
        // User is new or has never synced - fetch all emails
        console.log('New user or no previous sync found. Fetching all emails...');
        fetchAllEmails = true;
        
        // Set query parameter to fetch all inbox emails
        queryParams = {
          labelIds: ['INBOX']
        };
      }
      
      let allMessages = [];
      let pageToken = null;
      const maxEmails = 1000; // Increased limit for API route
      
      // Keep fetching pages until we have all messages or reach the maximum
      do {
        console.log(`Fetching page of emails with${fetchAllEmails ? ' all' : ' new'} emails...`);
        const res = await gmail.users.messages.list({
          userId: 'me',
          ...queryParams,
          pageToken: pageToken,
          maxResults: 100 // Gmail API's maximum per page
        });
        
        const pageMessages = res.data.messages || [];
        allMessages = [...allMessages, ...pageMessages];
        pageToken = res.data.nextPageToken;
        
        console.log(`Fetched page of ${pageMessages.length} messages. Total so far: ${allMessages.length}`);
        
        // Stop if we've reached the maximum number of emails to fetch
        if (allMessages.length >= maxEmails) {
          console.log(`Reached maximum of ${maxEmails} messages. Stopping pagination.`);
          break;
        }
      } while (pageToken);
      
      messages = allMessages;
      console.log(`Completed fetching. Found ${messages.length} total messages`);
    } catch (error) {
      console.error('Gmail API error:', error.message);
      
      // Check if this is a permission error
      if (error.status === 403 || error.code === 403 || 
          (error.message && (error.message.includes('permission') || error.message.includes('Permission')))) {
        throw new Error('Insufficient authentication scopes to access Gmail API');
      }
      
      // Re-throw the error for other issues
      throw error;
    }
    
    if (messages.length === 0) {
      console.log('No messages found');
      return [];
    }
    
    try {
      console.log('Fetching full message details in batches...');
      
      // Process in batches to avoid memory issues with large numbers of emails
      const batchSize = 25; // Smaller batch size for API route to avoid timeouts
      let fullMessages = [];
      
      for (let i = 0; i < messages.length; i += batchSize) {
        console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(messages.length/batchSize)}`);
        const batch = messages.slice(i, i + batchSize);
        
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
      
      console.log(`Successfully fetched ${fullMessages.length} full messages`);
      
      // Process emails in smaller batches to avoid overwhelming the database
      console.log('Processing emails...');
      const dbBatchSize = 10; // Process database operations in smaller batches
      let processedEmails = [];
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < fullMessages.length; i += dbBatchSize) {
        console.log(`Processing database batch ${Math.floor(i/dbBatchSize) + 1} of ${Math.ceil(fullMessages.length/dbBatchSize)}`);
        const batch = fullMessages.slice(i, i + dbBatchSize);
        
        // Process each email in the batch
        const batchResults = await Promise.all(
          batch.map(async (message) => {
            try {
              // Parse email metadata
              const metadata = parseEmailHeaders(message.payload.headers);
              
              // Debug log for CC recipients
              if (metadata.ccRecipients && metadata.ccRecipients.length > 0) {
                console.log(`Email ${message.id} has CC recipients:`, metadata.ccRecipients);
              } else {
                console.log(`Email ${message.id} has no CC recipients`);
              }
              
              // Decode email body
              const body = decodeEmailBody(message);
              
              // Create email object
              const email = {
                id: message.id,
                threadId: message.threadId,
                subject: metadata.subject || 'No Subject',
                sender: metadata.sender || 'Unknown Sender',
                recipients: metadata.recipients || [],
                ccRecipients: metadata.ccRecipients || [], // Add CC recipients
                date: metadata.date || new Date(),
                snippet: message.snippet || '',
                body: body,
                labels: message.labelIds || []
              };
              
              // Store email in database with attachment handling
              const storedEmail = await storeEmailInDatabase(email, userId, auth);
              
              if (storedEmail) {
                successCount++;
                return email;
              } else {
                errorCount++;
                return null;
              }
            } catch (error) {
              console.error(`Error processing message ${message.id}:`, error.message);
              errorCount++;
              return null;
            }
          })
        );
        
        // Filter out any null results from errors
        processedEmails = [...processedEmails, ...batchResults.filter(email => email !== null)];
      }
      
      console.log(`Email processing complete. Success: ${successCount}, Errors: ${errorCount}`);
      console.log(`Total emails processed: ${processedEmails.length}`);
      
      // Count how many emails are in the database for this user
      const totalStoredEmails = await prisma.email.count({
        where: { userId: userId }
      });
      
      console.log(`Total emails in database for user ${userId}: ${totalStoredEmails}`);
      
      // Update the last sync timestamp to current time
      const currentTime = new Date();
      await prisma.user.update({
        where: { id: userId },
        data: { lastEmailSync: currentTime }
      });
      
      console.log(`Updated lastEmailSync timestamp to ${currentTime.toISOString()}`);
      console.log(`Successfully processed ${processedEmails.length} emails`);
      return processedEmails;
    } catch (error) {
      console.error('Error processing emails:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
}

/**
 * GET handler for /api/emails
 */
export async function GET() {
  try {
    // Get user session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = session.user.id;
    console.log('Fetching emails for user:', userId);
    
    // Get user's Google account with tokens
    const account = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: 'google'
      }
    });
    
    if (!account) {
      console.error('No Google account found for user:', userId);
      return NextResponse.json({ error: 'No Google account connected' }, { status: 400 });
    }
    
    if (!account.access_token) {
      console.error('Google account found but missing access token for user:', userId);
      return NextResponse.json({ error: 'Missing Google access token' }, { status: 400 });
    }
    
    // Log the scopes for debugging
    // console.log('Account scopes:', account.scope);
    
    // Check if the account has Gmail scopes
    const hasGmailScopes = account.scope && (
      account.scope.includes('https://www.googleapis.com/auth/gmail.readonly') ||
      account.scope.includes('https://www.googleapis.com/auth/gmail.modify')
    );
    
    if (!hasGmailScopes) {
      console.error('Google account missing required Gmail scopes:', account.scope);
      return NextResponse.json({ 
        error: 'Insufficient Gmail permissions. Please sign out and sign in again to grant access to Gmail.', 
        scopes: account.scope,
        needsReauthentication: true
      }, { status: 403 });
    }
    
    try {
      console.log('Attempting to fetch emails');
      
      // Get user data including lastEmailSync timestamp
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      // Try to get emails from database first
      const storedEmails = await prisma.email.findMany({
        where: {
          userId: userId,
          // Removed isRead filter to get all emails
        },
        orderBy: {
          receivedAt: 'desc'
        },
        include: {
          attachments: true // Include attachments for each email
        },
        // No limit to get all emails
      });
      
      // If we have recent emails in the database, return them
      if (storedEmails.length > 0) {
        console.log(`Returning ${storedEmails.length} stored emails`);
        return NextResponse.json({ 
          emails: storedEmails,
          lastEmailSync: user?.lastEmailSync || null
        });
      }
      
      // Otherwise, fetch new emails from Gmail
      console.log('No stored emails found, fetching from Gmail API');
      const emails = await fetchEmails(userId, account);
      
      // Get updated user data after email fetch (which updates lastEmailSync)
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      return NextResponse.json({ 
        emails: emails,
        lastEmailSync: updatedUser?.lastEmailSync || null
      });
    } catch (error) {
      console.error('Error fetching emails from Gmail:', error);
      
      // If we get a specific permission error from the Gmail API
      if (error.message?.includes('insufficient authentication scopes') || 
          error.message?.includes('Insufficient Permission')) {
        return NextResponse.json({ 
          error: 'Insufficient Gmail permissions. Please sign out and sign in again to grant access to Gmail.', 
          scopes: account.scope,
          needsReauthentication: true
        }, { status: 403 });
      }
      
      // For other errors, return the error message
      return NextResponse.json({ 
        error: `Error fetching emails: ${error.message}`,
        needsReauthentication: error.message?.includes('invalid_grant') || error.message?.includes('unauthorized')
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in GET /api/emails:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
