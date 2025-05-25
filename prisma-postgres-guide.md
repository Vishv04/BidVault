# Prisma and PostgreSQL Guide for Beginners

## Table of Contents
1. [Introduction](#introduction)
2. [Setting Up Prisma with PostgreSQL](#setting-up-prisma-with-postgresql)
3. [Prisma Schema Basics](#prisma-schema-basics)
4. [Models and Relations](#models-and-relations)
5. [Migrations](#migrations)
6. [Common Issues and Solutions](#common-issues-and-solutions)
7. [Prisma Client Usage](#prisma-client-usage)
8. [Best Practices](#best-practices)

## Introduction

Prisma is a modern database toolkit that simplifies database access with an auto-generated and type-safe query builder for TypeScript and Node.js. PostgreSQL is a powerful, open-source relational database system.

## Setting Up Prisma with PostgreSQL

### Prerequisites
- Node.js installed
- PostgreSQL installed and running

### Installation Steps

1. **Initialize a Node.js project** (if not already done):
   ```bash
   npm init -y
   ```

2. **Install Prisma as a development dependency**:
   ```bash
   npm install prisma --save-dev
   ```

3. **Initialize Prisma in your project**:
   ```bash
   npx prisma init
   ```

4. **Configure your database connection** in the `.env` file:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/your_database?schema=public"
   ```

5. **Create your Prisma schema** in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }

   generator client {
     provider = "prisma-client-js"
   }

   // Define your models here
   ```

## Prisma Schema Basics

The Prisma schema file (schema.prisma) is the main configuration file for your Prisma setup. It consists of:

1. **Data source**: Specifies your database connection
2. **Generator**: Indicates what clients should be generated
3. **Data model**: Defines your application models

### Example:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Models and Relations

### Data Types

Prisma supports various data types:

- **String**: Text values
- **Int**: Integer numbers
- **Float**: Floating-point numbers
- **Boolean**: True/false values
- **DateTime**: Date and time values
- **Json**: JSON data
- **Bytes**: Binary data
- **Decimal**: Decimal numbers with arbitrary precision

### Attributes

Attributes modify the behavior of fields or models:

- **@id**: Marks a field as the primary key
- **@unique**: Ensures the field's value is unique
- **@default**: Sets a default value
- **@relation**: Defines relationships between models
- **@map**: Maps a field to a different column name in the database
- **@@map**: Maps a model to a different table name

### Relationships

Prisma supports various types of relationships:

1. **One-to-One**:
   ```prisma
   model User {
     id      String  @id @default(cuid())
     profile Profile?
   }

   model Profile {
     id     String @id @default(cuid())
     user   User   @relation(fields: [userId], references: [id])
     userId String @unique
   }
   ```

2. **One-to-Many**:
   ```prisma
   model User {
     id    String @id @default(cuid())
     posts Post[]
   }

   model Post {
     id       String @id @default(cuid())
     author   User   @relation(fields: [authorId], references: [id])
     authorId String
   }
   ```

3. **Many-to-Many**:
   ```prisma
   model Post {
     id       String   @id @default(cuid())
     tags     Tag[]    @relation("PostToTag")
   }

   model Tag {
     id       String   @id @default(cuid())
     posts    Post[]   @relation("PostToTag")
   }
   ```

## Migrations

Migrations allow you to evolve your database schema over time.

### Creating Migrations

1. **Create a migration**:
   ```bash
   npx prisma migrate dev --name migration_name
   ```

2. **Apply migrations to production**:
   ```bash
   npx prisma migrate deploy
   ```

### Migration Commands

- `prisma migrate dev`: Creates a new migration and applies it in development
- `prisma migrate reset`: Resets the database and applies all migrations
- `prisma migrate deploy`: Applies pending migrations in production
- `prisma migrate status`: Shows the status of migrations

### Troubleshooting Migrations

If you encounter issues with migrations:

1. **Reset the database** (development only):
   ```bash
   npx prisma migrate reset --force
   ```

2. **Delete the migrations directory** and start fresh:
   ```bash
   rm -rf prisma/migrations
   npx prisma migrate dev --name init
   ```

## Common Issues and Solutions

### Issue: Relations Not Being Created

**Problem**: You've defined a relation in your schema, but it's not reflected in the database.

**Solution**:
1. Make sure both models have the relation defined correctly
2. Check that the field names match the reference names
3. Reset migrations and create a new one

Example:
```prisma
model Email {
  id          String       @id @default(cuid())
  // other fields
  attachments Attachment[] // This defines the relation
}

model Attachment {
  id      String @id @default(cuid())
  email   Email  @relation(fields: [emailId], references: [id])
  emailId String
}
```

### Issue: Type Mismatch

**Problem**: Type errors when using Prisma Client.

**Solution**: Regenerate the Prisma Client after schema changes:
```bash
npx prisma generate
```

### Issue: Migration Drift

**Problem**: Your database schema doesn't match your migration history.

**Solution**: In development, reset the database:
```bash
npx prisma migrate reset --force
```

## Prisma Client Usage

After defining your schema, you need to generate and use the Prisma Client.

### Generating the Client

```bash
npx prisma generate
```

### Basic CRUD Operations

```javascript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Create
async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: 'user@example.com',
      name: 'John Doe',
    },
  })
  return user
}

// Read
async function getUsers() {
  const users = await prisma.user.findMany()
  return users
}

// Update
async function updateUser(id, data) {
  const user = await prisma.user.update({
    where: { id },
    data,
  })
  return user
}

// Delete
async function deleteUser(id) {
  await prisma.user.delete({
    where: { id },
  })
}
```

### Working with Relations

```javascript
// Create a user with posts
async function createUserWithPosts() {
  const user = await prisma.user.create({
    data: {
      email: 'user@example.com',
      name: 'John Doe',
      posts: {
        create: [
          { title: 'Post 1', content: 'Content 1' },
          { title: 'Post 2', content: 'Content 2' },
        ],
      },
    },
    include: {
      posts: true, // Include posts in the response
    },
  })
  return user
}

// Get users with their posts
async function getUsersWithPosts() {
  const users = await prisma.user.findMany({
    include: {
      posts: true,
    },
  })
  return users
}
```

## Best Practices

1. **Use transactions** for operations that modify multiple records:
   ```javascript
   const [user, post] = await prisma.$transaction([
     prisma.user.create({ data: { email: 'user@example.com' } }),
     prisma.post.create({ data: { title: 'Post' } }),
   ])
   ```

2. **Close the Prisma Client** when your application shuts down:
   ```javascript
   // In your main file
   process.on('beforeExit', async () => {
     await prisma.$disconnect()
   })
   ```

3. **Use middleware** for logging or modifying queries:
   ```javascript
   prisma.$use(async (params, next) => {
     const before = Date.now()
     const result = await next(params)
     const after = Date.now()
     console.log(`Query ${params.model}.${params.action} took ${after - before}ms`)
     return result
   })
   ```

4. **Organize your schema** by grouping related models together

5. **Use enums** for fields with a fixed set of values:
   ```prisma
   enum Role {
     USER
     ADMIN
   }

   model User {
     id   String @id @default(cuid())
     role Role   @default(USER)
   }
   ```

6. **Use indexes** for frequently queried fields:
   ```prisma
   model User {
     id    String @id @default(cuid())
     email String @unique
     name  String

     @@index([name])
   }
   ```

7. **Keep migrations small** and focused on specific changes

8. **Version control your migrations** along with your code
