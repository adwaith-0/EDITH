const axios = require('axios');
const crypto = require('crypto');

// In-memory cache
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Deduplication threshold in meters (FIXED: was 25, now 20)
const DEDUP_THRESHOLD_METERS = 20;

// Source priority for deduplication (higher = preferred)
const SOURCE_PRIORITY = { google: 3, openchargemap: 2, osm: 1 };

/**
 * Calculate distance between two points in meters (Haversine formula)
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Sleep helper for pagination delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate proper radius from viewport bounds
 * Returns radius that covers the entire viewport (center to farthest corner)
 */
function calculateViewportRadius(bounds) {
    const { north, south, east, west } = bounds;
    const centerLat = (north + south) / 2;
    const centerLng = (east + west) / 2;

    // Calculate distance to all four corners and take maximum
    const corners = [
        [north, east], [north, west], [south, east], [south, west]
    ];

    let maxRadius = 0;
    for (const [lat, lng] of corners) {
        const dist = getDistanceMeters(centerLat, centerLng, lat, lng);
        if (dist > maxRadius) maxRadius = dist;
    }

    return { centerLat, centerLng, radius: Math.ceil(maxRadius) };
}

class ExternalStationsService {

    /**
     * Main entry point to fetch stations from ALL sources (MERGED)
     */
    async fetchStations({ lat, lng, radius = 15000, bounds }) {
        // Compute proper center and radius from bounds if available
        let searchLat = lat;
        let searchLng = lng;
        let searchRadius = radius;

        if (bounds) {
            const vp = calculateViewportRadius(bounds);
            searchLat = vp.centerLat;
            searchLng = vp.centerLng;
            searchRadius = Math.max(vp.radius, 5000); // Minimum 5km
        }

        const cacheKey = this.generateCacheKey({ lat: searchLat, lng: searchLng, radius: searchRadius, bounds });

        // Check cache
        if (cache.has(cacheKey)) {
            const entry = cache.get(cacheKey);
            if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
                console.log('⚡ Cache hit for stations request');
                return { ...entry.data, meta: { ...entry.data.meta, cached: true } };
            }
        }

        console.log(`🔍 Fetching stations: center=(${searchLat.toFixed(4)}, ${searchLng.toFixed(4)}), radius=${searchRadius}m`);

        // Fetch ALL sources in PARALLEL
        const [googleStations, ocmStations, osmStations] = await Promise.all([
            this.fetchGoogleStationsWithPagination(searchLat, searchLng, searchRadius),
            this.fetchOpenChargeMap(searchLat, searchLng, searchRadius),
            this.fetchOpenStreetMap(searchLat, searchLng, searchRadius, bounds)
        ]);

        console.log(`📊 Raw counts: Google=${googleStations.length}, OCM=${ocmStations.length}, OSM=${osmStations.length}`);

        // Merge all stations (priority order: google > ocm > osm)
        const allStations = [...googleStations, ...ocmStations, ...osmStations];
        const rawTotal = allStations.length;

        // Deduplicate
        const dedupedStations = this.deduplicateStations(allStations);
        const dedupedCount = rawTotal - dedupedStations.length;

        // Warn if >30% dropped
        if (rawTotal > 0 && (dedupedCount / rawTotal) > 0.3) {
            console.warn(`⚠️ WARNING: Deduplication removed ${dedupedCount}/${rawTotal} (${Math.round(dedupedCount / rawTotal * 100)}%) - may be too aggressive!`);
        }

        console.log(`✅ Final: ${dedupedStations.length} unique stations (removed ${dedupedCount} duplicates)`);

        const response = {
            stations: dedupedStations, // NO LIMIT - return ALL
            meta: {
                googleCount: googleStations.length,
                openChargeMapCount: ocmStations.length,
                osmCount: osmStations.length,
                rawTotal: rawTotal,
                deduped: dedupedCount,
                finalCount: dedupedStations.length,
                viewport: bounds || null,
                cached: false,
                timestamp: Date.now()
                ,warning: osmStations.coverageWarning || '', queryComplete: !osmStations.coverageWarning
            }
        };

        // Cache result
        cache.set(cacheKey, { timestamp: Date.now(), data: response });

