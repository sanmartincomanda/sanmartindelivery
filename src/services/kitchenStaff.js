import { get, onValue, push, ref, runTransaction } from 'firebase/database';

export const KITCHEN_STAFF_PATH = 'kitchenStaff';

// Kept only for the initial migration and the display of pre-directory orders.
export const LEGACY_KITCHEN_STAFF = [
  ['noel-hernandez', 'Noel Hernandez', 'CHIMI'],
  ['julio-amador', 'Julio Amador', 'Julio'],
  ['roberto-centeno', 'Roberto Centeno', 'Roberto'],
  ['michael-perez', 'Michael Perez', 'Michael'],
  ['maria-gomez', 'Maria Gomez', 'Maria'],
  ['daniel-cruz', 'Daniel Cruz', 'Daniel'],
  ['noel-bendana', 'Noel Bendaña', 'Noel B.'],
  ['harvey-mora', 'Harvey Mora', 'Harvey'],
  ['logistica', 'Encargado Logistica', 'Logística'],
  ['otro', 'Otro', 'Otro'],
].map(([id, name, alias], index) => ({ id, name, alias, active: true, sortOrder: index, revision: 1 }));

const clean = (value) => String(value || '').trim().replace(/\s+/g, ' ');
export const normalizeStaffSearch = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function createInitialKitchenStaff(now = Date.now(), actor = 'migration') {
  return {
    schemaVersion: 1,
    members: Object.fromEntries(LEGACY_KITCHEN_STAFF.map(({ id, ...member }) => [id, {
      ...member, createdAt: now, updatedAt: now, updatedBy: actor,
    }])),
  };
}

export function getKitchenStaffMembers(directory) {
  // An initialized but empty/inactive directory must never restore old names.
  if (directory == null) return LEGACY_KITCHEN_STAFF.map((member) => ({ ...member }));
  if (directory.schemaVersion !== 1) throw new Error('No se pudo leer el directorio de preparadores.');
  return Object.entries(directory.members || {})
    .map(([id, member]) => ({ ...member, id }))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'es'));
}

export function getOrderPreparerName(order) {
  const name = typeof order === 'string' ? order : order?.cocinero;
  return (typeof order === 'object' && order?.cocineroAlias)
    || LEGACY_KITCHEN_STAFF.find((member) => member.name === name)?.alias || name || '';
}

export function validateKitchenStaffMember(input, members = []) {
  const name = clean(input.name);
  const alias = clean(input.alias) || name;
  if (!name || name.length > 80) throw new Error('Escribí un nombre de hasta 80 caracteres.');
  if (alias.length > 40) throw new Error('El nombre en cocina debe tener hasta 40 caracteres.');
  if (members.some((member) => member.id !== input.id && normalizeStaffSearch(member.name) === normalizeStaffSearch(name))) {
    throw new Error('Ya existe una persona con ese nombre. Revisá también los inactivos.');
  }
  if (members.some((member) => member.id !== input.id && normalizeStaffSearch(member.alias) === normalizeStaffSearch(alias))) {
    throw new Error('Ese nombre en cocina ya está en uso. Elegí otro para distinguirlos.');
  }
  return { name, alias, active: input.active !== false };
}

export function kitchenStaffError(error) {
  if (/permission.denied/i.test(String(error?.code || error?.message))) {
    return 'No tenés permiso para esta acción. Ingresá con una cuenta administradora.';
  }
  if (/network|disconnect|unavailable/i.test(String(error?.code || error?.message))) {
    return 'No se pudo conectar. Revisá tu conexión e intentá nuevamente.';
  }
  return error?.message || 'No se pudo guardar. Intentá nuevamente.';
}

export function createKitchenStaffService(database) {
  const directoryRef = ref(database, KITCHEN_STAFF_PATH);
  return {
    subscribe: (onChange, onError) => onValue(directoryRef, (snapshot) => onChange(snapshot.val()), onError),
    async initialize(actor = 'migration') {
      return runTransaction(directoryRef, (current) => current == null
        ? createInitialKitchenStaff(Date.now(), clean(actor).slice(0, 128) || 'admin') : undefined,
      { applyLocally: false });
    },
    async save(input, actor = 'admin') {
      // A cold SDK transaction may start with null even after get(). The server
      // retries with its current value before committing this provisional draft.
      const initial = (await get(directoryRef)).val();
      const id = input.id || push(ref(database, `${KITCHEN_STAFF_PATH}/members`)).key;
      let failure;
      const result = await runTransaction(directoryRef, (current) => {
        failure = null;
        try {
          const directory = current ?? initial ?? createInitialKitchenStaff();
          const members = getKitchenStaffMembers(directory);
          const existing = directory.members?.[id];
          if (input.id && (!existing || existing.revision !== input.expectedRevision)) {
            throw new Error('Esta persona fue modificada en otra pantalla. Cerrá y volvé a abrir la edición.');
          }
          const fields = validateKitchenStaffMember({ ...input, id }, members);
          const now = Date.now();
          return { ...directory, members: { ...directory.members, [id]: {
            ...fields,
            sortOrder: existing?.sortOrder ?? Math.max(-1, ...members.map((member) => member.sortOrder)) + 1,
            revision: (existing?.revision || 0) + 1,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            updatedBy: clean(actor).slice(0, 128) || 'admin',
          } } };
        } catch (error) { failure = error; return undefined; }
      }, { applyLocally: false });
      if (!result.committed) throw failure || new Error('No se pudo guardar. Intentá nuevamente.');
      return { ...result.snapshot.val().members[id], id };
    },
    async assignment(staffId) {
      const snapshot = await get(directoryRef);
      const member = getKitchenStaffMembers(snapshot.val()).find((item) => item.id === staffId && item.active === true);
      if (!member) throw new Error('Este preparador ya no está activo. Elegí otra persona.');
      return { cocinero: member.name, cocineroId: member.id, cocineroAlias: member.alias };
    },
  };
}
