import {useEffect,useState} from 'react';
import ManagementPage from '../components/ManagementPage';
import TripCard from '../components/TripCard';
import {tripApi} from '../services/tripApi';
import {busApi} from '../services/busApi';
import {routeApi} from '../services/routeApi';
const initial={bus_id:'',route_id:'',travel_date:'',departure_time:'',status:'SCHEDULED'};
export default function Trips(){
 const [buses,setBuses]=useState([]),[routes,setRoutes]=useState([]),[error,setError]=useState('');
 async function load(){try{const [b,r]=await Promise.all([busApi.list(),routeApi.list()]);setBuses(b);setRoutes(r);setError('');}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[]);
 const fields=[{name:'bus_id',label:'Bus',options:buses.map(b=>({value:b.id,label:b.bus_number}))},{name:'route_id',label:'Route',options:routes.map(r=>({value:r.id,label:r.route_name}))},{name:'travel_date',label:'Travel date (Dhaka)',type:'date'},{name:'departure_time',label:'Departure time (Dhaka)',type:'time'},{name:'status',label:'Status',options:['SCHEDULED','ACTIVE','STOPPED','COMPLETED','CANCELLED']}];
 return <>{error&&<button onClick={load}>Reload buses and routes</button>}<ManagementPage title="Trips" api={tripApi} Card={TripCard} fields={fields} initial={initial} dependenciesError={error} toBody={x=>({...x,bus_id:Number(x.bus_id),route_id:Number(x.route_id)})}/></>;
}
