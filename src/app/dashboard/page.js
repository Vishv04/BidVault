'use client';

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const [lastEmailSync, setLastEmailSync] = useState(null);
  const [stats, setStats] = useState({
    emailCount: 0,
    attachmentCount: 0,
    lastSyncTime: null
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);
  
  // Auto-fetch emails when session is available
  useEffect(() => {
    if (session?.user?.id) {
      fetchEmails();
      
      // Set up auto-refresh every 5 minutes
      const refreshInterval = setInterval(fetchEmails, 5 * 60 * 1000);
      
      return () => clearInterval(refreshInterval);
    }
  }, [session]);
  
  // The lastEmailSync state is now declared at the top of the component

  // Calculate stats whenever emails change
  useEffect(() => {
    if (emails.length > 0) {
      // Count total attachments
      let attachmentCount = 0;
      
      // Find emails with attachments
      emails.forEach(email => {
        // Count both attachments and attachmentLinks
        if (email.attachments && email.attachments.length > 0) {
          attachmentCount += email.attachments.length;
        } else if (email.attachmentLinks && email.attachmentLinks.length > 0) {
          attachmentCount += email.attachmentLinks.length;
        }
      });
      
      setStats({
        emailCount: emails.length,
        attachmentCount,
        lastSyncTime: lastEmailSync // Use the lastEmailSync from the API
      });
    }
  }, [emails, lastEmailSync]);
  
  // Function to fetch emails from our API
  const fetchEmails = async () => {
    try {
      setLoading(true);
      setError(null);
      setNeedsReauthentication(false);
      
      const response = await fetch('/api/emails');
      const data = await response.json();
      
      if (!response.ok) {
        // Check for specific error types
        if (response.status === 403) {
          if (data.needsReauthentication) {
            setNeedsReauthentication(true);
            throw new Error(
              'Gmail access permissions required. Please sign out and sign in again to authorize Gmail access.'
            );
          } else {
            throw new Error(data.error || 'Insufficient permissions to access emails.');
          }
        } else {
          throw new Error(data.error || `Error fetching emails: ${response.statusText}`);
        }
      }
      
      // Extract the lastEmailSync timestamp from the API response
      if (data.lastEmailSync) {
        setLastEmailSync(new Date(data.lastEmailSync));
      }
      
      // Sort emails by time (most recent first)
      const sortedEmails = (data.emails || []).sort((a, b) => {
        return new Date(b.receivedAt) - new Date(a.receivedAt);
      });
      
      // Group emails by thread
      const threadMap = {};
      sortedEmails.forEach(email => {
        if (!threadMap[email.threadId]) {
          threadMap[email.threadId] = [];
        }
        threadMap[email.threadId].push(email);
      });
      
      // Sort emails within each thread by date
      Object.values(threadMap).forEach(thread => {
        thread.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
      });
      
      // Convert to array of threads
      const threads = Object.values(threadMap);
      
      // Sort threads by most recent message in thread
      threads.sort((a, b) => {
        const latestA = a[a.length - 1];
        const latestB = b[b.length - 1];
        return new Date(latestB.receivedAt) - new Date(latestA.receivedAt);
      });
      
      // Flatten back to array of emails with thread info
      const processedEmails = [];
      threads.forEach(thread => {
        thread.forEach((email, index) => {
          processedEmails.push({
            ...email,
            isThreadStart: index === 0,
            isThreadEnd: index === thread.length - 1,
            threadSize: thread.length
          });
        });
      });
      
      setEmails(processedEmails);
    } catch (err) {
      console.error('Error fetching emails:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-md py-4 px-6">
        <div className="max-w-[80%] mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-blue-600">BidVault</h1>
          </div>
          
          {session?.user && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                {session.user.image && (
                  <Image
                    src={session.user.image}
                    alt="Profile"
                    width={36}
                    height={36}
                    className="rounded-full mr-2"
                  />
                )}
                <span className="font-medium text-black">{session.user.name}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
      
      <div className="max-w-6xl mx-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-black text-sm uppercase mb-2">Total Emails</h3>
            <div className="flex items-center">
              <span className="text-3xl text-black font-bold">{stats.emailCount}</span>
              <svg className="w-6 h-6 ml-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-black text-sm uppercase mb-2">Attachments</h3>
            <div className="flex items-center">
              <span className="text-3xl text-black font-bold">{stats.attachmentCount}</span>
              <svg className="w-6 h-6 ml-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-black text-sm uppercase mb-2">Last Synced</h3>
            <div className="flex items-center">
              <span className="text-lg text-black font-medium">
                {stats.lastSyncTime ? formatDistanceToNow(new Date(stats.lastSyncTime), { addSuffix: true }) : 'Never'}
              </span>
              <svg className="w-5 h-5 ml-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Emails Section */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-xl text-black font-semibold">Email Inbox</h2>
          </div>
          
          <div className="p-6">
            
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
                {needsReauthentication && (
                  <div className="mt-3">
                    <div className="flex items-center">
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                      >
                        Sign Out & Reconnect
                      </button>
                      <p className="ml-3 text-xs text-red-600">Sign out and sign back in to grant Gmail access</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {loading ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="relative">
                    <div className="animate-spin h-12 w-12 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
                    <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center">
                      <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
                    </div>
                  </div>
                  <p className="text-gray-600 mt-4 font-medium">Loading emails...</p>
                  <p className="text-gray-400 text-sm mt-1">Fetching your latest messages</p>
                </div>
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-md border border-gray-200">
                <p className="text-gray-500">No emails found</p>
                <p className="text-xs text-gray-400 mt-1">Your inbox is empty.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group emails by thread and only show the first email of each thread */}
                {emails.reduce((threads, email) => {
                  if (email.isThreadStart) {
                    // Find all emails in this thread
                    const threadEmails = emails.filter(e => e.threadId === email.threadId);
                    threads.push({ mainEmail: email, thread: threadEmails });
                  }
                  return threads;
                }, []).map((thread, threadIndex) => {
                  const { mainEmail, thread: threadEmails } = thread;
                  const hasAttachments = threadEmails.some(email => 
                    (email.attachments && email.attachments.length > 0) || 
                    (email.attachmentLinks && email.attachmentLinks.length > 0)
                  );
                  
                  return (
                    <div key={mainEmail.id || mainEmail.messageId} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      {/* Main email header */}
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-semibold text-lg text-gray-800">{mainEmail.subject}</h4>
                          <span className="text-xs text-gray-500">
                            {mainEmail.receivedAt ? format(new Date(mainEmail.receivedAt), 'MMM d, yyyy h:mm a') : 'Unknown date'}
                          </span>
                        </div>
                        
                        <div className="flex items-center mb-3">
                          <span className="text-sm text-gray-700">From: <span className="font-medium">{mainEmail.sender}</span></span>
                          
                          {threadEmails.length > 1 && (
                            <span className="ml-3 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                              {threadEmails.length} emails in thread
                            </span>
                          )}
                          
                          {hasAttachments && (
                            <span className="ml-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              Attachments
                            </span>
                          )}
                        </div>
                        
                        {/* Email content */}
                        <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded mb-3">
                          {mainEmail.snippet || 
                           (typeof mainEmail.body === 'string' && mainEmail.body.substring(0, 200)) ||
                           (mainEmail.body && typeof mainEmail.body.text === 'string' && mainEmail.body.text.substring(0, 200)) ||
                           'No preview available'}
                          {mainEmail.snippet && mainEmail.snippet.length > 200 ? '...' : ''}
                        </div>
                        
                        {/* Thread and attachment dropdowns */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {/* Thread dropdown */}
                          {threadEmails.length > 1 && (
                            <details className="w-full border border-gray-200 rounded-md overflow-hidden">
                              <summary className="bg-gray-50 px-4 py-2 cursor-pointer flex items-center text-sm font-medium text-gray-700 hover:bg-gray-100">
                                <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                View Thread ({threadEmails.length} emails)
                              </summary>
                              <div className="px-4 py-3 divide-y divide-gray-100">
                                {threadEmails.slice(1).map((threadEmail, emailIndex) => (
                                  <div key={threadEmail.id || threadEmail.messageId} className="py-3">
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-sm font-medium text-gray-700">{threadEmail.sender}</span>
                                      <span className="text-xs text-gray-500">
                                        {threadEmail.receivedAt ? format(new Date(threadEmail.receivedAt), 'MMM d, yyyy h:mm a') : 'Unknown date'}
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                      {threadEmail.snippet || 
                                       (typeof threadEmail.body === 'string' && threadEmail.body.substring(0, 150)) ||
                                       (threadEmail.body && typeof threadEmail.body.text === 'string' && threadEmail.body.text.substring(0, 150)) ||
                                       'No preview available'}
                                      {threadEmail.snippet && threadEmail.snippet.length > 150 ? '...' : ''}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          
                          {/* Attachments dropdown */}
                          {hasAttachments && (
                            <details className="w-full border border-gray-200 rounded-md overflow-hidden">
                              <summary className="bg-gray-50 px-4 py-2 cursor-pointer flex items-center text-sm font-medium text-gray-700 hover:bg-gray-100">
                                <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                View Attachments
                              </summary>
                              <div className="p-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {threadEmails.map(email => {
                                    // Display attachments from the Attachment model
                                    if (email.attachments && email.attachments.length > 0) {
                                      return email.attachments.map(attachment => (
                                        <a
                                          key={attachment.id}
                                          href={attachment.driveLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center bg-gray-50 hover:bg-gray-100 rounded px-3 py-2 text-sm border border-gray-200"
                                        >
                                          <svg className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                          </svg>
                                          <span className="truncate">{attachment.fileName}</span>
                                        </a>
                                      ));
                                    }
                                    // Display links from the attachmentLinks array
                                    else if (email.attachmentLinks && email.attachmentLinks.length > 0) {
                                      return email.attachmentLinks.map((link, index) => (
                                        <a
                                          key={`${email.id}-link-${index}`}
                                          href={link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center bg-gray-50 hover:bg-gray-100 rounded px-3 py-2 text-sm border border-gray-200"
                                        >
                                          <svg className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                          </svg>
                                          <span className="truncate text-gray-600">Attachment {index + 1}</span>
                                        </a>
                                      ));
                                    }
                                    return null;
                                  })}
                                </div>
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
