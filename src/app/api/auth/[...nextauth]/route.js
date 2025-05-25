import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaClient } from "@prisma/client";

// Initialize PrismaClient directly in the API route
const prisma = new PrismaClient();

// Custom adapter for our simplified schema
const customAdapter = {
  async createUser(userData) {
    return prisma.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        image: userData.image,
        emailVerified: userData.emailVerified,
        visitCount: 1,
        firstVisit: new Date(),
        lastVisit: new Date(),
      },
    });
  },
  async getUser(id) {
    return prisma.user.findUnique({ where: { id } });
  },
  async getUserByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },
  async getUserByAccount({ provider, providerAccountId }) {
    const account = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: { user: true },
    });
    return account?.user ?? null;
  },
  async updateUser(user) {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name,
        email: user.email,
        image: user.image,
        emailVerified: user.emailVerified,
      },
    });
  },
  async linkAccount(account) {
    // Store account in the accounts table
    const createdAccount = await prisma.account.create({
      data: {
        userId: account.userId,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        type: account.type,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state,
      },
    });
    
    // Also store tokens in the user record for easier access
    if (account.provider === 'google' && account.access_token) {
      await prisma.user.update({
        where: { id: account.userId },
        data: {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null
        }
      });
    }
    
    return createdAccount;
  },
  async createSession({ sessionToken, userId, expires }) {
    // Store session info in the user record instead
    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: sessionToken,
        expiresAt: expires,
      },
    });
    return { sessionToken, userId, expires };
  },
  async getSessionAndUser(sessionToken) {
    const user = await prisma.user.findFirst({
      where: { accessToken: sessionToken },
    });
    
    if (!user || (user.expiresAt && new Date(user.expiresAt) < new Date())) {
      return null;
    }
    
    return {
      session: { sessionToken, userId: user.id, expires: user.expiresAt },
      user,
    };
  },
  async updateSession({ sessionToken, expires, userId }) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: sessionToken,
        expiresAt: expires,
      },
    });
    return { sessionToken, userId, expires };
  },
  async deleteSession(sessionToken) {
    await prisma.user.updateMany({
      where: { accessToken: sessionToken },
      data: {
        accessToken: null,
        expiresAt: null,
      },
    });
  },
};

export const authOptions = {
  adapter: customAdapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Include Gmail and Drive API scopes to access email data and save attachments
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/drive.file',
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (existingUser) {
          // Update existing user
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              visitCount: { increment: 1 },
              lastVisit: new Date(),
            },
          });

          // Link account if not already linked
          const existingAccount = await prisma.account.findFirst({
            where: {
              userId: existingUser.id,
              provider: account.provider,
            },
          });

          if (!existingAccount) {
            // Create new account with all scopes
            await prisma.account.create({
              data: {
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                refresh_token: account.refresh_token,
                access_token: account.access_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
            });
          } else {
            // Update existing account with new tokens and scopes
            await prisma.account.update({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                },
              },
              data: {
                access_token: account.access_token,
                refresh_token: account.refresh_token || existingAccount.refresh_token,
                expires_at: account.expires_at,
                scope: account.scope, // Update with the latest scopes
                id_token: account.id_token,
              },
            });
          }
        }
      } catch (error) {
        console.error('Error updating visit count:', error);
        // Continue sign in even if update fails
      }
      return true;
    },
    async session({ session, token }) {
      if (token.sub) {
        // Get the latest user data including visit count
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
        });
        
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.role = dbUser.role || 'user';
          session.user.visitCount = dbUser.visitCount || 1;
          session.user.lastVisit = dbUser.lastVisit;
          session.user.firstVisit = dbUser.firstVisit;
        }
      }
      return session;
    },
    async jwt({ token, user, account }) {
      // Add user info to token
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      
      // Add account info to token
      if (account) {
        token.accessToken = account.access_token;
      }
      
      return token;
    },
    async redirect({ url, baseUrl }) {
      // Prevent nested callback URLs
      if (url.startsWith(baseUrl)) {
        // If the URL contains a callbackUrl parameter, extract the base URL
        if (url.includes('callbackUrl')) {
          const urlObj = new URL(url);
          const callbackUrl = urlObj.searchParams.get('callbackUrl');
          
          // If callbackUrl is valid and starts with baseUrl, use it
          if (callbackUrl && callbackUrl.startsWith(baseUrl)) {
            return callbackUrl;
          }
        }
        return url;
      }
      return baseUrl;
    },
  },
  pages: {
    signIn: "/",
    signOut: "/",
    error: "/",
    newUser: "/dashboard",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
