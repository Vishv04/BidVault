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
    // Check if email already exists for this user
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
    
    console.log(`Storing email: ${email.id} - ${email.subject}`);
    
    // Create new email record
    const storedEmail = await prisma.email.create({
      data: {
        messageId: email.id,
        threadId: email.threadId,
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
    
    console.log(`Successfully stored email ${email.id}`);
    return storedEmail;
  } catch (error) {
    console.error(`Error storing email ${email.id}:`, error.message);
    // Don't throw the error, just log it and return null
    // This allows the process to continue even if one email fails
    return null;
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
      
      // Search for all emails in Primary category with pagination
      console.log('Fetching all messages from Primary category with pagination...');
      
      let allMessages = [];
      let pageToken = null;
      const maxEmails = 1000; // Increased limit for API route
      
      // Keep fetching pages until we have all messages or reach the maximum
      do {
        const res = await gmail.users.messages.list({
          userId: 'me',
          labelIds: ['INBOX'], // Fetch only emails with 'inbox' label
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
              
              // Decode email body
              const body = decodeEmailBody(message);
              
              // Create email object
              const email = {
                id: message.id,
                threadId: message.threadId,
                subject: metadata.subject || 'No Subject',
                sender: metadata.sender || 'Unknown Sender',
                recipients: metadata.recipients || [],
                date: metadata.date || new Date(),
                snippet: message.snippet || '',
                body: body,
                labels: message.labelIds || []
              };
              
              // Store email in database
              const storedEmail = await storeEmailInDatabase(email, userId);
              
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
    console.log('Account scopes:', account.scope);
    
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
      
      // Try to get emails from database first
      const storedEmails = await prisma.email.findMany({
        where: {
          userId: userId,
          // Removed isRead filter to get all emails
        },
        orderBy: {
          receivedAt: 'desc'
        },
        // No limit to get all emails
      });
      
      // If we have recent emails in the database, return them
      if (storedEmails.length > 0) {
        console.log(`Returning ${storedEmails.length} stored emails`);
        return NextResponse.json({ emails: storedEmails });
      }
      
      // Otherwise, fetch new emails from Gmail
      console.log('No stored emails found, fetching from Gmail API');
      const emails = await fetchEmails(userId, account);
      return NextResponse.json({ emails });
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
