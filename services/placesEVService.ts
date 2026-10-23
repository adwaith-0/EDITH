import { useMapStore } from '@/store/mapStore';
import { LatLng } from '@/types/map';
import { ChargingStation, Connector } from '@/types/station';

// Google Places API service for real EV charging stations
class PlacesEVChargingService {
    private placesService: google.maps.places.PlacesService | null = null;

    initialize(map: google.maps.Map) {
        if (!this.placesService) {
            console.log('🔌 PlacesEVService: Initialized with Map Instance');
            this.placesService = new google.maps.places.PlacesService(map);
        }
    }

    // ... (existing methods)

    /**
     * Fetch real EV charging stations from Google Places API
     * @param location User's current location
     * @param radiusMeters Search radius in meters (default 25km for better coverage)
     */
    async fetchRealChargingStations(
        location: LatLng,
        radiusMeters: number = 25000
    ): Promise<ChargingStation[]> {
        // Robust Lazy Initialization
        if (!this.placesService) {
            console.warn('⚠️ PlacesService not initialized (in fetchRealChargingStations). Attempting lazy init from Store...');
            const map = useMapStore.getState().mapInstance;
            if (map) {
                this.initialize(map);
            } else {
                throw new Error('PlacesService not initialized and Map not ready.');
            }
        }

        // Try nearby search first (preferred method)
        console.log('🔍 Starting search for charging stations...');
        const nearbyStations = await this.nearbySearch(location, radiusMeters);

        // Filter out obvious false positives
        const validNearbyStations = nearbyStations.filter(s =>
            this.isValidStation(s)
        );

        console.log(`✅ Found ${validNearbyStations.length} valid stations from nearby search`);

        // If we have very few results, try text search to find more
        if (validNearbyStations.length < 5) {
            console.log('🔍 Few stations found, trying text search for better coverage...');
            const textSearchStations = await this.textSearch(location, radiusMeters);

            // Deduplicate and validate
            const allStations = [...validNearbyStations];
            let addedCount = 0;

            textSearchStations.forEach(station => {
                const isDuplicate = allStations.some(s => s.id === station.id);
                if (!isDuplicate && this.isValidStation(station)) {
                    allStations.push(station);
                    addedCount++;
                }
            });

            console.log(`✅ Added ${addedCount} valid stations from text search`);
            return allStations;
        }

        return validNearbyStations;
    }

