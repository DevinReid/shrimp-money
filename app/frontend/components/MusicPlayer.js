'use client';

import { useState, useEffect, useRef } from 'react';
import './MusicPlayer.css';

export default function MusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);

  // Load saved preferences and attempt autoplay
  useEffect(() => {
    const savedVolume = localStorage.getItem('musicVolume');
    const savedPlaying = localStorage.getItem('musicPlaying');
    
    if (savedVolume !== null) {
      setVolume(parseFloat(savedVolume));
    }
    
    if (audioRef.current) {
      audioRef.current.volume = savedVolume !== null ? parseFloat(savedVolume) : 0.5;
      
      // Try to autoplay on page load
      const attemptAutoplay = async () => {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
          localStorage.setItem('musicPlaying', 'true');
        } catch (error) {
          // Autoplay blocked - try again after user interaction
          console.log('Autoplay blocked, will try after user interaction');
          setIsPlaying(false);
          
          // Listen for first user interaction to enable autoplay
          const enableAutoplay = async () => {
            try {
              await audioRef.current.play();
              setIsPlaying(true);
              localStorage.setItem('musicPlaying', 'true');
            } catch (e) {
              // Still blocked, user will need to click play button
            }
            // Remove listeners after first attempt
            document.removeEventListener('click', enableAutoplay);
            document.removeEventListener('touchstart', enableAutoplay);
            document.removeEventListener('keydown', enableAutoplay);
          };
          
          document.addEventListener('click', enableAutoplay, { once: true });
          document.addEventListener('touchstart', enableAutoplay, { once: true });
          document.addEventListener('keydown', enableAutoplay, { once: true });
        }
      };
      
      // Try autoplay after a short delay to ensure audio is loaded
      setTimeout(attemptAutoplay, 500);
    }
  }, []);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      localStorage.setItem('musicVolume', volume.toString());
    }
  }, [volume, isMuted]);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        localStorage.setItem('musicPlaying', 'false');
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
        localStorage.setItem('musicPlaying', 'true');
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  // Handle audio ended (loop)
  const handleEnded = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  return (
    <div className="music-player">
      <audio
        ref={audioRef}
        loop
        onEnded={handleEnded}
        preload="auto"
        autoPlay
      >
        {/* Shrimp and Money theme song */}
        <source src="/music/Shrimp and Money.mp3" type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
      
      <button 
        className="music-toggle-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause music' : 'Play music'}
      >
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      
      <div className="music-controls">
        <button 
          className="music-mute-btn"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? '🔇' : '🔊'}
        </button>
        
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="music-volume-slider"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}

