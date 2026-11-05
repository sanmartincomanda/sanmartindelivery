import React, { useState } from 'react';
import { normalizePromotionSealImage } from '../../services/storeProductPromotionCore';

export default function RetailPromoSeal({ promotion }) {
  const [failedImage, setFailedImage] = useState('');
  const image = normalizePromotionSealImage(promotion?.sealImage);
  if (image && failedImage !== image) return (
    <span className="retail-campaign-seal">
      <img src={image} alt={promotion.title || 'Promocion especial'} width="1280" height="435"
        onError={() => setFailedImage(image)} />
    </span>
  );
  return (
    <span className="retail-promo-seal" role="img" aria-label="Preciazos en Carnes San Martín, sí">
      <span className="retail-promo-seal-title">PRECIAZOS</span>
      <span className="retail-promo-seal-brand"><small>en</small> Carnes<br />San Martín <b>sí</b></span>
    </span>
  );
}
