import ManagementPage from '../components/ManagementPage';
import DriverCard from '../components/DriverCard';
import DriverAssignment from '../components/DriverAssignment';
import {driverApi} from '../services/driverApi';
const initial={name:'',license_number:'',status:'ACTIVE'};
const fields=[{name:'name',label:'Name'},{name:'license_number',label:'License number'},{name:'status',label:'Status',options:['ACTIVE','INACTIVE']}];
export default function Drivers(){return <><ManagementPage title="Drivers" api={driverApi} Card={DriverCard} fields={fields} initial={initial}/><DriverAssignment/></>;}
