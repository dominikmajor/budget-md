import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

let openCount = 0;

/** Alulról felúszó panel (bottom sheet) lehúzással zárható fogantyúval. */
export default function Sheet({ open = true, onClose, title, children, footer, tall }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    openCount++;
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      if (--openCount === 0) document.body.classList.remove('no-scroll');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setClosing(true);
    setTimeout(() => onClose?.(), 200);
  };

  if (!open) return null;
  return createPortal(
    <div className={`sheet-root ${closing ? 'closing' : ''}`}>
      <div className="sheet-backdrop" onClick={close} />
      <div className={`sheet ${tall ? 'tall' : ''}`} style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        role="dialog" aria-modal="true" aria-label={title}>
        <div
          className="sheet-handle-zone"
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => { if (startY.current != null) setDrag(Math.max(0, e.touches[0].clientY - startY.current)); }}
          onTouchEnd={() => { if (drag > 110) close(); setDrag(0); startY.current = null; }}
        >
          <div className="sheet-handle" />
          {title && (
            <div className="sheet-head">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={close} aria-label="Bezárás"><X size={20} /></button>
            </div>
          )}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

