const express = require('express');
const service = require('../services/bookingService');
const { verifyToken } = require('../middleware/auth');
const { apiError, fail } = require('../services/rentalShared');

module.exports = io => {
  const router = express.Router();
  router.use(verifyToken);
  const handler = fn => async (req, res) => { try { await fn(req, res); } catch (error) { apiError(res, error); } };
  const notify = booking => {
    if (!io) return;
    io.to(`user:${booking.userId}`).to(`user:${booking.station.ownerId}`).to('admin').emit('booking.updated', { id: booking.id, status: booking.status });
  };
  router.post('/quote', handler(async (req, res) => res.json({ quote: await service.quote(req.user.id, req.body) })));
  router.post('/request', handler(async (req, res) => {
    const booking = await service.request(req.user.id, req.body);
    notify(booking);
    res.status(201).json({ success: true, booking });
  }));
  // Legacy create path delegates to the same validated request service. Client userId is ignored.
  router.post('/create', handler(async (req, res) => {
    const booking = await service.request(req.user.id, req.body);
    notify(booking);
    res.status(201).json({ success: true, booking });
  }));
  router.get('/mine', handler(async (req, res) => res.json({ bookings: await service.getUserBookings(req.user.id) })));
  router.get('/host', handler(async (req, res) => res.json(await service.getHostBookings(req.user.id))));
  router.get('/user/:userId', handler(async (req, res) => {
    if (req.params.userId !== req.user.id) fail('Only your own booking history is available here.', 403, 'FORBIDDEN');
    res.json(await service.getUserBookings(req.user.id));
  }));
  router.post('/confirm', handler(async (req, res) => {
    const booking = await service.action(req.body.bookingId, req.user.id, { action: 'accept' });
    notify(booking);
    res.json({ success: true, booking });
  }));
  router.post('/extend', handler(async () => fail('Extensions are not supported in this phase. Request a separate future interval.', 409, 'NOT_SUPPORTED')));
  router.get('/:id', handler(async (req, res) => res.json({ booking: await service.getBooking(req.params.id, req.user.id) })));
  router.post('/:id/report',handler(async(req,res)=>res.status(201).json({report:await require('../services/listingEvidence').report(req.user.id,req.params.id,req.body)})));
  router.post('/:id/action', handler(async (req, res) => {
    const booking = await service.action(req.params.id, req.user.id, req.body);
    notify(booking);
    res.json({ success: true, booking });
  }));
  return router;
};
