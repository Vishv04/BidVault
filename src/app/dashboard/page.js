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
  const [filteredEmails, setFilteredEmails] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for newest first, 'asc' for oldest first
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const [lastEmailSync, setLastEmailSync] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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
  
  // Filter and sort emails whenever search term, sort order, or emails change
  useEffect(() => {
    if (emails.length > 0) {
      let result = [...emails];
      
      // Apply search filter if there's a search term
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        result = result.filter(email => 
          email.sender.toLowerCase().includes(term) ||
          (email.subject && email.subject.toLowerCase().includes(term))
        );
      }
      
      // Apply sorting
      result.sort((a, b) => {
        const dateA = new Date(a.receivedAt);
        const dateB = new Date(b.receivedAt);
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });
      
      setFilteredEmails(result);
    } else {
      setFilteredEmails([]);
    }
  }, [emails, searchTerm, sortOrder]);
  
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
            <div className="relative">
              <button 
                onClick={() => setShowLogoutConfirm(!showLogoutConfirm)}
                className="flex items-center space-x-2 focus:outline-none"
              >
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="rounded-full border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                    {session.user.name?.charAt(0) || 'U'}
                  </div>
                )}
                <span className="font-medium text-gray-800">{session.user.name}</span>
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown Menu */}
              {showLogoutConfirm && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-10 border border-gray-200">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{session.user.email}</p>
                  </div>
                  {!showLogoutConfirm ? (
                    <div className="px-2 py-2">
                      <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md flex items-center"
                      >
                        <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-sm mb-2 text-gray-700">Are you sure you want to logout?</p>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => signOut({ callbackUrl: '/' })}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors w-full"
                        >
                          Yes, Logout
                        </button>
                        <button
                          onClick={() => setShowLogoutConfirm(false)}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-sm transition-colors w-full"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
      
      <div className="max-w-6xl mx-auto p-6">
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-2">
              <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-black text-sm uppercase">Total Emails</h3>
            </div>
            <div className="flex items-center">
              <span className="text-3xl text-black font-bold">{stats.emailCount}</span>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-2">
              <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <h3 className="text-black text-sm uppercase">Attachments</h3>
            </div>
            <div className="flex items-center">
              <span className="text-3xl text-black font-bold">{stats.attachmentCount}</span>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-2">
              <svg className="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <h3 className="text-black text-sm uppercase">Last Synced</h3>
            </div>
            <div className="flex items-center">
              <span className="text-lg text-black font-medium">
                {stats.lastSyncTime ? formatDistanceToNow(new Date(stats.lastSyncTime), { addSuffix: true }) : 'Never'}
              </span>
            </div>
          </div>
        </div>


        {/* Search and Sort Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-grow max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by sender or subject..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700 w-full text-right">Sort by:</label>
              <select
                className="block w-full pl-3 pr-10 py-2 text-gray-900 border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
              
              <button
                onClick={fetchEmails}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
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
            ) : searchTerm && filteredEmails.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-md border border-gray-200">
                <p className="text-gray-500">No matching emails found</p>
                <p className="text-xs text-gray-400 mt-1">Try a different search term or clear the search.</p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group emails by thread and only show the first email of each thread */}
                {filteredEmails.reduce((threads, email) => {
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
                        
                        <div className="flex flex-col mb-3 space-y-2">
                          {/* Sender information */}
                          <div className="flex items-center">
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
                          
                          {/* Recipients information */}
                          <div className="flex flex-col">
                            {/* To: recipients */}
                            {mainEmail.recipients && mainEmail.recipients.length > 0 && (
                              <div className="text-sm text-gray-700">
                                <span className="text-gray-500">To:</span> {
                                  mainEmail.recipients.length === 1 ? 
                                    <span className="font-medium">you</span> :
                                    mainEmail.recipients.map((recipient, index) => (
                                      <span key={index} className="font-medium">
                                        {recipient.includes(session?.user?.email) ? 'you' : recipient}
                                        {index < mainEmail.recipients.length - 1 ? ', ' : ''}
                                      </span>
                                    ))
                                }
                              </div>
                            )}
                            
                            {/* CC: recipients (excluding the user's email) */}
                            {Array.isArray(mainEmail.ccRecipients) && mainEmail.ccRecipients.length > 0 ? (
                              <div className="text-sm text-gray-700">
                                <span className="text-gray-500">CC:</span> {
                                  mainEmail.ccRecipients
                                    .filter(email => email && !email.includes(session?.user?.email))
                                    .map((email, index, filteredArray) => (
                                      <span key={index} className="font-medium">
                                        {email}{index < filteredArray.length - 1 ? ', ' : ''}
                                      </span>
                                    ))
                                }
                                {!mainEmail.ccRecipients.some(email => email && !email.includes(session?.user?.email)) && (
                                  <span className="italic text-gray-400">No other recipients</span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        
                        {/* Email content */}
                        <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded mb-3">
                          {(() => {
                            // Get the full email content
                            let content;
                            
                            // Handle different types of body content
                            if (typeof mainEmail.body === 'string') {
                              content = mainEmail.body;
                            } else if (mainEmail.body && typeof mainEmail.body === 'object') {
                              // If body is an object, use text property if available
                              content = mainEmail.body.text || '';
                            } else {
                              // Fallback to snippet or default message
                              content = mainEmail.snippet || 'No content available';
                            }
                            
                            // Remove Google disclaimer if present
                            if (typeof content === 'string') {
                              // Remove the disclaimer text that typically appears at the end of Gmail messages
                              const disclaimerPattern = /Disclaimer: This email \(including any attachments\) is meant solely for the addressee\(s\) and may contain confidential information.*/i;
                              content = content.replace(disclaimerPattern, '');
                              
                              // Also remove any other common disclaimer patterns
                              content = content.replace(/CONFIDENTIALITY NOTICE:.*/is, '');
                              content = content.replace(/This email and any files transmitted with it are confidential.*/is, '');
                            }
                            
                            return content;
                          })()}
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
                                      {(() => {
                                        // Get the full email content
                                        let content;
                                        
                                        // Handle different types of body content
                                        if (typeof threadEmail.body === 'string') {
                                          content = threadEmail.body;
                                        } else if (threadEmail.body && typeof threadEmail.body === 'object') {
                                          // If body is an object, use text property if available
                                          content = threadEmail.body.text || '';
                                        } else {
                                          // Fallback to snippet or default message
                                          content = threadEmail.snippet || 'No content available';
                                        }
                                        
                                        // Remove Google disclaimer if present
                                        if (typeof content === 'string') {
                                          // Remove the disclaimer text that typically appears at the end of Gmail messages
                                          const disclaimerPattern = /Disclaimer: This email \(including any attachments\) is meant solely for the addressee\(s\) and may contain confidential information.*/i;
                                          content = content.replace(disclaimerPattern, '');
                                          
                                          // Also remove any other common disclaimer patterns
                                          content = content.replace(/CONFIDENTIALITY NOTICE:.*/is, '');
                                          content = content.replace(/This email and any files transmitted with it are confidential.*/is, '');
                                        }
                                        
                                        return content;
                                      })()}
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
                                <div className="flex flex-wrap gap-3">
                                  {threadEmails.map(email => {
                                    // Display attachments from the Attachment model
                                    if (email.attachments && email.attachments.length > 0) {
                                      return email.attachments.map(attachment => {
                                        // Determine file type for icon
                                        const fileExt = attachment.fileName.split('.').pop().toLowerCase();
                                        let fileIcon;
                                        
                                        // Select icon based on file type
                                        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExt)) {
                                          // Image icon
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          );
                                        } else if (['pdf'].includes(fileExt)) {
                                          // PDF icon
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          );
                                        } else if (['xls', 'xlsx', 'csv'].includes(fileExt)) {
                                          // Excel/CSV icon
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-green-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                              </svg>
                                            </div>
                                          );
                                        } else {
                                          // Generic file icon
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                              </svg>
                                            </div>
                                          );
                                        }
                                        
                                        return (
                                          <a
                                            key={attachment.id}
                                            href={attachment.driveLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex flex-col items-center w-24 h-24 bg-gray-50 hover:bg-gray-100 rounded p-2 text-sm border border-gray-200"
                                          >
                                            {fileIcon}
                                            <span className="truncate text-gray-600 text-center mt-2 w-full">{attachment.fileName}</span>
                                          </a>
                                        );
                                      });
                                    }
                                    // Display links from the attachmentLinks array
                                    else if (email.attachmentLinks && email.attachmentLinks.length > 0) {
                                      return email.attachmentLinks.map((link, index) => {
                                        // Try to determine file type from the link
                                        let fileType = 'generic';
                                        let fileIcon;
                                        
                                        // Check if link contains file extension hints
                                        if (link.includes('image') || link.includes('.jpg') || link.includes('.png') || link.includes('.jpeg')) {
                                          fileType = 'image';
                                        } else if (link.includes('pdf')) {
                                          fileType = 'pdf';
                                        } else if (link.includes('excel') || link.includes('spreadsheet') || link.includes('.xls') || link.includes('.csv')) {
                                          fileType = 'spreadsheet';
                                        }
                                        
                                        // Select icon based on determined file type
                                        if (fileType === 'image') {
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          );
                                        } else if (fileType === 'pdf') {
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                          );
                                        } else if (fileType === 'spreadsheet') {
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-green-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                              </svg>
                                            </div>
                                          );
                                        } else {
                                          fileIcon = (
                                            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                                              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                              </svg>
                                            </div>
                                          );
                                        }
                                        
                                        return (
                                          <a
                                            key={`${email.id}-link-${index}`}
                                            href={link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex flex-col items-center w-24 h-24 bg-gray-50 hover:bg-gray-100 rounded p-2 text-sm border border-gray-200"
                                          >
                                            {fileIcon}
                                            <span className="truncate text-gray-600 text-center mt-2 w-full">Attachment {index + 1}</span>
                                          </a>
                                        );
                                      });
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
