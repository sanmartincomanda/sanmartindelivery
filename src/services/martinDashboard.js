import { getFunctions,httpsCallable } from 'firebase/functions';
import { auth } from '../firebase';

const readDashboard=httpsCallable(getFunctions(auth.app,'us-central1'),'getMartinDashboard',{timeout:30000});
export const fetchMartinDashboard=async day=>(await readDashboard({day})).data;
