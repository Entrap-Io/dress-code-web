import ical from 'node-ical';
import axios from 'axios';
import moment from 'moment-timezone';
import pkg from 'rrule';
const { RRule } = pkg;

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch and parse iCal data with recurrence expansion and caching.
 */
export async function getEventsForDate(icalUrl, targetDateStr) {
  const now = Date.now();
  
  // 1. Check Cache
  if (cache.has(icalUrl)) {
    const { data, timestamp } = cache.get(icalUrl);
    if (now - timestamp < CACHE_TTL) {
      console.log('📦 Calendar Cache Hit:', icalUrl);
      return filterEventsForDate(data, targetDateStr);
    }
  }

  // 2. Fetch and Parse
  console.log('🌐 Fetching Calendar:', icalUrl);
  try {
    const response = await axios.get(icalUrl, { timeout: 10000 });
    const data = ical.parseICS(response.data);
    
    // Cache the raw parsed data
    cache.set(icalUrl, { data, timestamp: now });
    
    return filterEventsForDate(data, targetDateStr);
  } catch (err) {
    console.error('❌ Calendar Fetch Error:', err.message);
    throw new Error(`Failed to fetch calendar: ${err.message}`);
  }
}

/**
 * Filters and expands events for a specific date (YYYY-MM-DD).
 */
export function filterEventsForDate(data, targetDateStr) {
  const targetDate = moment(targetDateStr).startOf('day');
  const startOfTarget = targetDate.toDate();
  const endOfTarget = moment(targetDate).endOf('day').toDate();
  
  const events = [];

  for (const k in data) {
    const ev = data[k];
    if (ev.type !== 'VEVENT') continue;

    // A. Handle Single Events
    if (!ev.rrule) {
      const startDate = new Date(ev.start);
      const endDate = new Date(ev.end);

      if (isEventOnTargetDate(startDate, endDate, startOfTarget, endOfTarget)) {
        // Check EXDATE even for single events (uncommon but possible in some exporters)
        if (isExcluded(ev, startDate)) continue;

        events.push({
          summary: ev.summary,
          start: ev.start,
          end: ev.end,
          location: ev.location,
          isRecurring: false
        });
      }
    } 
    // B. Handle Recurring Events
    else {
      try {
        const rule = ev.rrule;
        const duration = ev.end - ev.start;
        
        // Find occurrences on the target day
        const occurrences = rule.between(startOfTarget, endOfTarget, true);
        
        occurrences.forEach(occ => {
          if (isExcluded(ev, occ)) return;

          events.push({
            summary: ev.summary,
            start: occ,
            end: new Date(occ.getTime() + duration),
            location: ev.location,
            isRecurring: true
          });
        });
      } catch (e) {
        console.warn('⚠️ Error expanding recurrence for:', ev.summary, e.message);
      }
    }
  }

  // Sort by start time
  return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Checks if a specific date instance is excluded from an event.
 */
function isExcluded(ev, date) {
  if (!ev.exdate) return false;
  
  // node-ical stores exdate as an object keyed by date string (e.g. 2026-03-19)
  // or sometimes as an array of dates depending on the version/parser.
  const dateStr = moment(date).format('YYYY-MM-DD');
  
  if (Array.isArray(ev.exdate)) {
    return ev.exdate.some(d => moment(d).format('YYYY-MM-DD') === dateStr);
  }
  
  // Object key check
  return !!ev.exdate[dateStr] || Object.values(ev.exdate).some(d => moment(d).format('YYYY-MM-DD') === dateStr);
}

function isEventOnTargetDate(start, end, dayStart, dayEnd) {
  return (start >= dayStart && start <= dayEnd) || 
         (end >= dayStart && end <= dayEnd) ||
         (start < dayStart && end > dayEnd);
}
