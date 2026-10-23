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
