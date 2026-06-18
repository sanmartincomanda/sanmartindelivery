export const SICAR_SYNC_THRESHOLD_PCT = 90;
export const SICAR_MIN_OVERALL_SHARE_PCT = 1;

export const SICAR_SYNC_DEPARTMENTS = [
  {
    sicarDepartment: 'RES',
    storeCategoryId: 'res',
    storeCategoryLabel: 'Res',
    sortOrder: 10,
  },
  {
    sicarDepartment: 'POLLO',
    storeCategoryId: 'pollo',
    storeCategoryLabel: 'Pollo',
    sortOrder: 20,
  },
  {
    sicarDepartment: 'CERDO',
    storeCategoryId: 'cerdo',
    storeCategoryLabel: 'Cerdo',
    sortOrder: 30,
  },
  {
    sicarDepartment: 'ABARROTERIA',
    storeCategoryId: 'abarroteria',
    storeCategoryLabel: 'Abarroteria',
    sortOrder: 40,
  },
  {
    sicarDepartment: 'CONGELADOS',
    storeCategoryId: 'congelados',
    storeCategoryLabel: 'Congelados',
    sortOrder: 50,
  },
  {
    sicarDepartment: 'Refrigerado',
    storeCategoryId: 'refrigerados',
    storeCategoryLabel: 'Refrigerados',
    sortOrder: 60,
  },
];

export const SICAR_SPECIAL_SKU_OVERRIDES = {
  '00446': {
    sicarDepartment: 'CERDO',
    sicarCategory: 'Cerdo',
    storeCategoryId: 'cerdo',
    storeCategoryLabel: 'Cerdo',
    storeSubcategory: 'Cerdo',
  },
  '00448': {
    sicarDepartment: 'CERDO',
    sicarCategory: 'Cerdo',
    storeCategoryId: 'cerdo',
    storeCategoryLabel: 'Cerdo',
    storeSubcategory: 'Cerdo',
  },
  '00449': {
    sicarDepartment: 'CERDO',
    sicarCategory: 'Cerdo',
    storeCategoryId: 'cerdo',
    storeCategoryLabel: 'Cerdo',
    storeSubcategory: 'Cerdo',
  },
  '00450': {
    sicarDepartment: 'CERDO',
    sicarCategory: 'Cerdo',
    storeCategoryId: 'cerdo',
    storeCategoryLabel: 'Cerdo',
    storeSubcategory: 'Cerdo',
  },
};

export const SICAR_DEPARTMENT_MAP = Object.fromEntries(
  SICAR_SYNC_DEPARTMENTS.map((entry) => [entry.sicarDepartment, entry])
);

export const getSicarDepartmentConfig = (department) =>
  SICAR_DEPARTMENT_MAP[String(department || '').trim()] || null;
