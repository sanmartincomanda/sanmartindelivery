import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, database } from '../firebase';

const resolver = httpsCallable(getFunctions(auth.app, 'us-central1'), 'resolveWhaticketClient');

export const subscribeWhaticketPendingOrders = (branchScope, onOrders, onError) => {
  const pendingRef = ref(database, 'whaticketPendingOrders');
  const source = branchScope
    ? query(pendingRef, orderByChild('storeBranchId'), equalTo(branchScope))
    : pendingRef;
  return onValue(source, (snapshot) => {
    const orders = [];
    snapshot.forEach((child) => orders.push({ ...child.val(), id: child.key }));
    orders.sort((left, right) => Number(left.createdAt) - Number(right.createdAt));
    onOrders(orders);
  }, onError);
};

export const resolveWhaticketPendingOrder = async (data) => (await resolver(data)).data;
