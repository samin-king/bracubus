import { request,apiFor } from './api';
export const driverApi={
 ...apiFor('drivers'),
 me:()=>request('drivers/me'),
 trips:()=>request('drivers/me/trips'),
 assign:(tripId,driverId)=>request('trips/'+tripId+'/driver',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({driver_id:driverId})}),
 start:tripId=>request('trips/'+tripId+'/start',{method:'POST'}),
 stop:tripId=>request('trips/'+tripId+'/stop',{method:'POST'})
};
