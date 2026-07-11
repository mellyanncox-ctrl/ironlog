import React, { useEffect, useRef, useState } from 'react';
import { Button, TextInput } from './ui';

// Full-screen camera barcode scanner built on zxing-wasm (the maintained
// zxing-cpp build). Chosen over @zxing/library specifically because drinks —
// curved cans and bottles — routinely defeated the old TS port. zxing-cpp's
// tryHarder/tryRotate pipeline reads curved, small and low-contrast 1D codes
// far more reliably. The decoder (~1MB wasm) is dynamically imported so it
// stays out of the main bundle and is precached by the PWA for offline use.
// Falls back to manual entry when there's no camera or permission is denied.

const DECODE_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128'] as const;
const DECODE_INTERVAL_MS = 140; // pause between decode attempts

export function BarcodeScanner({ onDetected, onClose }: {
  onDetected: (code: string) => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'nocamera'>('starting');
  const [torch, setTorch] = useState<'unavailable' | 'off' | 'on'>('unavailable');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStatus('nocamera'); return;
      }
      try {
        // High resolution matters: 1D barcodes on curved drink cans need
        // enough pixels across the code for the digit patterns to resolve.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => { /* iOS needs playsInline; already set */ });

        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.() ?? {};
        if (caps.torch) setTorch('off');

        // Load decoder + wasm URL lazily (code-split; served locally so
        // offline re-scans keep working once the PWA has precached it).
        const [zxing, wasmMod] = await Promise.all([
          import('zxing-wasm/reader'),
          import('zxing-wasm/reader/zxing_reader.wasm?url'),
        ]);
        zxing.prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith('.wasm') ? (wasmMod as any).default : prefix + path,
          },
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        if (!cancelled) setStatus('scanning');

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            const vw = video.videoWidth, vh = video.videoHeight;
            if (vw && vh) {
              // Crop to the central region (roughly the viewfinder). Less
              // background = fewer false leads and faster tryHarder passes.
              const cw = Math.round(vw * 0.8);
              const ch = Math.round(vh * 0.55);
              const cx = Math.round((vw - cw) / 2);
              const cy = Math.round((vh - ch) / 2);
              canvas.width = cw; canvas.height = ch;
              ctx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
              const img = ctx.getImageData(0, 0, cw, ch);
              const results = await zxing.readBarcodes(img, {
                formats: [...DECODE_FORMATS],
                tryHarder: true,
                tryRotate: true,
                tryInvert: true,
                maxNumberOfSymbols: 1,
              });
              const hit = results.find((r: any) => r.isValid && r.text);
              if (hit && !doneRef.current) {
                doneRef.current = true;
                navigator.vibrate?.(40);
                stop();
                onDetected(hit.text);
                return;
              }
            }
          } catch { /* single bad frame never kills the loop */ }
          timer = setTimeout(tick, DECODE_INTERVAL_MS);
        };
        tick();
      } catch {
        if (!cancelled) setStatus('nocamera');
      }
    }

    function stop() {
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    start();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = torch === 'on' ? 'off' : 'on';
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: next === 'on' }] });
      setTorch(next);
    } catch { /* some devices refuse mid-stream; leave state as-is */ }
  }

  function submitManual() {
    const c = manual.replace(/\D/g, '');
    if (c.length >= 6) { doneRef.current = true; onDetected(c); }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
        <span className="text-[15px] font-semibold text-white">Scan barcode</span>
        <div className="flex items-center gap-2">
          {torch !== 'unavailable' && status === 'scanning' && (
            <button onClick={toggleTorch} aria-label="Toggle torch"
              className={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] ${torch === 'on' ? 'bg-white text-black' : 'bg-white/15 text-white'}`}>
              🔦
            </button>
          )}
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center text-[15px]">✕</button>
        </div>
      </div>

      {status !== 'nocamera' && (
        <div className="relative grow overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
          {/* viewfinder */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[72%] max-w-xs aspect-[3/2] rounded-2xl border-2 border-white/80 shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]" />
          </div>
          <div className="absolute bottom-6 left-0 right-0 text-center text-white/85 text-[13px] px-6">
            {status === 'starting' ? 'Starting camera…' : 'Point at a product barcode — cans read best side-on, close up'}
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
