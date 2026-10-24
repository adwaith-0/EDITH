const path = require('path');
// Load environment variables from .env.local
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const stationRoutes = require('./routes/stations');
const bookingRoutes = require('./routes/bookings');
const externalStationsRouter = require('./routes/externalStations');
const geolocationRouter = require('./routes/geolocation');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const httpServer = http.createServer(app);
const isVercel = Boolean(process.env.VERCEL);

// Vercel terminates the public connection before forwarding it to this server.
if (isVercel) app.set('trust proxy', 1);

// CORS Configuration
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3003', 'http://localhost:3002'];
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/$/, ''));
}
for (const hostname of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (hostname) allowedOrigins.push(`https://${hostname}`);
}

const io = new Server(httpServer, {
    ...(isVercel ? { transports: ['websocket'] } : {}),
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    },
});

// Middleware
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
// Label images are bounded to the AI drafting endpoint; other routes keep the default limit.
app.use('/api/ai', express.json({ limit: '2mb' }));
app.use(express.json());

// Log request paths, never credentials, private access instructions, or request bodies.
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/bookings', bookingRoutes(io));
app.use('/api/rentals', require('./routes/rentals'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/concierge', require('./routes/concierge'));
app.use('/api/ai', require('./routes/aiStudio'));
app.use('/api/stations', stationRoutes);
app.use('/api/external-stations', externalStationsRouter);
app.use('/api/geolocation', geolocationRouter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        await require('./lib/prisma').$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'ready', timestamp: new Date().toISOString() });
    } catch {
        res.status(503).json({ status: 'unavailable', database: 'unavailable', timestamp: new Date().toISOString() });
    }
});

// WebSocket connection with JWT authentication
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        // Allow anonymous connections for general features
        socket.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        socket.user = null;
        next(); // Still allow connection, just without auth
    }
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id, socket.user ? `(${socket.user.email})` : '(anonymous)');

    // Join admin room if user is admin
    if (socket.user?.id) socket.join(`user:${socket.user.id}`);
    if (socket.user && socket.user.role === 'ADMIN') {
        socket.join('admin');
        console.log(`Admin ${socket.user.email} joined admin room`);
    }

    // Handle subscription to booking updates
    socket.on('subscribe:bookings', () => {
        if (socket.user?.id) socket.join(`user:${socket.user.id}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Vercel owns the listener and invocation lifecycle. Export the HTTP server so
// its WebSocket upgrade handler remains available alongside Express routes.
module.exports = httpServer;

if (require.main === module && !isVercel) {
    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
        console.log(`🚀 Backend server running on http://localhost:${PORT}`);
        console.log(`📡 WebSocket server ready`);
        // Local startup can warm speech in the background. Cloud speech loads on
        // demand, inside a request, so work survives the function lifecycle.
        require('./services/neuralVoice').prepare().catch(() => console.log('Neural voice warming failed; playback can retry.'));
    });

    process.on('SIGTERM', () => {
        console.log('SIGTERM received, closing server...');
        httpServer.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}
