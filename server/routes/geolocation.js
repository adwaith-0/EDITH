const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * GET /api/geolocation
 * Uses Google Geolocation API to get location based on IP
 */
router.get('/', async (req, res) => {
    try {
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: 'Google API key not configured'
            });
        }

        // Call Google Geolocation API
        const response = await axios.post(
            `https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`,
            {
                considerIp: true
            }
        );

        const { location, accuracy } = response.data;

        res.json({
            lat: location.lat,
            lng: location.lng,
            accuracy: accuracy || 5000
        });

    } catch (error) {
        console.error('Google Geolocation API error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch location',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

module.exports = router;
