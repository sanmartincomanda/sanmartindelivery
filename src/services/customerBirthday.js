const cleanDigits = (value = '') => String(value || '').replace(/\D/g, '');

const padBirthdayNumber = (value) => String(value || '').padStart(2, '0');

const getBirthdayMaxDay = (month) => {
  const monthNumber = Number(month);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return 0;
  }

  if (monthNumber === 2) {
    return 29;
  }

  if ([4, 6, 9, 11].includes(monthNumber)) {
    return 30;
  }

  return 31;
};

export const normalizeBirthdayValue = (value = '') => {
  const cleanValue = String(value || '').trim();
  let month = '';
  let day = '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    const [, extractedMonth, extractedDay] = cleanValue.split('-');
    month = extractedMonth;
    day = extractedDay;
  } else if (/^\d{2}-\d{2}$/.test(cleanValue)) {
    [month, day] = cleanValue.split('-');
  } else if (/^\d{2}\/\d{2}$/.test(cleanValue)) {
    const [extractedDay, extractedMonth] = cleanValue.split('/');
    month = extractedMonth;
    day = extractedDay;
  } else {
    return '';
  }

  const cleanMonth = padBirthdayNumber(month);
  const cleanDay = padBirthdayNumber(day);
  const monthNumber = Number(cleanMonth);
  const dayNumber = Number(cleanDay);
  const maxDay = getBirthdayMaxDay(monthNumber);

  if (!Number.isInteger(monthNumber) || !Number.isInteger(dayNumber) || maxDay <= 0) {
    return '';
  }

  if (dayNumber < 1 || dayNumber > maxDay) {
    return '';
  }

  return `${cleanMonth}-${cleanDay}`;
};

export const formatBirthdayInputValue = (value = '') => {
  const normalized = normalizeBirthdayValue(value);
  if (!normalized) {
    return '';
  }

  const [month, day] = normalized.split('-');
  return `${day}/${month}`;
};

export const normalizeBirthdayInput = (value = '') => {
  const digits = cleanDigits(value).slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};
