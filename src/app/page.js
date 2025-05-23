'use client';

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-black">Application</h1>
          <p className="text-gray-600">Login with Google to access your dashboard</p>
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
                <p className="font-medium">{session.user.name}</p>
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
    </div>
  );
}
