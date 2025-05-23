'use client';

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [visitCount, setVisitCount] = useState(1);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  // Set visit count from session
  useEffect(() => {
    if (session?.user?.visitCount) {
      setVisitCount(session.user.visitCount);
    }
  }, [session]);
  
  // Fetch unread emails when session is available
  useEffect(() => {
    if (session?.user?.id) {
      fetchEmails();
    }
  }, [session]);
  
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
      
      setEmails(data.emails || []);
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
    <div className="min-h-screen p-8 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white text-black shadow-lg rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </div>
          
          {session?.user && (
            <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt="Profile"
                  width={60}
                  height={60}
                  className="rounded-full"
                />
              )}
              <div className="flex-grow">
                <h2 className="text-xl font-semibold">{session.user.name}</h2>
                <p className="text-gray-600">{session.user.email}</p>
              </div>
              <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full">
                <p className="font-medium">Visit count: {visitCount}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-white text-black shadow-lg rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome to Your Dashboard</h2>
          <p className="text-gray-600 mb-4">
            You have successfully logged in with Google. This is your protected dashboard page.
          </p>
          
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="text-lg font-medium mb-2">Your Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-3 rounded border border-gray-200">
                <p className="text-sm text-gray-500">User ID</p>
                <p className="font-mono text-xs truncate">{session?.user?.id || 'Not available'}</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <p className="text-sm text-gray-500">Visit Count</p>
                <p>{visitCount}</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <p className="text-sm text-gray-500">Account Type</p>
                <p className="capitalize">{session?.user?.role || 'user'}</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <p className="text-sm text-gray-500">Authentication Provider</p>
                <p>Google</p>
              </div>
            </div>
          </div>
          
          {/* Unread Emails Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <h3 className="text-lg font-medium">Unread Emails</h3>
              </div>
              <button 
                onClick={fetchEmails}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm transition-colors flex items-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : 'Refresh'}
              </button>
            </div>
            
            {/* Google Cloud verification notice */}
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-md mb-4">
              <h4 className="font-medium text-amber-800 mb-2">⚠️ Development Mode</h4>
              <p className="text-sm text-amber-700 mb-2">
                Gmail integration is currently in development mode. To access Gmail data, you need to:
              </p>
              <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1 mb-2">
                <li>Add your email as a test user in Google Cloud Console</li>
                <li>Configure the OAuth consent screen</li>
                <li>Sign out and sign back in to grant Gmail permissions</li>
              </ol>
              <p className="text-xs text-amber-600">
                For production use, the app needs to complete Google's verification process.
              </p>
            </div>
            
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
                  <p className="text-gray-400 text-sm mt-1">Fetching your latest unread messages</p>
                </div>
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-md border border-gray-200">
                <p className="text-gray-500">No unread emails found</p>
                <p className="text-xs text-gray-400 mt-1">You have no unread emails in your inbox.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {emails.map((email) => (
                  <div key={email.id || email.messageId} className="bg-white p-4 rounded-md border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-lg truncate">{email.subject}</h4>
                      <span className="text-xs text-gray-500">
                        {email.receivedAt ? format(new Date(email.receivedAt), 'MMM d, yyyy h:mm a') : 'Unknown date'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">From: <span className="font-medium">{email.sender}</span></p>
                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded max-h-24 overflow-y-auto">
                      {email.snippet || (email.body && email.body.substring(0, 150)) || 'No preview available'}
                      {email.snippet && email.snippet.length > 150 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
