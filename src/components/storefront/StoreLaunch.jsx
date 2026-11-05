import React, { useEffect, useState } from 'react';
import { getBrowserStorage, rememberStoreLaunch, shouldShowStoreLaunch } from './retailInteractionState';
import '../../styles/storeLaunch.css';

// The app loads underneath the welcome; network requests never wait for animation.
export default function StoreLaunch({ children, failed = false }) {
  const [visible, setVisible] = useState(() => shouldShowStoreLaunch(
    getBrowserStorage('sessionStorage'), window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));
  useEffect(() => {
    if (!visible) return undefined;
    rememberStoreLaunch(getBrowserStorage('sessionStorage'));
    const timeout = window.setTimeout(() => setVisible(false), 1150);
    return () => window.clearTimeout(timeout);
  }, [visible]);
  const show = visible && !failed;
  return <>
    <div inert={show ? '' : undefined} aria-hidden={show ? true : undefined}>{children}</div>
    {show && <div className="csm-launch">
      <div className="csm-launch-art" aria-hidden="true" />
      <div className="csm-launch-brand" role="status">
        <div className="csm-launch-mark"><img src="/tienda/branding/logo-mark.svg" alt="" width="104" height="104" /></div>
        <strong>CARNES<br />SAN MARTÍN</strong>
        <span>Tu próximo buen corte.</span>
      </div>
      <button className="csm-launch-skip" type="button" onClick={() => setVisible(false)}>Ir a la tienda <span aria-hidden="true">→</span></button>
    </div>}
  </>;
}
