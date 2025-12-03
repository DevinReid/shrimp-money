'use client';

import { useEffect, useState, useRef } from 'react';
import { useLoading } from './LoadingContext';
import './CursorSpinner.css';

export default function CursorSpinner() {
  const { loading } = useLoading();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    if (loading) {
      document.body.classList.add('loading-cursor-active');
      window.addEventListener('mousemove', handleMouseMove);
      
      // Create canvas for custom cursor
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      canvasRef.current = canvas;
      
      let rotation = 0;
      let hue = 0;
      
      const updateCursor = () => {
        ctx.clearRect(0, 0, 48, 48);
        ctx.save();
        ctx.translate(24, 24);
        ctx.rotate((rotation * Math.PI) / 180);
        
        // Apply rainbow color filter
        ctx.filter = `hue-rotate(${hue}deg) saturate(1.3) brightness(1.2)`;
        
        // Draw shrimp emoji
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦐', 0, 0);
        
        ctx.restore();
        
        rotation = (rotation + 6) % 360;
        hue = (hue + 2) % 360;
        
        // Update cursor (throttle to reduce overhead)
        if (rotation % 6 === 0) {
          const dataURL = canvas.toDataURL('image/png');
          document.body.style.cursor = `url(${dataURL}) 24 24, wait`;
        }
        
        animationFrameRef.current = requestAnimationFrame(updateCursor);
      };
      
      animationFrameRef.current = requestAnimationFrame(updateCursor);
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        document.body.classList.remove('loading-cursor-active');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove);
      };
    } else {
      document.body.classList.remove('loading-cursor-active');
      document.body.style.cursor = '';
    }
  }, [loading]);

  if (!loading) return null;

  return (
    <>
      <div 
        className="cursor-spinner-follower"
        style={{
          left: `${mousePosition.x}px`,
          top: `${mousePosition.y}px`,
        }}
      >
        <span className="shrimp-emoji-rainbow">🦐</span>
      </div>
      <div className="cursor-spinner-overlay">
        <div className="cursor-spinner-visual">
          <span className="shrimp-emoji-rainbow">🦐</span>
        </div>
      </div>
    </>
  );
}

