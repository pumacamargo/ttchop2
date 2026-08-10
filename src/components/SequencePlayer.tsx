import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface SequencePlayerProps {
  bRollUrls: string[];
  audioUrl: string;
  isPlaying?: boolean;
}

export const SequencePlayer: React.FC<SequencePlayerProps> = ({
  bRollUrls,
  audioUrl,
  isPlaying: autoPlay = false,
}) => {
  const [currentVideoIdx, setCurrentVideoIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Restart sequence if video list changes
  useEffect(() => {
    setCurrentVideoIdx(0);
    setVideoProgress(0);
  }, [bRollUrls]);

  // Sync play/pause between video and audio
  useEffect(() => {
    if (isPlaying) {
      videoRef.current?.play().catch(() => {});
      audioRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
      audioRef.current?.pause();
    }
  }, [isPlaying, currentVideoIdx]);

  // Handle video end: loop to next B-roll
  const handleVideoEnded = () => {
    if (bRollUrls.length === 0) return;
    const nextIdx = (currentVideoIdx + 1) % bRollUrls.length;
    setCurrentVideoIdx(nextIdx);
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentVideoIdx(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
    if (audioRef.current) audioRef.current.currentTime = 0;
    setIsPlaying(true);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 1;
      setVideoProgress((current / dur) * 100);
    }
  };

  if (bRollUrls.length === 0) {
    return (
      <div style={{
        aspectRatio: '9/16',
        background: '#111',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        border: '1px dashed rgba(255,255,255,0.1)'
      }}>
        No B-Roll clip selected
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '9/16',
      borderRadius: '16px',
      overflow: 'hidden',
      background: '#000',
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--border)'
    }}>
      {/* Background Audio */}
      <audio
        ref={audioRef}
        src={audioUrl}
        loop
        muted={isMuted}
        onEnded={() => {
          // Restart loop if audio ends
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
      />

      {/* Main Video Element playing active B-roll */}
      <video
        ref={videoRef}
        src={bRollUrls[currentVideoIdx]}
        playsInline
        muted // Video stream is always muted to favor the Master voiceover
        onEnded={handleVideoEnded}
        onTimeUpdate={handleTimeUpdate}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />

      {/* Control Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.4) 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1rem',
        pointerEvents: 'none'
      }}>
        {/* Top bar info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(0,0,0,0.6)',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: '600',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            Playing B-Roll {currentVideoIdx + 1}/{bRollUrls.length}
          </div>
          
          <button
            onClick={toggleMute}
            style={{
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        {/* Center Play Button Overlay (Big screen tap) */}
        <div 
          onClick={togglePlay}
          style={{
            alignSelf: 'center',
            background: 'rgba(99, 102, 241, 0.85)',
            borderRadius: '50%',
            width: '64px',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            pointerEvents: 'auto',
            boxShadow: '0 0 20px rgba(99,102,241,0.4)',
            transition: 'all 0.2s ease',
            opacity: isPlaying ? 0.3 : 1
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = isPlaying ? '0.3' : '1'; }}
        >
          {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
        </div>

        {/* Bottom controls & timelines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'auto' }}>
          {/* Multi-clip Mini Progress Bar */}
          <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
            {bRollUrls.map((_, idx) => (
              <div 
                key={idx}
                style={{
                  height: '4px',
                  flex: 1,
                  background: idx < currentVideoIdx 
                    ? 'var(--primary)' 
                    : idx === currentVideoIdx 
                      ? 'rgba(255,255,255,0.3)' 
                      : 'rgba(255,255,255,0.1)',
                  borderRadius: '2px',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {idx === currentVideoIdx && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${videoProgress}%`,
                    backgroundColor: 'var(--primary)',
                    transition: 'width 0.1s linear'
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* Buttons bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: '500' }}>
              UGC Preview
            </span>
            <button
              onClick={handleRestart}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: '500'
              }}
            >
              <RotateCcw size={12} /> Restart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
