import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Download } from 'lucide-react';
import {
  luminanceMask,
  dilateMask,
  fixCornerTouches,
  maskToTriangles,
  trianglesToBinaryStl,
} from './lib/imageToStl';

const RESOLUTIONS = [
  { value: 128, label: '빠름' },
  { value: 192, label: '보통' },
  { value: 256, label: '정밀' },
];

function SliderRow({ label, value, min, max, step, unit, onChange }) {
  const [draft, setDraft] = useState(null);

  const handleNumber = (e) => {
    const text = e.target.value;
    setDraft(text);
    const n = Number(text);
    if (text !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
  };

  return (
    <label className="stl-row">
      <span className="stl-row-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="stl-row-number">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft !== null && Number(draft) === value ? draft : String(value)}
          onChange={handleNumber}
          onBlur={() => setDraft(null)}
        />
        {unit}
      </span>
    </label>
  );
}

export default function ImageToStlModal({ onClose }) {
  const [img, setImg] = useState(null);
  const [fileName, setFileName] = useState('drawing');
  const [error, setError] = useState('');
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [thicken, setThicken] = useState(0.4);
  const [sizeMm, setSizeMm] = useState(13);
  const [lineHeight, setLineHeight] = useState(3);
  const [plate, setPlate] = useState(true);
  const [plateW, setPlateW] = useState(13);
  const [plateH, setPlateH] = useState(13);
  const [plateThickness, setPlateThickness] = useState(1.5);
  const [resolution, setResolution] = useState(192);
  const canvasRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일(png, jpg 등)만 올릴 수 있어요.');
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        setError('이 이미지는 크기를 알 수 없어요. png나 jpg 파일로 해 볼까요?');
        return;
      }
      setImg(image);
      setFileName(file.name.replace(/\.[^.]+$/, '') || 'drawing');
      setError('');
    };
    image.onerror = () => setError('이미지를 열 수 없어요. 다른 파일로 해 볼까요?');
    image.src = url;
  };

  // 바닥판이 있으면 격자 = 바닥판(가로×세로) 영역이고 그림은 그 중앙에 놓인다.
  // 바닥판이 없으면 격자 = 그림 영역이다.
  const grid = useMemo(() => {
    if (!img) return null;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    let w, h, cell, dx, dy, dw, dh;
    if (plate) {
      cell = Math.max(plateW, plateH) / resolution;
      w = Math.max(1, Math.round(plateW / cell));
      h = Math.max(1, Math.round(plateH / cell));
      const mmPerPx = sizeMm / Math.max(natW, natH);
      dw = (natW * mmPerPx) / cell;
      dh = (natH * mmPerPx) / cell;
      dx = (w - dw) / 2;
      dy = (h - dh) / 2;
    } else {
      const longSide = Math.max(natW, natH);
      const scale = Math.min(resolution, longSide) / longSide;
      w = Math.max(1, Math.round(natW * scale));
      h = Math.max(1, Math.round(natH * scale));
      cell = sizeMm / Math.max(w, h);
      dx = 0;
      dy = 0;
      dw = w;
      dh = h;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, dw, dh);
    return {
      w,
      h,
      cell,
      rgba: ctx.getImageData(0, 0, w, h).data,
      clipped: plate && (dw > w + 0.5 || dh > h + 0.5),
    };
  }, [img, resolution, plate, plateW, plateH, sizeMm]);

  const processed = useMemo(() => {
    if (!grid) return null;
    const radius = thicken / grid.cell;
    const base = luminanceMask(grid.rgba, grid.w, grid.h, threshold, invert);
    const mask = fixCornerTouches(dilateMask(base, grid.w, grid.h, radius), grid.w, grid.h);
    let ink = 0;
    let minX = grid.w;
    let maxX = -1;
    let minY = grid.h;
    let maxY = -1;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (!mask[y * grid.w + x]) continue;
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const inkW = ink ? maxX - minX + 1 : grid.w;
    const inkH = ink ? maxY - minY + 1 : grid.h;
    return { mask, ink, inkW, inkH };
  }, [grid, threshold, invert, thicken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !processed) return;
    canvas.width = grid.w;
    canvas.height = grid.h;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(grid.w, grid.h);
    const bg = plate ? [58, 62, 92] : [18, 20, 31];
    for (let p = 0; p < processed.mask.length; p++) {
      const on = processed.mask[p];
      out.data[p * 4] = on ? 192 : bg[0];
      out.data[p * 4 + 1] = on ? 132 : bg[1];
      out.data[p * 4 + 2] = on ? 252 : bg[2];
      out.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }, [grid, processed, plate]);

  const handleDownload = () => {
    if (!grid || !processed || processed.ink === 0) return;
    const triangles = maskToTriangles(processed.mask, grid.w, grid.h, {
      sizeMm: grid.cell * Math.max(grid.w, grid.h),
      lineHeight,
      plate,
      plateThickness,
    });
    const blob = new Blob([trianglesToBinaryStl(triangles)], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.stl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const noInk = processed && processed.ink === 0;
  const tooMuchInk = processed && grid && processed.ink > grid.w * grid.h * 0.85;
  const dims = grid && processed
    ? `${((plate ? grid.w : processed.inkW) * grid.cell).toFixed(1)} × ${((plate ? grid.h : processed.inkH) * grid.cell).toFixed(1)} × ${((plate ? plateThickness : 0) + lineHeight).toFixed(1)} mm`
    : '';

  return (
    <div className="guideline-modal-overlay" onClick={onClose}>
      <div className="stl-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="이미지를 STL로 만들기">
        <button className="stl-close" onClick={onClose} title="닫기"><X size={20} /></button>
        <h2>그림을 3D 프린터 파일(STL)로 만들기</h2>
        <p className="stl-intro">그림을 올리면 어두운 선을 굵게 만들어 3D로 세워 줘요. 선이 또렷한 그림일수록 잘 만들어져요.</p>

        <label className="stl-upload">
          <Upload size={18} /> {img ? '다른 이미지 올리기' : '이미지 올리기'}
          <input type="file" accept="image/*" onChange={handleFile} hidden />
        </label>
        {error && <p className="stl-error">{error}</p>}

        {grid && processed && (
          <>
            <div className="stl-preview">
              <canvas ref={canvasRef} />
            </div>
            <p className="stl-dims">완성 크기: {dims}</p>
            {grid.clipped && <p className="stl-note">그림이 바닥판보다 커서 가장자리가 잘려요. 그림 크기를 줄이거나 바닥판을 키워 보세요.</p>}
            {noInk && <p className="stl-error">선을 찾지 못했어요. '선 찾기'를 오른쪽으로 옮기거나 '밝은 부분을 선으로 쓰기'를 켜 보세요.</p>}
            {tooMuchInk && <p className="stl-error">그림 거의 전체가 선이 됐어요. '선 찾기'를 왼쪽으로 옮겨 보세요.</p>}

            <div className="stl-controls">
              <SliderRow label="선 찾기" value={threshold} min={30} max={230} step={1} unit="" onChange={setThreshold} />
              <label className="stl-check">
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                밝은 부분을 선으로 쓰기
              </label>
              <SliderRow label="선 굵게" value={thicken} min={0} max={5} step={0.02} unit=" mm" onChange={setThicken} />
              <p className="stl-hint">선 양쪽에 이만큼씩 더해져요.</p>
              <SliderRow label="그림 크기(긴 쪽)" value={sizeMm} min={3} max={100} step={0.5} unit=" mm" onChange={setSizeMm} />
              <SliderRow label="선 높이" value={lineHeight} min={1} max={10} step={0.5} unit=" mm" onChange={setLineHeight} />
              <label className="stl-check">
                <input type="checkbox" checked={plate} onChange={(e) => setPlate(e.target.checked)} />
                바닥판 만들기
              </label>
              {plate && (
                <>
                  <SliderRow label="바닥판 가로" value={plateW} min={3} max={100} step={0.5} unit=" mm" onChange={setPlateW} />
                  <SliderRow label="바닥판 세로" value={plateH} min={3} max={100} step={0.5} unit=" mm" onChange={setPlateH} />
                  <SliderRow label="바닥판 두께" value={plateThickness} min={1} max={5} step={0.5} unit=" mm" onChange={setPlateThickness} />
                </>
              )}
              <label className="stl-row">
                <span className="stl-row-label">정밀도</span>
                <select value={resolution} onChange={(e) => setResolution(Number(e.target.value))}>
                  {RESOLUTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <button className="stl-download" onClick={handleDownload} disabled={noInk}>
              <Download size={18} /> STL 파일 저장하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
