/**
 * Admin Service
 * Business logic for admin dashboard queries
 */

const prisma = require('../lib/prisma');

/**
 * Get recent bookings (All statuses, for history)
 */
async function getRecentBookings(limit = 50) {
    await prisma.booking.updateMany({
        where: { status: 'REQUESTED', expiresAt: { lte: new Date() } },
        data: { status: 'EXPIRED' },
    });
    const bookings = await prisma.booking.findMany({
        orderBy: { createdAt: 'desc' }, // Show newest actions first
        take: limit,
        include: {
            user: { select: { id: true, name: true, email: true } },
            station: { select: { id: true, name: true, address: true } },
            connector: { select: { id: true, connectorType: true, powerKw: true } },
            vehicle: { select: { id: true, vehicleType: true, model: true, externalVehicleId: true } },
        },
    });

    const now = new Date();
    // Calculate remaining time for each booking
    return bookings.map((booking) => ({
        ...booking,
        remainingSeconds: Math.max(0, Math.floor((new Date(booking.slotEnd).getTime() - now.getTime()) / 1000)),
    }));
}

/**
 * Get count of currently active bookings
 */
async function getActiveBookingsCount() {
    const now = new Date();
    return prisma.booking.count({
        where: {
            OR: [
                {
                    status: 'CONFIRMED',
                    slotStart: { lte: now },
                    slotEnd: { gt: now },
                },
                { status: 'IN_PROGRESS' },
            ],
        },
    });
}

/**
 * Get available slots per station/connector
 */
async function getAvailableSlots() {
    const now = new Date();

    // Get all connectors with their stations
    const connectors = await prisma.connector.findMany({
        where: { station: { kind: 'PRIVATE_RENTAL', published: true, availabilityWindows: { some: { startsAt: { lte: now }, endsAt: { gt: now } } } } },
        include: {
            station: { select: { id: true, name: true, address: true } },
        },
    });

    // Get active bookings count per connector
    const activeBookings = await prisma.booking.groupBy({
        by: ['connectorId'],
        where: {
            status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
            slotStart: { lte: now },
            slotEnd: { gt: now },
        },
        _count: { id: true },
    });

    // Create a map of connector -> active count
    const activeCountMap = new Map();
    activeBookings.forEach((b) => {
        activeCountMap.set(b.connectorId, b._count.id);
    });

    // Calculate available slots
    return connectors.map((connector) => ({
        stationId: connector.station.id,
        stationName: connector.station.name,
        stationAddress: connector.station.address,
        connectorId: connector.id,
        connectorType: connector.connectorType,
        powerKw: connector.powerKw,
        totalSlots: connector.slotCount,
        occupiedSlots: activeCountMap.get(connector.id) || 0,
        availableSlots: connector.slotCount - (activeCountMap.get(connector.id) || 0),
    }));
}

/**
 * Get payment statistics for a given range
 * EXCLUDES Cancelled bookings revenue
 */
/**
 * Get revenue statistics for a given range
 * Calculated from Booking table (CONFIRMED or COMPLETED)
 */
