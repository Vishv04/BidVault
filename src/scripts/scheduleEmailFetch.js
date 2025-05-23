/**
 * Schedule Email Fetching
 * 
 * This script sets up a scheduled job to fetch emails at regular intervals.
 * It uses node-cron to schedule the job and can be run as a background process.
 */

const cron = require('node-cron');
const { processEmails } = require('./fetchGmailEmails');
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Schedule email fetching for a user
 * @param {string} userId - User ID to fetch emails for
 * @param {string} schedule - Cron schedule expression (default: every 15 minutes)
 * @returns {Object} - Scheduled task
 */
function scheduleEmailFetch(userId, schedule = '*/15 * * * *') {
  console.log(`Scheduling email fetch for user ${userId} with schedule: ${schedule}`);
  
  // Validate cron schedule
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron schedule: ${schedule}`);
  }
  
  // Schedule the task
  const task = cron.schedule(schedule, async () => {
    const now = new Date();
    console.log(`[${now.toISOString()}] Running scheduled email fetch for user ${userId}`);
    
    try {
      await processEmails(userId);
      console.log(`[${now.toISOString()}] Email fetch completed successfully`);
    } catch (error) {
      console.error(`[${now.toISOString()}] Error fetching emails:`, error);
    }
  });
  
  return task;
}

/**
 * Schedule email fetching for all users with OAuth tokens
 * @param {string} schedule - Cron schedule expression
 * @returns {Promise<Array>} - Array of scheduled tasks
 */
async function scheduleForAllUsers(schedule) {
  try {
    // Find all users with OAuth tokens
    const users = await prisma.user.findMany({
      where: {
        accessToken: { not: null },
        refreshToken: { not: null }
      },
      select: {
        id: true,
        email: true
      }
    });
    
    console.log(`Found ${users.length} users with OAuth tokens`);
    
    // Schedule email fetching for each user
    const tasks = users.map(user => {
      console.log(`Scheduling for user: ${user.email} (${user.id})`);
      return scheduleEmailFetch(user.id, schedule);
    });
    
    return tasks;
  } catch (error) {
    console.error('Error scheduling for all users:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Run the script with command line arguments
 */
async function main() {
  try {
    // Get command line arguments
    const userId = process.argv[2];
    const schedule = process.argv[3] || '*/15 * * * *';
    
    if (!userId) {
      // Schedule for all users
      console.log('No user ID provided, scheduling for all users');
      const tasks = await scheduleForAllUsers(schedule);
      console.log(`Scheduled email fetching for ${tasks.length} users`);
    } else {
      // Schedule for specific user
      const task = scheduleEmailFetch(userId, schedule);
      console.log(`Scheduled email fetching for user ${userId}`);
      
      // Keep the process running
      console.log('Press Ctrl+C to stop');
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
  scheduleEmailFetch,
  scheduleForAllUsers
};
