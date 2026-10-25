import ManagementPage from '../components/ManagementPage';
import BusCard from '../components/BusCard';
import {busApi} from '../services/busApi';
const initial={bus_number:'',registration_number:'',capacity:37,standing_capacity:0,status:'ACTIVE'};
const fields=[{name:'bus_number',label:'Bus number'},{name:'registration_number',label:'Registration number',optional:true},{name:'capacity',label:'Capacity',type:'number'},{name:'standing_capacity',label:'Standing capacity',type:'number',min:0},{name:'status',label:'Status',options:['ACTIVE','INACTIVE','MAINTENANCE']}];
export default function Buses(){return <ManagementPage title="Buses" api={busApi} Card={BusCard} fields={fields} initial={initial} toBody={x=>({...x,capacity:Number(x.capacity),standing_capacity:Number(x.standing_capacity??0),registration_number:x.registration_number||null})}/>;}