async function getPaymentStats(range = 'today') {
    const now = new Date();
    let startDate;

    switch (range) {
        case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case 'today':
        default:
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
    }

    // Filter: Valid bookings (CONFIRMED or COMPLETED) created in range
    const where = {
        status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
        createdAt: { gte: startDate },
    };

    // Get total revenue
    const total = await prisma.booking.aggregate({
        where,
        _sum: { amountCents: true },
        _count: { id: true },
    });

    // Get daily breakdown
    const bookings = await prisma.booking.findMany({
        where,
        select: {
            amountCents: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const dailyMap = new Map();
    bookings.forEach((b) => {
        const day = b.createdAt.toISOString().split('T')[0];
        // Handle potential null amountCents by defaulting to 0
        const amount = b.amountCents || 0;
        dailyMap.set(day, (dailyMap.get(day) || 0) + amount);
    });

    const timeseries = Array.from(dailyMap.entries()).map(([date, amount]) => ({
        date,
        amountCents: amount,
    }));

    return {
        range,
        totalAmountCents: total._sum.amountCents || 0,
        totalCount: total._count.id || 0,
        timeseries,
    };
}

/**
 * Get electricity usage statistics
 */
async function getElectricityStats(range = 'today') {
    // The legacy booking engine wrote estimates into energyKwh. Phase 1 has no
    // metering integration, so neither those records nor new sessions prove delivery.
    return { range, totalEnergyKwh: null, timeseries: [], measurementAvailable: false };
}

/**
 * Get vehicle usage statistics
 */
async function getVehicleUsage(range = 'month') {
    const now = new Date();
    let startDate;

    switch (range) {
        case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
        default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
    }

    const usage = await prisma.booking.groupBy({
        by: ['vehicleId'],
        where: {
            status: 'CONFIRMED',
            createdAt: { gte: startDate },
        },
        _count: { id: true },
        _sum: { energyKwh: true },
    });

    // Get vehicle details
    const vehicleIds = usage.map((u) => u.vehicleId);
    const vehicles = await prisma.vehicle.findMany({
        where: { id: { in: vehicleIds } },
    });

    const vehicleMap = new Map();
    vehicles.forEach((v) => vehicleMap.set(v.id, v));

    return usage
        .map((u) => ({
            vehicle: vehicleMap.get(u.vehicleId),
            usageCount: u._count.id,
            totalEnergyKwh: null, // No supported measurement in phase 1.
        }))
        .sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * Get bookings with filters and pagination
 */
async function getBookings(filters = {}) {
    const {
        startDate,
        endDate,
        stationId,
        vehicleType,
        status,
        page = 1,
        size = 20,
    } = filters;

    const where = {};

    if (startDate && startDate !== 'undefined') {
        where.slotStart = { gte: new Date(startDate) };
    }
    if (endDate && endDate !== 'undefined') {
        where.slotEnd = { lte: new Date(endDate) };
    }
    if (stationId && stationId !== 'undefined') {
        where.stationId = stationId;
    }
    if (status && status !== 'undefined' && status !== 'ALL') {
        where.status = status;
    }
    if (vehicleType && vehicleType !== 'undefined') {
        where.vehicle = { vehicleType };
    }

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, email: true } },
                station: { select: { id: true, name: true, address: true } },
                connector: { select: { id: true, connectorType: true, powerKw: true } },
                vehicle: { select: { id: true, vehicleType: true, model: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * size,
            take: size,
        }),
        prisma.booking.count({ where }),
    ]);

    return {
        bookings,
        pagination: {
            page,
            size,
            total,
            totalPages: Math.ceil(total / size),
        },
    };
}

/**
 * Force cancel a booking (admin action)
 */
async function forceCancelBooking(bookingId, adminId) {
    return prisma.$transaction(async tx => {
        const initial = await tx.booking.findUnique({ where: { id: bookingId } });
        if (!initial) throw new Error('Booking not found');
        await tx.$queryRaw`SELECT id FROM "Connector" WHERE id = ${initial.connectorId} FOR UPDATE`;
        const booking = await tx.booking.findUnique({ where: { id: bookingId } });
        if (!['REQUESTED', 'CONFIRMED'].includes(booking.status) || booking.slotStart <= new Date()) {
            throw new Error('Only requested or confirmed bookings before session start can be cancelled');
        }
        const updated = await tx.booking.update({
            where: { id: bookingId },
            data: { status: 'CANCELLED', hostResponse: 'Cancelled by an administrator before session start.' },
            include: {
                user: { select: { id: true, name: true, email: true } },
                station: { select: { id: true, name: true, ownerId: true } },
            },
        });
        await tx.audit.create({ data: {
            entityType: 'Booking', entityId: bookingId, action: 'FORCE_CANCEL',
            data: { adminId, previousStatus: booking.status, reason: 'Administrator cancellation' },
        } });
        return updated;
    });
}

/**
 * Search vehicles (local database)
 */
async function searchVehicles(query, limit = 10) {
    if (!query || query.length < 2) {
        return [];
    }

    return prisma.vehicle.findMany({
        where: {
            OR: [
                { model: { contains: query, mode: 'insensitive' } },
                { externalVehicleId: { contains: query, mode: 'insensitive' } },
            ],
        },
        take: limit,
    });
}

module.exports = {
    getRecentBookings,
    getActiveBookingsCount,
    getAvailableSlots,
    getPaymentStats,
    getElectricityStats,
    getVehicleUsage,
    getBookings,
    forceCancelBooking,
    searchVehicles,
};
