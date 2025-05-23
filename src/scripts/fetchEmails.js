#!/usr/bin/env node

/**
 * Command-line script to fetch Gmail emails
 * 
 * Usage:
 *   node fetchEmails.js <userId>
 * 
 * Example:
 *   node fetchEmails.js clj1a2b3c4d5e
 */

const { processEmails } = require('./fetchGmailEmails');

async function run() {
  try {
    // Get user ID from command line arguments
    const userId = process.argv[2];
    
    if (!userId) {
      console.error('Error: Please provide a user ID');
      console.error('Usage: node fetchEmails.js <userId>');
      process.exit(1);
    }
    
    console.log(`Fetching emails for user: ${userId}`);
    await processEmails(userId);
    console.log('Email fetching completed successfully');
  } catch (error) {
    console.error('Error fetching emails:', error);
    process.exit(1);
  }
}

run();
