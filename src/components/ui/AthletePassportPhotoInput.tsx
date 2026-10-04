import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Sparkles, CheckCircle2, RefreshCw, X, User } from 'lucide-react';

export function buildDefaultPassportPhotoSvg(params: {
  fullName?: string;
  jerseyNumber?: number | string;
  bgColor?: 'RED' | 'BLUE' | 'WHITE' | string;
  sizeSpec?: '3x4' | '4x6' | string;
  channel?: 'ONLINE' | 'OFFLINE' | string;
}): string {
  const bg =
    params.bgColor === 'BLUE'
      ? '%230b4f9c'
      : params.bgColor === 'WHITE'
      ? '%23cbd5e1'
      : '%23b91c1c';
  const jersey = params.jerseyNumber !== undefined && params.jerseyNumber !== '' ? params.jerseyNumber : '00';
  const spec = params.sizeSpec || '3x4';
  const ch = params.channel || 'RESMI';
  return (
    'data:image/svg+xml;utf8,' +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">` +
    `<rect width="300" height="400" fill="${bg}"/>` +
    `<circle cx="150" cy="135" r="58" fill="%23f1c27d"/>` +
    `<path d="M92 125 C92 75, 208 75, 208 125 C200 100, 100 100, 92 125 Z" fill="%231e293b"/>` +
    `<circle cx="130" cy="138" r="5" fill="%230f172a"/>` +
    `<circle cx="170" cy="138" r="5" fill="%230f172a"/>` +
    `<path d="M136 162 Q150 172 164 162" stroke="%230f172a" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
    `<path d="M55 395 C55 255, 245 255, 245 395 Z" fill="%230f172a"/>` +
    `<path d="M95 265 L150 330 L205 265 L225 395 L75 395 Z" fill="%23f59e0b"/>` +
    `<text x="150" y="368" font-family="monospace" font-weight="900" font-size="34" fill="%23090d16" text-anchor="middle">%23${jersey}</text>` +
    `<rect x="0" y="376" width="300" height="24" fill="%23090d16" opacity="0.88"/>` +
    `<text x="150" y="392" font-family="sans-serif" font-weight="700" font-size="11" fill="%23f8fafc" text-anchor="middle">PAS FOTO ${spec} • ${ch}</text>` +
    `</svg>`
  );
}

export function AthletePhotoThumbnail({
  photoUrl,
  fullName,
  jerseyNumber,
  photoBgColor = 'RED',
  photoSizeSpec = '3x4',
  size = 'md',
  onClick,
}: {
  photoUrl?: string | null;
  fullName: string;
  jerseyNumber?: number | string;
  photoBgColor?: string;
  photoSizeSpec?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const src =
    photoUrl && photoUrl.trim().length > 0
      ? photoUrl
      : buildDefaultPassportPhotoSvg({
          fullName,
          jerseyNumber,
          bgColor: photoBgColor,
          sizeSpec: photoSizeSpec,
        });

  const dims =
    size === 'sm'
      ? 'w-11 h-14'
      : size === 'lg'
      ? 'w-28 h-36'
      : 'w-14 h-18';

  const bgClass =
    photoBgColor === 'BLUE'
      ? 'bg-blue-800'
      : photoBgColor === 'WHITE'
      ? 'bg-slate-200'
      : 'bg-red-800';

  return (
    <div
      onClick={onClick}
      title={`Pas Foto Resmi ${photoSizeSpec} — ${fullName}`}
      className={`${dims} ${bgClass} relative rounded border-2 border-slate-700 overflow-hidden shrink-0 shadow-sm ${
        onClick ? 'cursor-pointer hover:border-amber-400 transition-colors' : ''
      }`}
    >
      <img
        src={src}
        alt={`Pas Foto ${fullName}`}
        className="w-full h-full object-cover"
      />
      <span className="absolute bottom-0 inset-x-0 bg-slate-950/85 text-[8px] font-mono text-amber-300 text-center py-0.5 leading-none">
        {photoSizeSpec}
      </span>
    </div>
  );
}

export function AthletePassportPhotoInput({
  photoUrl,
  photoSizeSpec,
  photoBgColor,
  registrationChannel,
  fullName,
  jerseyNumber,
  required = true,
  onChange,
}: {
  photoUrl: string;
  photoSizeSpec: '3x4' | '4x6';
  photoBgColor: 'RED' | 'BLUE' | 'WHITE';
  registrationChannel: 'ONLINE' | 'OFFLINE';
  fullName?: string;
  jerseyNumber?: string | number;
  required?: boolean;
  onChange: (next: {
    photoUrl: string;
    photoSizeSpec: '3x4' | '4x6';
    photoBgColor: 'RED' | 'BLUE' | 'WHITE';
  }) => void;
}) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [showUrlBox, setShowUrlBox] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 800 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      setCameraError(
        'Kamera tidak dapat diakses di perangkat/browser ini. Gunakan tombol Unggah File Pas Foto atau Buat Pas Foto Standar.'
      );
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const targetW = 360;
    const targetH = 480;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background color
    ctx.fillStyle =
      photoBgColor === 'BLUE' ? '#0b4f9c' : photoBgColor === 'WHITE' ? '#f8fafc' : '#b91c1c';
    ctx.fillRect(0, 0, targetW, targetH);

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const targetAspect = targetW / targetH;
    const videoAspect = vw / vh;

    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (videoAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

    // Add subtle bottom official strip
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.fillRect(0, targetH - 28, targetW, 28);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `PAS FOTO ${photoSizeSpec} • ${registrationChannel} • ZAMOA CBTC`,
      targetW / 2,
      targetH - 10
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    onChange({
      photoUrl: dataUrl,
      photoSizeSpec,
      photoBgColor,
    });
    stopCamera();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetW = 360;
        const targetH = 480;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Fill official pas foto background color (shows behind transparent PNGs)
        ctx.fillStyle =
          photoBgColor === 'BLUE' ? '#0b4f9c' : photoBgColor === 'WHITE' ? '#f8fafc' : '#b91c1c';
        ctx.fillRect(0, 0, targetW, targetH);

        const iw = img.width;
        const ih = img.height;
        const targetAspect = targetW / targetH;
        const imgAspect = iw / ih;

        let sx = 0;
        let sy = 0;
        let sw = iw;
        let sh = ih;

        if (imgAspect > targetAspect) {
          sw = ih * targetAspect;
          sx = (iw - sw) / 2;
        } else {
          sh = iw / targetAspect;
          sy = (ih - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        onChange({
          photoUrl: dataUrl,
          photoSizeSpec,
          photoBgColor,
        });
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateOfficialAvatar = (
    nextBg: 'RED' | 'BLUE' | 'WHITE' = photoBgColor,
    nextSize: '3x4' | '4x6' = photoSizeSpec
  ) => {
    const generated = buildDefaultPassportPhotoSvg({
      fullName: fullName || 'Atlet Baru',
      jerseyNumber: jerseyNumber || '11',
      bgColor: nextBg,
      sizeSpec: nextSize,
      channel: registrationChannel,
    });
    onChange({
      photoUrl: generated,
      photoSizeSpec: nextSize,
      photoBgColor: nextBg,
    });
  };

  const effectivePreview =
    photoUrl && photoUrl.trim().length > 0
      ? photoUrl
      : buildDefaultPassportPhotoSvg({
          fullName,
          jerseyNumber,
          bgColor: photoBgColor,
          sizeSpec: photoSizeSpec,
          channel: registrationChannel,
        });

  return (
    <div className="p-4 rounded-lg border border-amber-500/30 bg-slate-950/80 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            <span>
              DOKUMEN WAJIB: PAS FOTO RESMI ATLET / PEMAIN ({registrationChannel})
              {required ? ' *' : ''}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Digunakan untuk Kartu ID QR Presensi Digital, Lisensi Kompetisi PERBASI, dan Buku Induk Akademi.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Pas Foto Siap ({photoSizeSpec})</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Left: 3x4 / 4x6 Pas Foto Frame Preview */}
        <div className="md:col-span-4 flex flex-col items-center space-y-2">
          <div
            className={`relative w-36 h-48 rounded-md border-2 border-amber-400/70 shadow-lg overflow-hidden ${
              photoBgColor === 'BLUE'
                ? 'bg-blue-800'
                : photoBgColor === 'WHITE'
                ? 'bg-slate-100'
                : 'bg-red-800'
            }`}
          >
            {cameraActive ? (
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Alignment guide overlay */}
                <div className="absolute inset-3 border border-dashed border-amber-300/80 rounded-full pointer-events-none" />
              </div>
            ) : (
              <img
                src={effectivePreview}
                alt="Preview Pas Foto Atlet"
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-slate-950/85 text-[10px] font-mono text-amber-300 border border-amber-500/40">
              {photoSizeSpec}
            </div>
          </div>
          <div className="text-[11px] font-mono text-slate-400 text-center">
            Bingkai Pas Foto Resmi {photoSizeSpec} • Latar{' '}
            {photoBgColor === 'RED' ? 'Merah' : photoBgColor === 'BLUE' ? 'Biru' : 'Putih'}
          </div>
        </div>

        {/* Right: Controls for Upload, Camera, Specs & Background */}
        <div className="md:col-span-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ukuran Standar Pas Foto</label>
              <div className="grid grid-cols-2 gap-2">
                {(['3x4', '4x6'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      if (!photoUrl || photoUrl.startsWith('data:image/svg+xml')) {
                        handleGenerateOfficialAvatar(photoBgColor, sz);
                      } else {
                        onChange({ photoUrl, photoSizeSpec: sz, photoBgColor });
                      }
                    }}
                    className={`px-3 py-2 text-xs font-mono font-semibold rounded border transition-colors ${
                      photoSizeSpec === sz
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Pas Foto {sz}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Warna Latar Belakang Resmi</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { code: 'RED', label: 'Merah' },
                    { code: 'BLUE', label: 'Biru' },
                    { code: 'WHITE', label: 'Putih' },
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.code}
                    type="button"
                    onClick={() => {
                      if (!photoUrl || photoUrl.startsWith('data:image/svg+xml')) {
                        handleGenerateOfficialAvatar(bg.code, photoSizeSpec);
                      } else {
                        onChange({ photoUrl, photoSizeSpec, photoBgColor: bg.code });
                      }
                    }}
                    className={`px-2.5 py-2 text-xs font-semibold rounded border transition-colors ${
                      photoBgColor === bg.code
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons: Upload File, Live Camera, Official Generator */}
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              Pilih Metode Pengambilan Pas Foto ({registrationChannel === 'ONLINE' ? 'Unggah Mandiri / Selfie HP' : 'Kamera Loket Sekretariat / File Foto'}):
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Unggah File Pas Foto (JPG/PNG)</span>
              </button>

              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ambil Foto Kamera Langsung</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Jepret Pas Foto Sekarang</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-2.5 py-2 text-xs font-semibold bg-red-950/60 hover:bg-red-900/60 text-red-200 border border-red-800 rounded-md flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Batal</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleGenerateOfficialAvatar(photoBgColor, photoSizeSpec)}
                className="px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Generate Pas Foto Standar</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUrlBox((prev) => !prev)}
                className="px-2.5 py-2 text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-md"
              >
                {showUrlBox ? 'Tutup Input URL' : 'Input URL Foto'}
              </button>
            </div>
          </div>

          {cameraError && (
            <div className="p-2.5 rounded border border-amber-700/60 bg-amber-950/30 text-xs text-amber-200">
              {cameraError}
            </div>
          )}

          {showUrlBox && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="url"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                placeholder="https://contoh.com/pas-foto-atlet.jpg"
                className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (customUrlInput.trim()) {
                    onChange({
                      photoUrl: customUrlInput.trim(),
                      photoSizeSpec,
                      photoBgColor,
                    });
                    setShowUrlBox(false);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Terapkan URL
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