    /**
     * Search for EV charging stations by query text (for autocomplete)
     * @param query User's search text (e.g., "Koll" for Kollam)
     * @param location Optional user location for biasing results
     * @returns Up to 8 matching charging stations
     */
    async searchChargingStations(
        query: string,
        location?: LatLng
    ): Promise<ChargingStation[]> {
        if (!this.placesService || !query.trim()) {
            return [];
        }

        return new Promise((resolve) => {
            const request: google.maps.places.TextSearchRequest = {
                query: `${query} EV charging station`,
                ...(location && {
                    location: new google.maps.LatLng(location.lat, location.lng),
                    radius: 50000, // 50km radius bias
                }),
            };

            this.placesService!.textSearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    // Convert and validate results
                    const stations = results
                        .slice(0, 10) // Limit initial results
                        .map((place) => this.convertPlaceToStation(place))
                        .filter((station) => this.isValidStation(station))
                        .slice(0, 8); // Return max 8 valid results

                    console.log(`🔍 Search "${query}" found ${stations.length} EV stations`);
                    resolve(stations);
                } else {
                    console.log(`⚠️ Search "${query}" returned no results:`, status);
                    resolve([]);
                }
            });
        });
    }

    /**
     * Fetch real EV charging stations within map bounds
     * @param bounds Google Maps LatLngBounds
     */
    /**
     * Fetch real EV charging stations within map bounds
     * @param bounds Google Maps LatLngBounds
     */
    async fetchRealChargingStationsInBounds(
        bounds: google.maps.LatLngBounds
    ): Promise<ChargingStation[]> {
        // Robust Lazy Initialization
        if (!this.placesService) {
            console.warn('⚠️ PlacesService not initialized (in fetchInBounds). Attempting lazy init from Store...');
            const map = useMapStore.getState().mapInstance;
            if (map) {
                this.initialize(map);
            } else {
                console.error('❌ Lazy init failed: Map instance not found in store.');
                throw new Error('PlacesService not initialized and Map not ready.');
            }
        }

        return new Promise(async (resolve, reject) => {
            const request: google.maps.places.PlaceSearchRequest = {
                bounds: bounds,
                type: 'electric_vehicle_charging_station',
            };

            // Helper to fetch multiple pages
            const fetchAllPages = (): Promise<google.maps.places.PlaceResult[]> => {
                return new Promise((pageResolve) => {
                    let allResults: google.maps.places.PlaceResult[] = [];
                    let pageCount = 0; // Track pages to limit API calls

                    const searchCallback = (
                        results: google.maps.places.PlaceResult[] | null,
                        status: google.maps.places.PlacesServiceStatus,
                        pagination: google.maps.places.PlaceSearchPagination | null
                    ) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                            allResults = [...allResults, ...results];
                        }

                        pageCount++;

                        // Fetch next page if available, but limit to 1 extra page (total ~40 results)
                        // This significantly improves load time (saving ~2-4 seconds) while still getting more than 20 results.
                        if (pagination && pagination.hasNextPage && allResults.length < 40 && pageCount < 2) {
                            // Google requires a short delay
                            console.log('🔄 Fetching next page (optimized)...');
                            setTimeout(() => {
                                pagination.nextPage();
                            }, 1200); // Reduced delay slightly
                        } else {
                            pageResolve(allResults);
                        }
                    };

                    this.placesService!.nearbySearch(request, searchCallback);
                });
            };

            // Execute search with pagination
            const results = await fetchAllPages();

            let rawStations: ChargingStation[] = [];
            if (results && results?.length > 0) {
                rawStations = results.map((place) => this.convertPlaceToStation(place));
            }

            // 1. Filter Initial Results Immediately
            let validStations = rawStations.filter(s => this.isValidStation(s));
            console.log(`🔌 Nearby Search (Paged): Found ${rawStations.length} raw, ${validStations.length} valid.`);

            // 2. Fallback: Only use Text Search if we really didn't find much (< 10).
            // This prevents "Shops" from appearing unnecessarily when we already have good results.
            if (validStations.length < 10) {
                console.log('🔍 Low result count, attempting strict Text Search fallback...');
                try {
                    const textStationsRaw = await this.textSearchInBounds(bounds, 'EV Charging Station');
                    // Filter text results too
                    const validTextStations = textStationsRaw.filter(s => this.isValidStation(s));

                    // Merge and deduplicate
                    let added = 0;
                    validTextStations.forEach(ts => {
                        if (!validStations.some(s => s.id === ts.id)) {
                            validStations.push(ts);
                            added++;
                        }
                    });
                    console.log(`✅ Added ${added} stations from Text Search.`);
                } catch (e) {
                    console.warn('Text search fallback failed:', e);
                }
            }

            console.log(`✅ Final: Returning ${validStations.length} verified stations.`);
            resolve(validStations);
        });
    }

    /**
     * Helper for text search within bounds
     */
    private textSearchInBounds(bounds: google.maps.LatLngBounds, query: string): Promise<ChargingStation[]> {
        return new Promise((resolve) => {
            const request: google.maps.places.TextSearchRequest = {
                query: query,
                bounds: bounds
            };

            this.placesService!.textSearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    const stations = results.map((place) => this.convertPlaceToStation(place));
                    resolve(stations);
                } else {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Nearby search for charging stations
     */
    private nearbySearch(location: LatLng, radiusMeters: number): Promise<ChargingStation[]> {
        return new Promise((resolve, reject) => {
            const request: google.maps.places.PlaceSearchRequest = {
                location: new google.maps.LatLng(location.lat, location.lng),
                radius: radiusMeters,
                type: 'electric_vehicle_charging_station',
            };

            this.placesService!.nearbySearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    const stations = results.map((place) => this.convertPlaceToStation(place));
                    resolve(stations);
                } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                } else {
                    console.error('Places API nearby search error:', status);
                    resolve([]);
                }
            });
        });
    }

    /**
     * Text search for charging stations (fallback)
     */
    private textSearch(location: LatLng, radiusMeters: number): Promise<ChargingStation[]> {
        return new Promise((resolve, reject) => {
            const request = {
                location: new google.maps.LatLng(location.lat, location.lng),
                radius: radiusMeters,
                query: 'electric vehicle charging station', // More specific query
            };

            this.placesService!.textSearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    const stations = results.map((place) => this.convertPlaceToStation(place));
                    resolve(stations);
                } else {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Helper to validate if a station object seems legitimate
     */
    private isValidStation(station: ChargingStation): boolean {
        const name = station.name.toLowerCase();

        // 0. Trusted Operators: Always accept these, regardless of other words
        // 0. Trusted Operators: Always accept these. Use word boundaries to avoid "Granola" matching "ola".
        const knownOperators = [
            'tata', 'zeon', 'relux', 'kazam', 'statiq', 'glida', 'shell', 'bp', 'ionity', 'tesla', 'goec', 'kseb', 'ather', 'ola', 'chargemod', 'electricpe', 'anev'
        ];

        // Regex for operators: \b(op1|op2|...)\b
        const operatorRx = new RegExp(`\\b(${knownOperators.join('|')})\\b`, 'i');

        if (operatorRx.test(name)) {
            return true;
        }

        // 1. Strict Exclusion List: These usually indicate non-public or irrelevant places
        // "Substation" and "Junction" are major false positives, but we must be careful not to ban "Zeon Charger @ Junction"
        const strictInvalidTerms = [
            'panchayath', 'office', 'government',
            'music', 'institute', 'academy', 'tuition', 'university',
            'pharmacy', 'hospital', 'clinic', 'medicity',
            'church', 'temple', 'mosque',
            'landmark', 'tourist', 'attraction', 'museum', 'park', 'statue',
            'wedding', 'event', 'hall', 'auditorium', 'convention', 'stadium',
            'restaurant', 'hotel', 'cafe', 'resort', 'lodge', 'bakery', 'mart', 'store', 'shop', 'complex', 'plaza', 'mall',
            'post office', 'courier'
        ];

        // Terms that override the exclusion (if the name is "More Supermarket EV Charger", it's valid)
        const safetyTerms = ['charger', 'charging', 'station', 'point', 'hub', 'ev '];

        for (const term of strictInvalidTerms) {
            if (name.includes(term)) {
                // Check if it has a safety term to redeem it
                const isRedeemed = safetyTerms.some(safe => name.includes(safe));
                if (isRedeemed) {
                    continue; // It contains a bad word but also a GOOD word, so it's likely a charger AT a location
                }
                // console.log(`⚠️ Filtering out: "${station.name}" (matched "${term}")`);
                return false;
            }
        }

        // 2. Mandatory Inclusion Logic: Must sound like a charging related place
        // We use Regex to avoid partial matches (e.g. "Events" matching "ev", "View Point" matching "point")

        // A. Strong Indicators: Single match is enough
        const strongRx = /\b(charging station|ev charger|electric vehicle|supercharger|fast charger|wallbox|charge point|charging point|battery swap)\b/i;
        if (strongRx.test(name)) return true;

        // B. Contextual Indicators: Needs "EV" + generic noun, or "Electric" + generic noun
        // Matches: "EV Point", "Electric Hub", "EV Zone", "Tata Power Helper"
        // Prevents: "Events", "Development", "Beverage"
        const contextRx = /\b(ev|electric)\b/i;
        const nounRx = /\b(station|point|hub|zone|spot|garage|bunk|power|infra|energy|connection)\b/i;

        if (contextRx.test(name) && nounRx.test(name)) {
            return true;
        }

        // C. Explicit Connector Types (e.g. "MG CCS2 Point")
        if (/\b(ccs|chademo|type 2|gbt)\b/i.test(name)) return true;

        console.log(`⚠️ Filtering out ambiguous result (No strong EV keywords): "${station.name}"`);
        return false;
    }

    /**
     * Get detailed information about a specific charging station
     */
    async getStationDetails(placeId: string): Promise<any> {
        if (!this.placesService) {
            throw new Error('PlacesService not initialized');
        }

        return new Promise((resolve, reject) => {
            const request = {
                placeId,
                fields: [
                    'name',
                    'formatted_address',
                    'geometry',
                    'rating',
                    'user_ratings_total',
                    'opening_hours',
                    'formatted_phone_number',
                    'website',
                    'photos',
                    'reviews',
                    'price_level',
                    // EV-specific fields (if available)
                    'ev_charge_options',
                ],
            };

            this.placesService!.getDetails(request, (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    resolve(place);
                } else {
                    reject(new Error(`Failed to get place details: ${status}`));
                }
            });
        });
    }

    /**
     * Convert Google Place to ChargingStation format
     */
    private convertPlaceToStation(place: google.maps.places.PlaceResult): ChargingStation {
        const location: LatLng = {
            lat: place.geometry?.location?.lat() || 0,
            lng: place.geometry?.location?.lng() || 0,
        };

        // Generate mock connectors (Google doesn't always provide this data)
        // In production, you'd fetch this from place details or a secondary API
        const connectors: Connector[] = this.generateConnectorsFromPlace(place);

        // Places opening/business status does not establish live connector availability.
        const status: ChargingStation['status'] = 'unknown';
        const speed: ChargingStation['speed'] = 'unknown';

        return {
            id: place.place_id || `place-${Date.now()}`,
            name: place.name || 'Unknown Charging Station',
            location,
            address: place.vicinity || place.formatted_address || 'Address not available',
            status,
            connectors,
            amenities: {
                wifi: false, // Would need to parse from place details
                restaurant: false,
                restroom: false,
                parking: false, // Not provided by this source
                shelter: false,
            },
            rating: place.rating || 0,
            reviews: place.user_ratings_total || 0,
            speed,
            operator: 'Operator not verified',
            operatingHours: this.formatOperatingHours(place.opening_hours),
            source: 'google',
            discoveryOnly: true,
        };
    }

    /**
     * Generate connectors based on available place data
     */
    private generateConnectorsFromPlace(_place: google.maps.places.PlaceResult): Connector[] {
        // Legacy Places responses contain no verified EV connector specifications.
        return [];
    }

    /**
     * Format operating hours
     */
    private formatOperatingHours(openingHours?: google.maps.places.PlaceOpeningHours): string {
        if (!openingHours || !openingHours.weekday_text) {
            return 'Hours unknown';
        }

        // Check if it's 24/7
        const is24_7 = openingHours.weekday_text.every((day) =>
            day.toLowerCase().includes('open 24 hours')
        );

        if (is24_7) {
            return '24/7';
        }

        // Return first day's hours as sample
        return openingHours.weekday_text[0] || 'Hours vary';
    }

}

export const placesEVService = new PlacesEVChargingService();
