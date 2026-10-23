// Development-only, deterministic, non-destructive synthetic fixtures.
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const prisma = require('../server/lib/prisma');
const bcrypt = require('bcrypt');

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  const demoHash = await bcrypt.hash('EdithDemo123!', 10);
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const account = (email, name, passwordHash, role = 'USER') => prisma.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash, role } });
  const driver = await account('driver@edith.demo', 'Arjun · Demo Driver', demoHash);
  const host = await account('host@edith.demo', 'Meera · Demo Host', demoHash);
  await account('admin@evcharge.com', 'EDITH Demo Administrator', adminHash, 'ADMIN');
  await prisma.vehicle.upsert({ where: { id: 'demo-driver-nexon' }, update: {}, create: { id: 'demo-driver-nexon', ownerId: driver.id, model: 'Tata Nexon EV · synthetic demo vehicle', vehicleType: 'CAR', connectorTypes: ['Type 2', 'CCS2'], batteryCapacityKwh: 40.5, rangeKm: 280, metadata: { synthetic: true, specifications: 'Demo inputs, not a verified production vehicle catalogue.' } } });
  const demoCars=require('../server/services/demoVehicleCatalogue');
  for(const preset of demoCars.catalogue)await demoCars.vehicleFor(driver.id,preset);
  await prisma.vehicle.upsert({ where: { id: 'demo-host-car' }, update: {}, create: { id: 'demo-host-car', ownerId: host.id, model: 'Host demo EV', vehicleType: 'CAR', connectorTypes: ['Type 2'] } });
  const istToday = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const base = new Date(`${istToday}T00:00:00+05:30`);
  const fixtures = [
    { id: 'demo-fort-kochi-home', name: 'The Courtyard · Fort Kochi', address: 'Synthetic demo location · Fort Kochi, Kochi, Kerala', lat: 9.9656, lng: 76.2429, connectorType: 'Type 2', powerKw: 7.4, currentType: 'AC', hourlyRatePaise: 12000, published: true, mode: 'open', parking: 'One covered car bay. Enter from the courtyard gate.', accessInstructions: 'Meet your host on arrival. Bring your own compatible charging cable.', restrictedAccessInstructions: 'DEMO ONLY: courtyard gate code 2468. Call the host using the doorbell; no real property access is provided.' },
    { id: 'demo-kakkanad-office', name: 'Green Desk · Kakkanad', address: 'Synthetic demo location · Kakkanad, Kochi, Kerala', lat: 10.0159, lng: 76.3419, connectorType: 'CHAdeMO', powerKw: 25, currentType: 'DC', hourlyRatePaise: 18000, published: true, mode: 'open', parking: 'Office visitor parking, one vehicle.', accessInstructions: 'CHAdeMO only. Incompatible with the saved demo Nexon vehicle.' },
    { id: 'demo-panampilly-cafe', name: 'Early Bird · Panampilly', address: 'Synthetic demo location · Panampilly Nagar, Kochi, Kerala', lat: 9.9514, lng: 76.3002, connectorType: 'Type 2', powerKw: 11, currentType: 'AC', hourlyRatePaise: 10000, published: true, mode: 'closed', parking: 'Café forecourt, one vehicle.', accessInstructions: 'Open for requests only 00:00–04:00 Asia/Kolkata. Most daytime searches show closed.' },
    { id: 'demo-edappally-homestay', name: 'Mango House · Edappally', address: 'Synthetic demo location · Edappally, Kochi, Kerala', lat: 10.0261, lng: 76.3125, connectorType: 'Type 2', powerKw: 7.4, currentType: 'AC', hourlyRatePaise: 9000, published: false, mode: 'open', parking: 'Homestay guest parking.', accessInstructions: 'Paused synthetic listing; no new requests accepted.' },
  ];
  for (const fixture of fixtures) {
    const { connectorType, powerKw, currentType, mode, ...stationData } = fixture;
    const station = await prisma.station.upsert({ where: { id: fixture.id }, update: {}, create: { ...stationData, ownerId: host.id, kind: 'PRIVATE_RENTAL', source: 'SYNTHETIC_DEMO', terms: 'Synthetic hackathon listing. Hourly access only. Reserved duration is billed. No actual payment or energy measurement.', connectors: { create: { id: `${fixture.id}-connector`, connectorType, powerKw, currentType, slotCount: 1 } } } });
    // Append missing dated demo windows only; preserve user changes and existing reservations.
    // Do not republish paused fixtures or reset rates on repeated seed runs.
    for (let day = 0; day < 30; day++) {
      const startsAt = new Date(base.getTime() + day * 86400000);
      const endsAt = new Date(startsAt.getTime() + (mode === 'closed' ? 4 : 24) * 3600000);
      const id = `${fixture.id}-window-${startsAt.toISOString().slice(0, 10)}`;
      // Full-day adjacent windows are merged for the compatible fixture below by service.
      await prisma.availabilityWindow.upsert({ where: { id }, update: {}, create: { id, stationId: station.id, startsAt, endsAt } });
    }
  }
  const publicFixtures = [
    { id: 'demo-public-marine-drive', name: 'Marine Drive public discovery · synthetic', address: 'Synthetic public discovery fixture · Marine Drive, Kochi', lat: 9.9825, lng: 76.2746 },
    { id: 'demo-public-vyttila', name: 'Vyttila public discovery · synthetic', address: 'Synthetic public discovery fixture · Vyttila, Kochi', lat: 9.9682, lng: 76.3203 },
  ];
  for (const data of publicFixtures) await prisma.station.upsert({ where: { id: data.id }, update: {}, create: { ...data, kind: 'PUBLIC', source: 'SYNTHETIC_DEMO', published: false } });
  console.log('Synthetic Kochi fixtures seeded without deleting or resetting existing records.');
  console.log('Driver: driver@edith.demo | Host: host@edith.demo | Password: EdithDemo123!');
  console.log('Administrator: admin@evcharge.com | Password: Admin@123 (development only)');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
