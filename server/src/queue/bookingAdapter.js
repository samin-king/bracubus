import { PermanentJobError } from './jobErrors.js';
// Member 2: inject a service implementing processBooking(payload, { jobId }).
// The service MUST atomically persist the jobId and business effects in PostgreSQL.
export function bookingAdapter(bookingService) {
 return async job=>{
  if(typeof bookingService?.processBooking!=='function')throw new PermanentJobError('Booking integration is not configured');
  await bookingService.processBooking(job.payload,{jobId:job.jobId});
  // Business data stays in PostgreSQL, never in BullMQ return values.
 };
}
