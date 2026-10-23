const express = require('express');
const router = express.Router();
const externalStationsService = require('../services/externalStationsService');

router.get('/', async (req, res) => {
    try {
        const { lat, lng, radius, north, south, east, west } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ error: 'Missing required parameters: lat, lng' });
        }

        // Parse params
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const searchRadius = radius ? parseInt(radius) : 5000;
        if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180 || !Number.isFinite(searchRadius) || searchRadius < 100 || searchRadius > 100000) {
            return res.status(400).json({ error: 'Use valid coordinates and a radius between 100 and 100000 metres.' });
        }

        let bounds = null;
        if(req.query.preferCache==='true'){
            const directory=require('../services/chargerDirectory'),stations=directory.cachedNearby(userLat,userLng,searchRadius);
            if(stations.length)return res.json({stations,meta:{cached:true,snapshotAt:directory.snapshotAt,queryComplete:false,warning:'Cached mapped directory. Coverage is partial; refresh live sources for newer records.'}});
        }
        if (north && south && east && west) {
            bounds = {
                north: parseFloat(north),
                south: parseFloat(south),
                east: parseFloat(east),
                west: parseFloat(west)
            };
            if (Object.values(bounds).some(value => !Number.isFinite(value)) || bounds.north > 90 || bounds.south < -90 || bounds.east > 180 || bounds.west < -180 || bounds.north <= bounds.south || bounds.east <= bounds.west) {
                return res.status(400).json({ error: 'Invalid search bounds.' });
            }
        }

        const data = await externalStationsService.fetchStations({
            lat: userLat,
            lng: userLng,
            radius: searchRadius,
            bounds
        });

        res.json(data);

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
    }
});

module.exports = router;
