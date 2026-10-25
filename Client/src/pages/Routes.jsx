import ManagementPage from '../components/ManagementPage';
import RouteCard from '../components/RouteCard';
import {routeApi} from '../services/routeApi';
const initial={route_name:'',origin:'',destination:'',stops:''};
const fields=[{name:'route_name',label:'Route name'},{name:'origin',label:'Origin'},{name:'destination',label:'Destination'},{name:'stops',label:'Stops (comma separated)',optional:true}];
export default function Routes(){return <ManagementPage title="Routes" api={routeApi} Card={RouteCard} fields={fields} initial={initial} toForm={x=>({...x,stops:x.stops.join(', ')})} toBody={x=>({...x,stops:x.stops.split(',').map(s=>s.trim()).filter(Boolean)})}/>;}
