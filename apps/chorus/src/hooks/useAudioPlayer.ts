import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single-track audio player hook — shared by YouTube Music and Spotify
 * previews (DRY). `load(track)` starts playback of a new source.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // One shared <audio> element for the hook's lifetime.
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, []);

  const load = useCallback(
    (id: string, src: string, autoplay = true) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (currentId === id) {
        if (audio.paused) void audio.play();
        else audio.pause();
        return;
      }
      audio.src = src;
      audio.load();
      setCurrentId(id);
      setPosition(0);
      if (autoplay) void audio.play().catch(() => setPlaying(false));
    },
    [currentId],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentId) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  }, [currentId]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && isFinite(seconds)) audio.currentTime = seconds;
  }, []);

  return { currentId, playing, position, duration, load, toggle, seek };
}

/** "83" → "1:23" */
export function fmtTime(total?: number) {
  if (!total || !isFinite(total)) return "0:00";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
