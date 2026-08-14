import miembroGoldLogo from '../assets/miembro-gold-logo-original.jpg';

export default function SanMartinGoldIcon({ size = 54, className = '' }) {
  return (
    <span
      className={`san-martin-gold-logo-frame${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <img
        src={miembroGoldLogo}
        alt="Miembro Gold"
        decoding="async"
      />
    </span>
  );
}
