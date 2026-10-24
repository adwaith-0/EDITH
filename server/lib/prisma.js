/**
 * Prisma Client Helper for Prisma 7+
 * Uses the pg driver adapter for PostgreSQL connections
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// Create connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Each cloud instance has its own pool. Keep it small and use the managed
    // provider's pooled connection URL instead of exhausting database clients.
    max: process.env.VERCEL ? 2 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool, { disposeExternalPool: true });

// Create singleton PrismaClient instance
const prisma = new PrismaClient({ adapter });

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

module.exports = prisma;
