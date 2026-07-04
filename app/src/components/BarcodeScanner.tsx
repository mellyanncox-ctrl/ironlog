import React, { useEffect, useRef, useState } from 'react';
import { Button, TextInput } from './ui';

// Full-screen camera barcode scanner. ZXing is dynamically imported so the
// decoder (~heavy) is code-split out of the main bundle and only fetched when a
// user actually scans. Falls back to manual entry when there's no camera or
// permission is denied — so the feature never dead-ends.
export function BarcodeScanner({ onDetected, onClose }: {
  onDetected: (code: string) => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'nocamera'>('starting');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStatus('nocamera'); return;
      }
      try {
        const zxing = await import('@zxing/library');
        if (cancelled) return;
        const hints = new Map();
        hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
          zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.EAN_8,
          zxing.BarcodeFormat.UPC_A, zxing.BarcodeFormat.UPC_E, zxing.BarcodeFormat.CODE_128,
        ]);
        const reader = new zxing.BrowserMultiFormatReader(hints, 500);
        controlsRef.current = reader;
        await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (result: any) => {
          if (result && !doneRef.current) {
            doneRef.current = true;
            try { reader.reset(); } catch { /* noop */ }
            navigator.vibrate?.(40);
            onDetected(result.getText());
          }
        });
        if (!cancelled) setStatus('scanning');
      } catch {
        if (!cancelled) setStatus('nocamera');
      }
    }
    start();
    return () => {
      cancelled = true;
      try { controlsRef.current?.reset?.(); } catch { /* noop */ }
    };
  }, []);

  function submitManual() {
    const c = manual.replace(/\D/g, '');
    if (c.length >= 6) { doneRef.current = true; onDetected(c); }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
        <span className="text-[15px] font-semibold text-white">Scan barcode</span>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center text-[15px]">✕</button>
      </div>

      {status !== 'nocamera' && (
        <div className="relative grow overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
          {/* viewfinder */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[72%] max-w-xs aspect-[3/2] rounded-2xl border-2 border-white/80 shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]" />
          </div>
          <div className="absolute bottom-6 left-0 right-0 text-center text-white/85 text-[13px] px-6">
            {status === 'starting' ? 'Starting camera…' : 'Point at a product barcode'}
          </div>
        </div>
      )}

      {status === 'nocamera' && (
        <div className="grow flex flex-col items-center justify-center px-8 text-center">
          <div className="text-4xl mb-3">📷</div>
          <div className="text-[16px] font-semibold text-white mb-1">Camera unavailable</div>
          <div className="text-[13px] text-white/60">Allow camera access in your browser, or type the barcode number below.</div>
        </div>
      )}

      {/* manual fallback — always available */}
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 bg-black">
        <div className="flex gap-2">
          <TextInput inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)}
            placeholder="Enter barcode number" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
          <Button onClick={submitManual} disabled={manual.replace(/\D/g, '').length < 6}>Look up</Button>
        </div>
      </div>
    </div>
  );
}
