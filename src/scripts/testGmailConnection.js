/**
 * Test Gmail Connection
 * 
 * This script tests the connection to Gmail API using OAuth 2.0 credentials.
 * It verifies that the credentials are valid and that the API is accessible.
 */

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { PrismaClient } = require('@prisma/client');
const config = require('./config');

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Test Gmail connection for a user
 * @param {string} userId - User ID to test connection for
 * @returns {Promise<void>}
 */
async function testGmailConnection(userId) {
  try {
    console.log(`Testing Gmail connection for user: ${userId}`);
    
    // Fetch user with OAuth tokens from database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.accessToken) {
      throw new Error(`User ${userId} not found or missing OAuth tokens`);
    }
    
    // Create OAuth client with user's tokens
    const oAuth2Client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
    
    oAuth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
      expiry_date: user.expiresAt ? user.expiresAt.getTime() : null
    });
    
    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    
    // Test connection by getting user profile
    const profile = await gmail.users.getProfile({
      userId: 'me'
    });
    
    console.log('Connection successful!');
    console.log('Email:', profile.data.emailAddress);
    console.log('Messages total:', profile.data.messagesTotal);
    console.log('Threads total:', profile.data.threadsTotal);
    
    // Test listing labels
    const labels = await gmail.users.labels.list({
      userId: 'me'
    });
    
    console.log('\nGmail Labels:');
    labels.data.labels.forEach(label => {
      console.log(`- ${label.name} (${label.id})`);
    });
    
    return true;
  } catch (error) {
    console.error('Error testing Gmail connection:', error);
    return false;
  } finally {
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
    
    const success = await testGmailConnection(userId);
    
    if (success) {
      console.log('\nGmail connection test completed successfully');
    } else {
      console.error('\nGmail connection test failed');
      process.exit(1);
    }
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
  testGmailConnection
};
