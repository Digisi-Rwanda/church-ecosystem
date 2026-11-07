import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useT } from '../i18n/I18nContext';

/** A QR code for an address, drawn here (nothing is sent to anyone), with a link to save it as a picture. */
export function QrCode({ value, alt }: { value: string; alt: string }) {
  const t = useT();
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(''));
    return () => {
      live = false;
    };
  }, [value]);
  if (!src) return null;
  return (
    <div className="door-qr">
      <img src={src} alt={alt} width={176} height={176} />
      <a className="btn ghost sm" href={src} download="qr-code.png">{t('door.plan.guests.qrDownload')}</a>
    </div>
  );
}
