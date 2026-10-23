/**
 * Admin Routes
 * Protected endpoints for admin dashboard
 * All routes require authentication and ADMIN role
 */

const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const adminService = require('../services/adminService');

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(verifyToken);
router.use(requireAdmin);

/**
 * GET /api/admin/current-bookings
 * Returns recent bookings (active and past) for history
 */
router.get('/current-bookings', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const bookings = await adminService.getRecentBookings(limit);
        res.json({ bookings });
    } catch (error) {
        console.error('Get recent bookings error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// ... (previous code)

/**
 * GET /api/admin/available-slots
 * Returns available slots per station/connector
 */
router.get('/available-slots', async (req, res) => {
    try {
        const slots = await adminService.getAvailableSlots();
        res.json({ slots });
    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({ error: 'Failed to fetch available slots' });
    }
});

/**
 * GET /api/admin/payments
 * Returns payment statistics for today/week/month
 */
router.get('/payments', async (req, res) => {
    try {
        const range = req.query.range || 'today';
        const stats = await adminService.getPaymentStats(range);
        res.json(stats);
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ error: 'Failed to fetch payment statistics' });
    }
});

/**
 * GET /api/admin/electricity
 * Returns electricity usage statistics
 */
router.get('/electricity', async (req, res) => {
    try {
        const range = req.query.range || 'today';
        const stats = await adminService.getElectricityStats(range);
        res.json(stats);
    } catch (error) {
        console.error('Get electricity error:', error);
        res.status(500).json({ error: 'Failed to fetch electricity statistics' });
    }
});

/**
 * GET /api/admin/vehicles/usage
 * Returns vehicle usage statistics
 */
router.get('/vehicles/usage', async (req, res) => {
    try {
        const range = req.query.range || 'month';
        const usage = await adminService.getVehicleUsage(range);
        res.json({ vehicles: usage });
    } catch (error) {
        console.error('Get vehicle usage error:', error);
        res.status(500).json({ error: 'Failed to fetch vehicle usage' });
    }
});

/**
 * GET /api/admin/bookings
 * Returns bookings with filters and pagination
 */
router.get('/bookings', async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            stationId: req.query.stationId,
            vehicleType: req.query.vehicleType,
            status: req.query.status,
            page: parseInt(req.query.page) || 1,
            size: parseInt(req.query.size) || 20,
        };
        const result = await adminService.getBookings(filters);
        res.json(result);
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

/**
 * POST /api/admin/booking/force-cancel
 * Admin force cancellation of a booking
 */
router.post('/booking/force-cancel', async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ error: 'Booking ID is required' });
        }

        const booking = await adminService.forceCancelBooking(bookingId, req.user.id);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to('admin').to(`user:${booking.userId}`).to(`user:${booking.station.ownerId}`).emit('booking.cancelled', {
                booking,
                cancelledBy: 'admin',
                adminId: req.user.id,
            });
        }

        res.json({ success: true, booking });
    } catch (error) {
        console.error('Force cancel error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/admin/vehicle-search
 * Search vehicles for autocomplete
 */
router.get('/vehicle-search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const vehicles = await adminService.searchVehicles(query);
        res.json({ vehicles });
    } catch (error) {
        console.error('Vehicle search error:', error);
        res.status(500).json({ error: 'Failed to search vehicles' });
    }
});

/**
 * GET /api/admin/dashboard
 * Returns aggregated dashboard data
 */
router.get('/dashboard', async (req, res) => {
    try {
        const [
            activeCount,
            recentBookings,
            availableSlots,
            todayPayments,
            weekPayments,
            monthPayments,
            todayElectricity,
        ] = await Promise.all([
            adminService.getActiveBookingsCount(),
            adminService.getRecentBookings(10),
            adminService.getAvailableSlots(),
            adminService.getPaymentStats('today'),
            adminService.getPaymentStats('week'),
            adminService.getPaymentStats('month'),
            adminService.getElectricityStats('today'),
        ]);

        // Calculate totals
        const totalAvailableSlots = availableSlots.reduce((sum, s) => sum + s.availableSlots, 0);

        res.json({
            activeBookingsCount: activeCount,
            totalAvailableSlots,
            todayRevenueCents: todayPayments.totalAmountCents,
            weekRevenueCents: weekPayments.totalAmountCents,
            monthRevenueCents: monthPayments.totalAmountCents,
            todayEnergyKwh: todayElectricity.totalEnergyKwh,
            recentBookings: recentBookings.slice(0, 5),
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

module.exports = router;
