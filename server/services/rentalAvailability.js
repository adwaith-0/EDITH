const { contains, interval } = require('./rentalShared');

// Find a full free interval, merging adjacent host windows and skipping every
// confirmed/in-progress reservation. Pending requests do not hold capacity.
function inspectAvailability(windows, reservations, slotStart, durationMinutes, now = new Date()) {
  const selection = interval(slotStart, durationMinutes, false);
  const merged = [];
  for (const window of [...windows].sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt))) {
    const start = new Date(window.startsAt).getTime(), end = new Date(window.endsAt).getTime();
    const previous = merged[merged.length-1];
    if (previous && start <= previous.end) previous.end = Math.max(previous.end,end);
    else merged.push({start,end});
  }
  const occupied = reservations.map(r=>({start:new Date(r.slotStart).getTime(),end:new Date(r.slotEnd).getTime()})).sort((a,b)=>a.start-b.start);
  const isPast = selection.start <= now;
  const inWindow = contains(windows,selection.start,selection.end);
  const conflict = occupied.some(r=>r.start<selection.end.getTime()&&r.end>selection.start.getTime());
  const available = !isPast && inWindow && !conflict;
  const code = available ? 'AVAILABLE' : isPast ? 'START_IN_PAST' : !inWindow ? 'OUTSIDE_AVAILABILITY' : 'BOOKING_CONFLICT';
  let nextAvailable = null;
  if (!available) {
    const earliest = Math.max(selection.start.getTime(), Math.floor(now.getTime()/60000)*60000+60000);
    const duration = selection.duration*60000;
    for (const window of merged) {
      let start = Math.ceil(Math.max(earliest,window.start)/60000)*60000;
      for (const reserved of occupied) {
        if (reserved.end<=start) continue;
        if (reserved.start>=start+duration) break;
        start=Math.ceil(reserved.end/60000)*60000;
      }
      if (start+duration<=window.end) { nextAvailable={slotStart:new Date(start).toISOString(),slotEnd:new Date(start+duration).toISOString(),durationMinutes:selection.duration}; break; }
    }
  }
  const message = available ? 'This full interval is open for a request. Availability is checked again when booking.' : isPast ? 'Choose a future rental start.' : !inWindow ? 'The full rental duration does not fit the host’s open hours.' : 'This time overlaps a confirmed or active reservation. Choose another time.';
  return {available,code,message,slotStart:selection.start.toISOString(),slotEnd:selection.end.toISOString(),nextAvailable,checkedAt:now.toISOString()};
}

async function availability(stationId, slotStart, durationMinutes) {
  const prisma = require('../lib/prisma');
  const rental = await require('./rentalService').get(stationId);
  const selection = interval(slotStart,durationMinutes,false);
  const bookings = await prisma.booking.findMany({where:{connectorId:rental.connectors[0]?.id || '',status:{in:['CONFIRMED','IN_PROGRESS']},slotEnd:{gt:new Date(Math.max(Date.now(),selection.start.getTime()))}},select:{slotStart:true,slotEnd:true}});
  return inspectAvailability(rental.availabilityWindows,bookings,slotStart,durationMinutes);
}
module.exports={inspectAvailability,availability};
