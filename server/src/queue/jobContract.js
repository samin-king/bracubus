import { randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
export function validateJobId(id) {
 if(typeof id!=='string'||! /^[A-Za-z][A-Za-z0-9_-]{7,127}$/.test(id))throw new HttpError(400,'jobId must be 8-128 characters, start with a letter, and contain only letters, digits, _ or -');
 return id;
}
export function jobContract(input) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['jobId','type','payload'].includes(k)))throw new HttpError(400,'Invalid job contract');
 if(input.type!=='BOOKING_REQUEST')throw new HttpError(400,'Unsupported job type');
 const p=input.payload;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['studentId','tripId','seatId'].includes(k))||!['studentId','tripId'].every(k=>Number.isSafeInteger(p[k])&&p[k]>0)||(p.seatId!==undefined&&(!Number.isSafeInteger(p.seatId)||p.seatId<1)))throw new HttpError(400,'Invalid booking job payload');
 return {jobId:validateJobId(input.jobId??('JOB-'+randomUUID())),type:input.type,payload:{studentId:p.studentId,tripId:p.tripId,...(p.seatId===undefined?{}:{seatId:p.seatId})},createdAt:new Date().toISOString()};
}
