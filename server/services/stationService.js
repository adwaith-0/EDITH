// Explicitly labelled synthetic public discovery fixtures. These are never bookable listings.
const fixtures = [
    { id: 'demo-public-kochi-centre', name: 'Demo public discovery — Kochi centre', lat: 9.9816, lng: 76.2999, address: 'Synthetic fixture near Kochi centre, Kerala' },
    { id: 'demo-public-kakkanad', name: 'Demo public discovery — Kakkanad', lat: 10.0159, lng: 76.3419, address: 'Synthetic fixture near Kakkanad, Kochi' },
    { id: 'demo-public-aluva', name: 'Demo public discovery — Aluva', lat: 10.1076, lng: 76.3516, address: 'Synthetic fixture near Aluva, Kerala' },
].map(({ lat, lng, ...station }) => ({
    ...station, location: { lat, lng }, status: 'unknown', connectors: [],
    amenities: { restroom: false, restaurant: false, wifi: false, parking: false, shelter: false },
    rating: 0, reviews: 0, operatingHours: 'Hours unknown', operator: 'Synthetic demo fixture',
    speed: 'unknown', source: 'simulated', discoveryOnly: true, synthetic: true,
}));

module.exports = {
    getAllStations: () => fixtures,
    getStationById: id => fixtures.find(station => station.id === id),
    searchStations: query => fixtures.filter(station => `${station.name} ${station.address}`.toLowerCase().includes(query.toLowerCase())),
    // Live status cannot be fabricated by mutating a discovery fixture.
    updateStationStatus: () => null,
};
