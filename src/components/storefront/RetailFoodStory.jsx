import React, { useState } from 'react';

const STORIES = {
  cuts: {
    eyebrow: 'EL PLAN DE HOY',
    title: 'Hoy se come bien.',
    action: 'Elegí tu corte',
    image: '/tienda/editorial/parrilla-marina-utrabo.webp',
    label: 'Hoy se come bien. Ver Línea Gold',
  },
  burgers: {
    eyebrow: 'HECHAS EN CASA',
    title: 'Noche de hamburguesas.',
    action: 'Ver tortas de carne',
    image: '/tienda/editorial/burger-mary-nikitina.webp',
    label: 'Noche de hamburguesas. Ver tortas de carne',
  },
  grill: {
    eyebrow: 'PARA COMPARTIR',
    title: 'Se armó la parrillada.',
    action: 'Ver Línea Parrillera',
    image: '/tienda/editorial/parrillada-maor-attias.webp',
    imageHeight: 667,
    label: 'Parrillada. Ver Línea Parrillera',
  },
};

// Editorial inspiration only: prices and promotions still come from the catalog.
export default function RetailFoodStory({ variant = 'cuts', onBrowse }) {
  const story = STORIES[variant];
  const [imageUnavailable, setImageUnavailable] = useState(false);
  return (
    <button type="button" className={`retail-food-story retail-food-story--${variant}`}
      onClick={onBrowse} aria-label={story.label}>
      <span className="retail-food-story-copy">
        <span className="retail-food-story-eyebrow">{story.eyebrow}</span>
        <strong>{story.title}</strong>
        <span className="retail-food-story-action">{story.action}<span aria-hidden="true">→</span></span>
      </span>
      <span className="retail-food-story-media" aria-hidden="true">
        {!imageUnavailable && <img src={story.image} alt="" width="1000" height={story.imageHeight || 1500}
          loading={variant === 'cuts' ? 'eager' : 'lazy'} decoding="async"
          onError={() => setImageUnavailable(true)} />}
      </span>
    </button>
  );
}
