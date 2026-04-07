import { useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
  onSuccess: (matchId: string) => void;
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function UploadModal({ onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith('video/') && !f.name.match(/\.(mp4|mov|avi|mkv)$/i)) {
      setError('Please select a video file (.mp4, .mov, .avi, .mkv)');
      return;
    }
    setFile(f);
    setError('');
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleUpload = () => {
    if (!file || !title.trim()) return;
    setState('uploading');
    setProgress(0);
    setError('');

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', title.trim());
    formData.append('userId', profile?.uid ?? 'anonymous');

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setState('done');
        setTimeout(() => onSuccess(data.matchId), 800);
      } else {
        setState('error');
        setError('Upload failed — check that the API is running.');
      }
    });

    xhr.addEventListener('error', () => {
      setState('error');
      setError('Network error — check that the API is running on port 4000.');
    });

    xhr.open('POST', '/api/matches/upload');
    xhr.send(formData);
  };

  const cancel = () => {
    xhrRef.current?.abort();
    onClose();
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(0) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(9,9,10,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && state !== 'uploading' && onClose()}>

      <div className="w-full max-w-md fade-up" style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Upload match video</h2>
          {state !== 'uploading' && (
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => state === 'idle' && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className="rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center py-8 cursor-pointer"
            style={{
              borderColor: dragging ? 'var(--cyan)' : file ? 'rgba(74,222,128,0.4)' : 'var(--border-2)',
              background: dragging ? 'var(--cyan-glow)' : file ? 'rgba(74,222,128,0.04)' : 'var(--bg-2)',
            }}
          >
            {file ? (
              <>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.25)' }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9l4.5 4.5L15 5" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{file.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{fileSizeMB} MB</p>
                {state === 'idle' && (
                  <button onClick={e => { e.stopPropagation(); setFile(null); setTitle(''); }}
                    className="text-xs mt-2 transition-colors" style={{ color: 'var(--text-3)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                    Remove
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 12V4M9 4L6 7M9 4l3 3" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 13v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Drop video here or click to browse</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>MP4, MOV, AVI, MKV — up to 8 GB</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="video/*,.mp4,.mov,.avi,.mkv"
            className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

          {/* Title */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Match title <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Final — Tomer vs Juan — Apr 2026"
              disabled={state === 'uploading'}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all disabled:opacity-50"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              onFocus={e => e.target.style.borderColor = 'rgba(184,255,64,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Progress */}
          {state === 'uploading' && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: 'var(--text-3)' }}>Uploading…</span>
                <span className="mono" style={{ color: 'var(--cyan)' }}>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: 'var(--cyan)', boxShadow: '0 0 8px rgba(184,255,64,0.4)' }} />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                Detection will start automatically after upload completes.
              </p>
            </div>
          )}

          {state === 'done' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
              style={{ background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', color: 'var(--green)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Upload complete — detection starting…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
              style={{ background: 'rgba(255,61,87,0.08)', border: '1px solid rgba(255,61,87,0.2)', color: 'var(--red)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm0 4.5a.5.5 0 01.5.5v2a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm0-2a.75.75 0 110 1.5.75.75 0 010-1.5z"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={cancel} disabled={state === 'done'}
            className="btn-ghost px-4 py-2 text-sm disabled:opacity-40">
            {state === 'uploading' ? 'Cancel' : 'Close'}
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || !title.trim() || state === 'uploading' || state === 'done'}
            className="btn-cyan px-5 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'uploading' ? `Uploading ${progress}%…` : 'Upload & detect'}
          </button>
        </div>
      </div>
    </div>
  );
}
