const express = require('express');
const service = require('../services/rentalService');
const { verifyToken } = require('../middleware/auth');
const { apiError } = require('../services/rentalShared');
const router = express.Router();
router.use(verifyToken);
router.get('/', async (req, res) => {
  try { res.json({ vehicles: await service.vehicles(req.user.id) }); } catch (error) { apiError(res, error); }
});
router.post('/', async (req, res) => {
  try { res.status(201).json({ vehicle: await service.createVehicle(req.user.id, req.body) }); } catch (error) { apiError(res, error); }
});
module.exports = router;
