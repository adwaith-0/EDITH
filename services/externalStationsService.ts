import axios from 'axios';
import { ChargingStation, ConnectorType } from '@/types/station';
import { LatLng } from '@/types/map';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
interface ExternalStation {
    id: string; source: string; name: string; location: LatLng; address: string;
    connectors?: { type: string; powerKW?: number }[];
    raw?: { rating?: number; user_ratings_total?: number };
    operator?: string; openingHours?: string; unavailable?: boolean; sourceUrl?: string;
}
interface ExternalStationResponse { stations: ExternalStation[]; meta?: Record<string, unknown> }

export function normalizePublicConnector(type: string): ConnectorType {
    const value = type.toLowerCase().replace(/[\s_-]/g, '');
    if (value.includes('chademo')) return 'CHAdeMO';
    if (value.includes('ccs') || value.includes('combo')) return 'CCS';
    if (value.includes('type2') || value.includes('mennekes')) return 'Type2';
    if (value.includes('tesla') || value.includes('nacs')) return 'Tesla';
    return 'Unknown';
}

class ExternalStationsService {
    private cache = new Map<string, { timestamp: number; data: ChargingStation[] }>();
    private pending = new Map<string, Promise<ChargingStation[]>>();

    async fetchNearby(location: LatLng, radius = 15000): Promise<ChargingStation[]> {
        return (await this.fetchDirectory(location,radius)).stations;
    }
    async fetchDirectory(location:LatLng,radius=50000,preferCache=false):Promise<{stations:ChargingStation[];meta?:{cached?:boolean;snapshotAt?:string;warning?:string}}> {
        const response = await axios.get<ExternalStationResponse>(`${API_URL}/api/external-stations`, {
            params: { lat: location.lat, lng: location.lng, radius, ...(preferCache?{preferCache:'true'}:{}) }, timeout: 120000,
        });
        return {stations:response.data.stations.map(station => this.convertToInternalFormat(station)),meta:response.data.meta};
    }

    async fetchDemoFixtures(): Promise<ChargingStation[]> {
        const response = await axios.get<{ stations: ChargingStation[] }>(`${API_URL}/api/stations`, { timeout: 10000 });
        return response.data.stations.map(station => ({ ...station, discoveryOnly: true, synthetic: true, status: 'unknown' }));
    }

    async fetchStationsInBounds(bounds: google.maps.LatLngBounds, userLocation?: LatLng): Promise<ChargingStation[]> {
        const ne = bounds.getNorthEast(); const sw = bounds.getSouthWest(); const center = bounds.getCenter();
        const key = [ne.lat(), ne.lng(), sw.lat(), sw.lng()].map(value => value.toFixed(3)).join('_');
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < 300000) return cached.data;
        const existing = this.pending.get(key);
        if (existing) return existing;
        const request = axios.get<ExternalStationResponse>(`${API_URL}/api/external-stations`, {
            params: { lat: userLocation?.lat ?? center.lat(), lng: userLocation?.lng ?? center.lng(),
                north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng(), radius: 15000 }, timeout: 45000,
        }).then(response => {
            const stations = response.data.stations.map(station => this.convertToInternalFormat(station));
            this.cache.set(key, { timestamp: Date.now(), data: stations });
            if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!);
            return stations;
        }).finally(() => this.pending.delete(key));
        this.pending.set(key, request);
        return request;
    }

    convertToInternalFormat(ext: ExternalStation): ChargingStation {
        const connectors = (ext.connectors || []).map((connector, index) => ({
            id: `${ext.id}-connector-${index}`, type: normalizePublicConnector(connector.type), sourceType: connector.type,
            power: Number.isFinite(connector.powerKW) && connector.powerKW! > 0 ? connector.powerKW! : null,
            available: null, price: null,
        }));
        return {
            id: ext.id, name: ext.name, location: ext.location, address: ext.address || 'Address unavailable',
            status: 'unknown', connectors, amenities: { wifi: false, restaurant: false, restroom: false, parking: false, shelter: false },
            rating: ext.raw?.rating ?? 0, reviews: ext.raw?.user_ratings_total ?? 0, speed: 'unknown',
            operator: ext.operator || 'Operator not verified', operatingHours: ext.openingHours || 'Hours unknown',
            unavailable: ext.unavailable, sourceUrl: ext.sourceUrl,
            source: ['google', 'openchargemap', 'osm'].includes(ext.source) ? ext.source as ChargingStation['source'] : undefined,
            discoveryOnly: true,
        };
    }
}
export const externalStationsService = new ExternalStationsService();
