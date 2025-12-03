'use client';

import { useEffect, useState } from 'react';
import './BackgroundEmojis.css';

export default function BackgroundEmojis() {
  const [emojis, setEmojis] = useState([]);

  useEffect(() => {
    // Detect mobile/iOS devices for performance optimization
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     (typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    
    // Reduce emoji count on mobile to prevent performance issues (30 -> 8 to keep vibe)
    const emojiCount = isMobile ? 8 : 30;
    
    // Create array of emoji objects with random properties
    const emojiTypes = ['🦐', '⭐', '✨'];
    const newEmojis = Array.from({ length: emojiCount }, (_, i) => ({
      id: i,
      emoji: emojiTypes[Math.floor(Math.random() * emojiTypes.length)],
      left: Math.random() * 100, // Random starting position (0-100%)
      delay: Math.random() * 20, // Random delay (0-20s)
      duration: 15 + Math.random() * 20, // Random duration (15-35s)
      size: 40 + Math.random() * 60, // Random size (40-100px) - doubled!
    }));

    setEmojis(newEmojis);
  }, []);

  return (
    <div className="background-emojis">
      {emojis.map((emoji) => (
        <span
          key={emoji.id}
          className="floating-emoji"
          style={{
            left: '0%', // Always start from left edge
            animationDelay: `${emoji.delay}s`,
            animationDuration: `${emoji.duration}s`,
            fontSize: `${emoji.size}px`,
          }}
        >
          {emoji.emoji}
          {/* Trailing dots - only show on desktop to keep performance good on mobile */}
          <span className="trail-dot trail-dot-1"></span>
          <span className="trail-dot trail-dot-2"></span>
          <span className="trail-dot trail-dot-3"></span>
          <span className="trail-dot trail-dot-4"></span>
          <span className="trail-dot trail-dot-5"></span>
        </span>
      ))}
    </div>
  );
}

