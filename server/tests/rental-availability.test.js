const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectAvailability}=require('../services/rentalAvailability');
const at=hour=>new Date(Date.UTC(2026,10,1,0,Math.round(hour*60))).toISOString();
const window=(start,end)=>({startsAt:at(start),endsAt:at(end)});
const reserved=(start,end)=>({slotStart:at(start),slotEnd:at(end)});
const now=new Date(at(7));
test('the reported 10am four-hour conflict suggests 11:30am through 3:30pm',()=>{
  const result=inspectAvailability([window(8,22)],[reserved(10,11.5)],at(10),240,now);
  assert.equal(result.nextAvailable.slotStart,at(11.5));assert.equal(result.nextAvailable.slotEnd,at(15.5));
});
test('conflicting four-hour request offers the full duration after all overlapping reservations',()=>{
  const result=inspectAvailability([window(8,22)],[reserved(10,11.5),reserved(11,13)],at(10),240,now);
  assert.equal(result.available,false);assert.equal(result.code,'BOOKING_CONFLICT');
  assert.equal(result.nextAvailable.slotStart,at(13));assert.equal(result.nextAvailable.slotEnd,at(17));
});
test('a booking ending exactly at the requested start does not block a quote',()=>{
  const result=inspectAvailability([window(8,22)],[reserved(10,12)],at(12),240,now);
  assert.equal(result.available,true);assert.equal(result.nextAvailable,null);
});
test('short gaps are skipped and adjacent host windows merge for the complete duration',()=>{
  const result=inspectAvailability([window(8,12),window(12,18)],[reserved(9,10),reserved(11,13)],at(9),240,now);
  assert.equal(result.nextAvailable.slotStart,at(13));assert.equal(result.nextAvailable.slotEnd,at(17));
});
test('closed hours and a past start produce a valid future alternative without changing duration',()=>{
  const closed=inspectAvailability([window(8,12),window(14,20)],[],at(11),240,now);
  assert.equal(closed.code,'OUTSIDE_AVAILABILITY');assert.equal(closed.nextAvailable.slotStart,at(14));
  const past=inspectAvailability([window(8,12)],[],at(6),60,now);
  assert.equal(past.code,'START_IN_PAST');assert.equal(past.nextAvailable.slotStart,at(8));
});
test('no alternative is offered when no window fits the full session',()=>{
  const result=inspectAvailability([window(8,12)],[reserved(9,12)],at(9),240,now);
  assert.equal(result.nextAvailable,null);
});
