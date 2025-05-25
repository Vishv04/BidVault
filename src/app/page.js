'use client';

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import "./grid-pattern.css";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  return (
    <div className="bg-grid-pattern min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-400 to-gray-200 z-0">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
      </div>
     
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl overflow-hidden relative z-10 backdrop-blur-sm bg-opacity-95">
        <div className="md:flex">
          <div className="md:w-1/2 p-8 md:p-12">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-3 text-blue-600">BidVault</h1>
              <p className="text-xl font-semibold text-gray-800 mb-2">Your Email Management Solution</p>
              <div className="h-1 w-20 bg-blue-500 mb-6"></div>
              <p className="text-gray-600 mb-6">BidVault helps you organize and manage your emails efficiently by:</p>
              
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">Securely connecting to your Gmail account</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">Storing and organizing your emails in a database</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">Saving attachments to Google Drive for easy access</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">Providing a clean, searchable interface for your inbox</span>
                </li>
              </ul>
            </div>

            {status === "loading" ? (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
              </div>
            ) : status === "authenticated" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-4 p-4 bg-gray-50 rounded-lg">
                  {session.user.image && (
                    <Image
                      src={session.user.image}
                      alt="Profile"
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  )}
                  <div className="text-left">
                    <p className="font-medium text-black">{session.user.name}</p>
                    <p className="text-sm text-gray-600">{session.user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={() => signOut()}
                  className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-300 rounded-md shadow-sm px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                    <path d="M1 1h22v22H1z" fill="none" />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              </div>
            )}
          </div>
          
          <div className="hidden md:block md:w-1/2 bg-blue-600 p-12">
            <div className="h-full flex flex-col justify-center">
              <div className="text-white">
                <svg className="w-12 h-12 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h2 className="text-3xl font-bold mb-4">Streamline Your Email Workflow</h2>
                <p className="text-blue-100 mb-6">BidVault helps you organize and access your emails and attachments efficiently, all in one place.</p>
                
                <div className="space-y-4">
                  <div className="flex items-center">
                    <div className="bg-blue-500 rounded-full p-2 mr-3">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <p className="text-white">Secure Gmail Integration</p>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="bg-blue-500 rounded-full p-2 mr-3">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                      </svg>
                    </div>
                    <p className="text-white">Attachment Management</p>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="bg-blue-500 rounded-full p-2 mr-3">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <p className="text-white">Advanced Search Capabilities</p>  
                  </div>
                  <div className="h-1 w-20 bg-white"></div>
                  <div>
                    <p className="text-white italic">Developed By <span className="font-bold">Vishv Boda</span></p>  
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add global CSS for grid pattern
import './grid-pattern.css';
