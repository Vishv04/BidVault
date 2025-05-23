/**
 * Gmail OAuth 2.0 Setup Script
 * 
 * This script helps set up OAuth 2.0 authentication with Gmail API
 * and stores the tokens in the database for a specific user.
 */

const { OAuth2Client } = require('google-auth-library');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const config = require('./config');

// Initialize Prisma client
const prisma = new PrismaClient();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Generate an OAuth 2.0 authentication URL
 * @returns {Object} - Auth URL and OAuth client
 */
function generateAuthUrl() {
  const oAuth2Client = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
  
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.scopes,
    prompt: 'consent' // Force to get refresh token
  });
  
  return { authUrl, oAuth2Client };
}

/**
 * Get tokens from authorization code
 * @param {OAuth2Client} oAuth2Client - OAuth2 client
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} - OAuth tokens
 */
async function getTokensFromCode(oAuth2Client, code) {
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Error getting tokens:', error);
    throw error;
  }
}

/**
 * Store OAuth tokens in database for a user
 * @param {string} userId - User ID
 * @param {Object} tokens - OAuth tokens
 * @returns {Promise<Object>} - Updated user
 */
async function storeTokensForUser(userId, tokens) {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
      }
    });
    
    return updatedUser;
  } catch (error) {
    console.error('Error storing tokens:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Main function to set up OAuth
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function setupOAuth(userId) {
  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    
    // Generate auth URL
    const { authUrl, oAuth2Client } = generateAuthUrl();
    
    console.log('Authorize this app by visiting this URL:');
    console.log(authUrl);
    
    // Get authorization code from user
    const code = await new Promise((resolve) => {
      rl.question('Enter the code from that page here: ', (code) => {
        resolve(code);
      });
    });
    
    // Get tokens from code
    const tokens = await getTokensFromCode(oAuth2Client, code);
    
    // Store tokens for user
    await storeTokensForUser(userId, tokens);
    
    console.log('OAuth setup completed successfully');
  } catch (error) {
    console.error('Error setting up OAuth:', error);
  } finally {
    rl.close();
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
    
    await setupOAuth(userId);
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
  setupOAuth,
  generateAuthUrl,
  getTokensFromCode,
  storeTokensForUser
};
