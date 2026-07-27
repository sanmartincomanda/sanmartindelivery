const MAX_SICAR_DOMICILIO_LENGTH = 120;
const MAX_SICAR_COMMENT_LENGTH = 255;

const normalizeText = (value = '') =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const truncateText = (value = '', maxLength = 0) => {
  const cleanValue = normalizeText(value);
  const safeMaxLength = Math.max(0, Number(maxLength || 0));
  if (!safeMaxLength || cleanValue.length <= safeMaxLength) {
    return cleanValue;
  }

  return cleanValue.slice(0, safeMaxLength).trim();
};

const splitAddressReference = (value = '') => {
  const cleanValue = normalizeText(value);
  if (!cleanValue) {
    return { address: '', reference: '' };
  }

  const refMatch = cleanValue.match(/^(.*?)(?:\s*\|\s*Ref:\s*|\s+Ref:\s*)(.+)$/i);
  if (!refMatch) {
    return { address: cleanValue, reference: '' };
  }

  return {
    address: normalizeText(refMatch[1]),
    reference: normalizeText(refMatch[2]),
  };
};

export const buildSicarCustomerTextFields = ({ fullAddress = '', commentPrefix = '' } = {}) => {
  const { address, reference } = splitAddressReference(fullAddress);
  const normalizedAddress = address || fullAddress || '-';
  const domicilio = truncateText(normalizedAddress, MAX_SICAR_DOMICILIO_LENGTH) || '-';
  const overflow =
    normalizeText(normalizedAddress).length > MAX_SICAR_DOMICILIO_LENGTH
      ? normalizeText(normalizedAddress).slice(MAX_SICAR_DOMICILIO_LENGTH).trim()
      : '';
  const commentParts = [
    normalizeText(commentPrefix),
    reference ? `Ref: ${reference}` : '',
    overflow ? `Dir extra: ${overflow}` : '',
  ].filter(Boolean);

  return {
    domicilio,
    comentario: truncateText(commentParts.join(' | '), MAX_SICAR_COMMENT_LENGTH),
    reference,
    overflow,
  };
};