        return response;
    }

    /**
     * Google Places Text Search WITH FULL PAGINATION
     * Consumes all next_page_token (up to 3 pages = ~60 results)
     */
    async fetchGoogleStationsWithPagination(lat, lng, radius) {
        if (!process.env.GOOGLE_PLACES_API_KEY) {
            console.warn('❌ Missing GOOGLE_PLACES_API_KEY');
            return [];
        }

        const allResults = [];
        const queries = [
            'EV charging station',
            'electric vehicle charger',
            'charging station'
        ];

        // Try multiple queries for better coverage
        for (const query of queries) {
            try {
                const results = await this.fetchGooglePagesForQuery(lat, lng, radius, query);
                allResults.push(...results);
            } catch (error) {
                console.error(`Google query "${query}" error:`, error.message);
            }
        }

        // Dedupe results from multiple queries (same place_id)
        const uniqueById = new Map();
        for (const station of allResults) {
            if (!uniqueById.has(station.id)) {
                uniqueById.set(station.id, station);
            }
        }

        return Array.from(uniqueById.values());
    }

    /**
     * Fetch all pages for a single Google query
     */
    async fetchGooglePagesForQuery(lat, lng, radius, query) {
        const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
        const allResults = [];
        let pageToken = null;
        let pageCount = 0; let tokenRetries = 0;
        const MAX_PAGES = 3;

        do {
            const params = {
                query: query,
                location: `${lat},${lng}`,
                radius: radius,
                key: process.env.GOOGLE_PLACES_API_KEY
            };

            if (pageToken) {
                params.pagetoken = pageToken;
            }

            const response = await axios.get(url, { params, timeout: 10000 });

            if (response.data.status === 'OK' || response.data.status === 'ZERO_RESULTS') {
                const results = response.data.results || [];
                console.log(`🔌 Google "${query}" page ${pageCount + 1}: ${results.length} results`);

                for (const place of results) {
                    allResults.push({
                        id: `google-${place.place_id}`,
                        source: 'google',
                        name: place.name,
                        location: {
                            lat: place.geometry.location.lat,
                            lng: place.geometry.location.lng
                        },
                        address: place.formatted_address,
                        connectors: [],
                        status: 'unknown', // Business opening status is not live connector telemetry.
                        discoveryOnly: true, raw: place
                    });
                }

                pageToken = response.data.next_page_token || null;
                pageCount++;

                // Google requires 2-second delay before using next_page_token
                if (pageToken && pageCount < MAX_PAGES) {
                    await sleep(2000);
                }
            } else if (response.data.status === 'INVALID_REQUEST' && pageToken) {
                // Token might not be ready yet, retry after delay
                if (++tokenRetries > 2) break;
                console.log('⏳ Token not ready, waiting...');
                await sleep(2000);
                continue;
            } else {
                console.warn(`⚠️ Google API: ${response.data.status} - ${response.data.error_message || ''}`);
                break;
            }

        } while (pageToken && pageCount < MAX_PAGES);

        return allResults;
    }

    /**
     * OpenChargeMap API
     */
    async fetchOpenChargeMap(lat, lng, radius) {
        const apiKey = process.env.OPENCHARGEMAP_API_KEY;
        const distanceKm = Math.max(radius / 1000, 5); // Minimum 5km

        try {
            const response = await axios.get('https://api.openchargemap.io/v3/poi/', {
                params: {
                    output: 'json',
                    latitude: lat,
                    longitude: lng,
                    distance: distanceKm,
                    distanceunit: 'KM',
                    maxresults: 200, // Increased from 50
                    compact: true,
                    verbose: false,
                    key: apiKey
                },
                headers: apiKey ? { 'X-API-Key': apiKey } : {},
                timeout: 10000
            });

            console.log(`🔋 OpenChargeMap: ${response.data.length} results`);

            return response.data.map(poi => ({
                id: `ocm-${poi.ID}`,
                source: 'openchargemap',
                name: poi.AddressInfo?.Title || 'EV Charging Station',
                location: {
                    lat: poi.AddressInfo?.Latitude,
                    lng: poi.AddressInfo?.Longitude
                },
                address: poi.AddressInfo?.AddressLine1 || poi.AddressInfo?.Town,
                connectors: (poi.Connections || []).map(c => ({
                    type: c.ConnectionType?.Title || 'Unknown',
                    powerKW: c.PowerKW
                })),
                status: 'unknown', // Operational metadata does not establish live availability.
                discoveryOnly: true, raw: poi
            })).filter(s => Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng));

        } catch (error) {
            console.error('OpenChargeMap API Error:', error.message);
            return [];
        }
    }

    /**
     * OpenStreetMap Overpass API - Enhanced query
     */
    async fetchOpenStreetMap(lat, lng, radius, bounds) {
        try { return await require('./chargerDirectory').nearby(lat,lng,radius); }
        catch (error) { console.warn('Public directory unavailable:',error.message); return []; }
    }

    generateCacheKey({ lat, lng, radius, bounds }) {
        if (bounds) {
            return crypto.createHash('md5').update(JSON.stringify(bounds)).digest('hex');
        }
        const rLat = Math.round(lat * 1000) / 1000;
        const rLng = Math.round(lng * 1000) / 1000;
        return `${rLat}-${rLng}-${radius}`;
    }

    /**
     * Deduplicate stations with 20m threshold
     * Priority: google > openchargemap > osm
     */
    deduplicateStations(stations) {
        // Sort by priority (highest first)
        const sorted = [...stations].sort((a, b) => {
            return (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0);
        });

        const unique = [];

        for (const station of sorted) {
            let isDuplicate = false;

            for (const existing of unique) {
                if (!Number.isFinite(station.location.lat) || !Number.isFinite(station.location.lng)) continue;
                if (!Number.isFinite(existing.location.lat) || !Number.isFinite(existing.location.lng)) continue;

                const dist = getDistanceMeters(
                    station.location.lat, station.location.lng,
                    existing.location.lat, existing.location.lng
                );

                // Only dedupe if within 20m AND names are similar (or one is generic)
                if (dist < DEDUP_THRESHOLD_METERS) {
                    // Check if names match (fuzzy)
                    const name1 = (station.name || '').toLowerCase();
                    const name2 = (existing.name || '').toLowerCase();
                    const isGeneric = name1.includes('charging station') || name2.includes('charging station');
                    const namesMatch = name1 === name2 || name1.includes(name2) || name2.includes(name1);

                    if (dist < 10 || namesMatch || isGeneric) {
                        isDuplicate = true;
                        break;
                    }
                }
            }

            if (!isDuplicate) {
                unique.push(station);
            }
        }

        return unique;
    }
}

module.exports = new ExternalStationsService();
