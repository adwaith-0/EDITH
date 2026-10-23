/**
 * Authentication Middleware
 * JWT-based authentication with role verification
 */

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || /fallback-secret|change.in.production|your.secret|replace-with/i.test(JWT_SECRET)) {
    throw new Error('Configure JWT_SECRET with a random secret of at least 32 characters.');
}

/**
 * Verify JWT token from Authorization header
 */
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (typeof decoded.id !== 'string') return res.status(401).json({ error: 'Invalid token' });
        const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, name: true, email: true, role: true } });
        if (!user) return res.status(401).json({ error: 'Account no longer exists' });
        req.user = user;
        next();
    } catch (error) {
        if (!['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error.name)) return res.status(503).json({ error: 'Authentication service unavailable' });
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Require ADMIN role
 * Must be used after verifyToken middleware
 */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

module.exports = {
    verifyToken,
    requireAdmin,
    generateToken,
    JWT_SECRET,
};
