/**
 * Authentication Routes
 * POST /api/auth/login - User login with JWT
 */

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 attempts per window (Relaxed for development)
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 128 || !email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = generateToken(user);

        // Return user info (without password) and token
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });

        console.log(`✅ User logged in: ${user.email} (${user.role})`);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', loginLimiter, async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || !email || !password || !name.trim()) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254 || password.length < 8 || password.length > 128 || name.trim().length > 120) {
            return res.status(400).json({ error: 'Use a valid email, an 8–128 character password, and a name up to 120 characters.' });
        }

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
        });

        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase().trim(),
                passwordHash: hashedPassword,
                name: name.trim(),
                role: 'USER', // Default to USER role
            },
        });

        // Generate token
        const token = generateToken(user);

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
        console.log(`✅ New user signed up: ${user.email} (${user.role})`);
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get('/me', require('../middleware/auth').verifyToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
