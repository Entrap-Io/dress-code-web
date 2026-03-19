import { filterEventsForDate } from '../src/services/calendarService.js';
import ical from 'node-ical';
import moment from 'moment-timezone';

const mockICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//hacksw/handcal//NONSGML v1.0//EN
BEGIN:VEVENT
UID:1@test.com
DTSTAMP:20230101T000000Z
DTSTART:20260319T090000Z
DTEND:20260319T100000Z
SUMMARY:One-off Meeting
END:VEVENT
BEGIN:VEVENT
UID:2@test.com
DTSTAMP:20230101T000000Z
DTSTART:20260312T140000Z
DTEND:20260312T150000Z
RRULE:FREQ=WEEKLY;BYDAY=TH
SUMMARY:Weekly Sync
END:VEVENT
BEGIN:VEVENT
UID:3@test.com
DTSTAMP:20230101T000000Z
DTSTART:20260319T180000Z
DTEND:20260319T190000Z
SUMMARY:Excluded Event
EXDATE:20260319T180000Z
END:VEVENT
END:VCALENDAR`;

async function testRecurrence() {
  console.log('🧪 Testing iCal Recurrence Expansion...');

  try {
    const parsedData = ical.parseICS(mockICS);
    const targetDate = '2026-03-19'; // This is a Thursday
    
    const events = filterEventsForDate(parsedData, targetDate);
    
    console.log(`\n📅 Events for ${targetDate}:`);
    events.forEach(ev => {
      console.log(`- [${moment(ev.start).format('HH:mm')}] ${ev.summary} ${ev.isRecurring ? '(Recurring)' : ''}`);
    });

    const summaries = events.map(e => e.summary);
    
    // Assertions
    const hasOneOff = summaries.includes('One-off Meeting');
    const hasWeekly = summaries.includes('Weekly Sync');
    const hasExcluded = summaries.includes('Excluded Event');

    if (hasOneOff && hasWeekly && !hasExcluded) {
      console.log('\n✅ ALL TESTS PASSED!');
      console.log('  - One-off event found');
      console.log('  - Weekly recurring event expanded to target date');
      console.log('  - Excluded event correctly skipped');
    } else {
      console.error('\n❌ TEST FAILED!');
      if (!hasOneOff) console.error('  - MISSING: One-off Meeting');
      if (!hasWeekly) console.error('  - MISSING: Weekly Sync (Recurrence Failed)');
      if (hasExcluded) console.error('  - ERROR: Excluded Event should NOT be present');
    }

  } catch (err) {
    console.error('❌ Test error:', err.message);
  }
}

testRecurrence();
