'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YtPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YtPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allow: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

type State = 'idle' | 'playing' | 'paused' | 'ended';

export interface YouTubePlayerProps {
  videoId: string;
  host?: string;
  poster?: string | null;
  title?: string;
  startAt?: number;
  onProgress?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
}

/**
 * 隱藏來源的 YouTube 播放器：
 * - iframe 設 pointer-events:none，所有操作走自製控制列，YouTube 的標題／頻道／標誌／相關影片點不到
 * - 未播放、暫停、結束時以不透明遮罩＋自家海報蓋住 YouTube 介面
 * - controls=0、rel=0、iv_load_policy=3、disablekb=1、nocookie 網域、封鎖右鍵
 * 限制：DevTools 仍可在 iframe src 看到影片 ID，這是平台天性；要完全隱藏請用自架（bunny）。
 */
export function YouTubePlayer({ videoId, host = 'https://www.youtube-nocookie.com', poster = null, title = '', startAt = 0, onProgress, onEnded }: YouTubePlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const cbRef = useRef({ onProgress, onEnded });
  cbRef.current = { onProgress, onEnded };
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadApi().then(() => {
      if (disposed || !hostRef.current || !window.YT) return;
      const mount = document.createElement('div');
      hostRef.current.innerHTML = '';
      hostRef.current.appendChild(mount);
      playerRef.current = new window.YT.Player(mount, {
        host,
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { controls: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, disablekb: 1, fs: 0, origin: window.location.origin, start: Math.floor(startAt) },
        events: {
          onReady: (e: { target: YtPlayer }) => {
            setReady(true);
            setDur(e.target.getDuration());
          },
          onStateChange: (e: { data: number }) => {
            const S = window.YT!.PlayerState;
            if (e.data === S.PLAYING || e.data === S.BUFFERING) setState('playing');
            else if (e.data === S.PAUSED) setState('paused');
            else if (e.data === S.ENDED) {
              setState('ended');
              cbRef.current.onEnded?.();
            }
          },
        },
      });
    });
    return () => {
      disposed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId, host, startAt]);

  useEffect(() => {
    if (state !== 'playing') return;
    let tick = 0;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const cur = p.getCurrentTime();
      const d = p.getDuration();
      setT(cur);
      setDur(d);
      if (++tick % 10 === 0) cbRef.current.onProgress?.(cur, d);
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
    const p = playerRef.current;
    if (p) cbRef.current.onProgress?.(p.getCurrentTime(), p.getDuration());
  }, []);
  const toggle = () => (state === 'playing' ? pause() : play());
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    playerRef.current?.seekTo(ratio * dur, true);
    setT(ratio * dur);
  };
  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  };
  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const covered = state !== 'playing';
  return (
    <div ref={wrapRef} className="relative aspect-video w-full select-none overflow-hidden rounded-lg bg-black [&_iframe]:pointer-events-none" onContextMenu={(e) => e.preventDefault()}>
      <div ref={hostRef} className="absolute inset-0" />
      {covered ? (
        <button type="button" onClick={play} disabled={!ready} className="absolute inset-0 flex items-center justify-center bg-black text-white">
          {poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : null}
          <span className="relative rounded-full bg-white/90 px-6 py-3 text-sm font-bold text-black">{!ready ? '載入中…' : state === 'ended' ? '重新播放' : state === 'paused' ? '繼續播放' : '播放'}</span>
          {title ? <span className="absolute bottom-12 left-3 rounded bg-black/60 px-2 py-1 text-xs">{title}</span> : null}
        </button>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-xs text-white">
        <button type="button" onClick={toggle} disabled={!ready} className="rounded bg-white/20 px-2 py-1">
          {state === 'playing' ? '暫停' : '播放'}
        </button>
        <span className="tabular-nums">{fmt(t)}</span>
        <div className="relative h-2 flex-1 cursor-pointer rounded bg-white/30" onClick={seek}>
          <div className="absolute inset-y-0 left-0 rounded bg-white" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
        </div>
        <span className="tabular-nums">{fmt(dur)}</span>
        <button type="button" onClick={toggleMute} className="rounded bg-white/20 px-2 py-1">
          {muted ? '取消靜音' : '靜音'}
        </button>
        <button type="button" onClick={fullscreen} className="rounded bg-white/20 px-2 py-1">
          全螢幕
        </button>
      </div>
    </div>
  );
}
