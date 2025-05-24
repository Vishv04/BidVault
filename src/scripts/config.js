/**
 * Configuration for Gmail API OAuth 2.0
 * 
 * You'll need to create a project in Google Cloud Console and enable the Gmail API
 * Then create OAuth 2.0 credentials and add the values below
 * https://console.cloud.google.com/apis/credentials
 */

module.exports = {
  // OAuth 2.0 credentials
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google',
  
  // Gmail API scopes needed
  scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify', // To mark emails as read
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/gmail.metadata',
  ],
  
  // Database configuration is loaded from .env via Prisma
};
