import React, { useRef, useState } from 'react';

export default function RetailProductRail({ title, children }) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const finish = () => { gesture.current = null; setDragging(false); };
  return <div className="store-grid retail-home-carousel" role="region" tabIndex={0}
    aria-label={`Productos de ${title}. Deslizá para ver todos.`} data-dragging={dragging || undefined}
    onPointerDown={event => {
      suppressClick.current = false;
      if (event.pointerType !== 'mouse' || event.button !== 0 ||
          event.target.closest('input, select, textarea, a, .retail-card-stepper, .retail-card-add')) return;
      gesture.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, id: event.pointerId, moved: false };
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (!start || event.pointerId !== start.id) return;
      const distance = event.clientX - start.x;
      if (!start.moved) {
        if (Math.abs(distance) < 6 || Math.abs(distance) < Math.abs(event.clientY - start.y)) return;
        start.moved = true;
        suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }
      event.preventDefault();
      event.currentTarget.scrollLeft = start.left - distance;
    }}
    onPointerUp={event => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      finish();
    }}
    onPointerCancel={finish} onLostPointerCapture={finish}
    onPointerLeave={() => { if (!gesture.current?.moved) finish(); }}
    onClickCapture={event => {
      // Dragging a product photo must not open its detail when the mouse lifts.
      if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
    }}
    onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const rail = event.currentTarget;
      const left = event.key === 'Home' ? 0 : event.key === 'End' ? rail.scrollWidth
        : rail.scrollLeft + (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * .8;
      rail.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }}>
    {children}
  </div>;
}
