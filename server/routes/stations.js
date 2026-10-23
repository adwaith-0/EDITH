const express = require('express');
const router = express.Router();
const stationService = require('../services/stationService');

// Get all stations
router.get('/', (req, res) => {
    try {
        const stations = stationService.getAllStations();
        res.json({ success: true, stations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get station by ID
router.get('/:id', (req, res) => {
    try {
        const station = stationService.getStationById(req.params.id);
        if (!station) {
            return res.status(404).json({ success: false, error: 'Station not found' });
        }
        res.json({ success: true, station });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search stations
router.get('/search/:query', (req, res) => {
    try {
        const stations = stationService.searchStations(req.params.query);
        res.json({ success: true, stations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update station status
router.put('/:id/status', (req, res) => {
    return res.status(405).json({ success: false, error: 'Public stations are discovery-only. Live availability cannot be changed here.' });

});

module.exports = router;
