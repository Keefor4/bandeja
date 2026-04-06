import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
}

interface Props {
  src: string;
  startTime: number;
  endTime: number;
  onTimeUpdate?: (time: number) => void;
  autoPlay?: boolean;
  className?: string;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(
  ({ src, startTime, endTime, onTimeUpdate, autoPlay = true, className }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
      play: () => videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      togglePlay: () => {
        const v = videoRef.current;
        if (!v) return;
        v.paused ? v.play() : v.pause();
      },
      seek: (delta: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.min(endTime, Math.max(startTime, v.currentTime + delta));
      },
      seekTo: (time: number) => {
        const v = videoRef.current;
        if (v) v.currentTime = time;
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    }));

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = startTime;
      if (autoPlay) v.play().catch(() => {});
    }, [src, startTime, autoPlay]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const handleTime = () => {
        if (v.currentTime >= endTime) {
          v.pause();
          v.currentTime = startTime;
        }
        onTimeUpdate?.(v.currentTime);
      };
      v.addEventListener('timeupdate', handleTime);
      return () => v.removeEventListener('timeupdate', handleTime);
    }, [startTime, endTime, onTimeUpdate]);

    return (
      <video
        ref={videoRef}
        src={src}
        className={className}
        controls={false}
        playsInline
        preload="auto"
      />
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
export default VideoPlayer;
