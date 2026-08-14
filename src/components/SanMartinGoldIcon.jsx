import miembroGoldLogo from '../assets/miembro-gold-logo-original.jpg';

export default function SanMartinGoldIcon({ size = 54, className = '' }) {
  return (
    <img
      className={className}
      src={miembroGoldLogo}
      width={size}
      height={size}
      alt="Miembro Gold"
      decoding="async"
      style={{ display: 'block', objectFit: 'cover' }}
    />
  );
}
