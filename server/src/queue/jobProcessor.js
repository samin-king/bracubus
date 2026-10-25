import { UnrecoverableError } from 'bullmq';
import { jobContract } from './jobContract.js';
import { bookingAdapter } from './bookingAdapter.js';
import { PermanentJobError,RetryableJobError } from './jobErrors.js';
export function createJobProcessor({bookingService}={}) {
 const processBooking=bookingAdapter(bookingService);
 return async job=>{
  try {
   const data=jobContract({jobId:job.id,type:job.name,payload:job.data.payload});
   await processBooking(data);
  } catch(error) {
   // Never persist raw service errors, SQL, credentials, or payloads in Redis errors.
   if(error instanceof RetryableJobError)throw new Error('Temporary service failure');
   throw new UnrecoverableError(error instanceof PermanentJobError?'Booking integration is not configured':'Permanent job failure');
  }
 };
}
