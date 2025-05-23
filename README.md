# Next.js App with Google Authentication and PostgreSQL

This is a [Next.js](https://nextjs.org) application featuring Google authentication and PostgreSQL database integration.

## Features

- Google Authentication with NextAuth.js
- PostgreSQL database integration using Prisma ORM
- User tracking (visit counts, first/last visit)
- Protected dashboard page
- Responsive UI with Tailwind CSS

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

# PostgreSQL Database URL
DATABASE_URL="postgresql://username:password@localhost:5432/dbname?schema=public"

# Public Environment Variables (accessible in browser)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
```

## PostgreSQL Setup

1. Make sure PostgreSQL is installed and running on your system
2. Create a new database for this application
3. Update the `DATABASE_URL` in your `.env` file with your PostgreSQL connection details
4. Run the Prisma migrations to set up your database schema:

```bash
npx prisma migrate dev --name init
```

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
