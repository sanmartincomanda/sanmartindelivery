import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase';
import { createKitchenStaffService, getKitchenStaffMembers, kitchenStaffError } from '../services/kitchenStaff';

export const kitchenStaffService = createKitchenStaffService(database);

export default function useKitchenStaff({ enabled = true, initialize = false, actor = 'admin' } = {}) {
  const [directory, setDirectory] = useState(undefined);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    setDirectory(undefined); setError('');
    const stopConnection = onValue(ref(database, '.info/connected'), (snapshot) => setConnected(snapshot.val() === true));
    const stop = kitchenStaffService.subscribe((value) => {
      if (!mounted) return;
      try { getKitchenStaffMembers(value); setDirectory(value); setError(''); }
      catch (failure) { setError(kitchenStaffError(failure)); }
    }, (failure) => { if (mounted) setError(kitchenStaffError(failure)); });
    return () => { mounted = false; stop(); stopConnection(); };
  }, [enabled, attempt]);

  useEffect(() => {
    if (!enabled || !initialize || directory !== null || !connected) return undefined;
    let mounted = true;
    kitchenStaffService.initialize(actor).catch((failure) => { if (mounted) setError(kitchenStaffError(failure)); });
    return () => { mounted = false; };
  }, [enabled, initialize, directory, connected, actor, attempt]);

  return {
    members: directory === undefined || error ? [] : getKitchenStaffMembers(directory),
    loading: enabled && !error && (directory === undefined || (initialize && directory === null)),
    connected, error,
    retry: () => setAttempt((value) => value + 1),
  };
}
