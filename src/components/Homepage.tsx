import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Homepage() {
  const navigate = useNavigate();
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const shapeIntervalRef = useRef<number | null>(null);
  const TOTAL_SHAPES = 5;

  // Cycle through shape images in a loop
  useEffect(() => {
    shapeIntervalRef.current = setInterval(() => {
      setCurrentShapeIndex((prev) => (prev + 1) % TOTAL_SHAPES);
    }, 600); // Change image every 0.6 seconds

    return () => {
      if (shapeIntervalRef.current) {
        clearInterval(shapeIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: '#F1F1F1' }}>
      {/* Single infinite canvas container - 400vh tall (200vh for homepage + 200vh for drawing) */}
      <div
        className="absolute"
        style={{
          width: '100vh',
          height: '400vh',
          left: 0,
          top: 0,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: isTransitioning ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: isTransitioning ? 'transform' : 'auto',
        }}
      >
        {/* Homepage section - positioned at y: 0 */}
        <div 
          className="absolute w-screen h-screen"
          style={{ 
            backgroundColor: '#F1F1F1',
            left: 0,
            top: 0,
          }}
        >
          {/* Grid dots background on homepage */}
          <div
            className="absolute pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              width: '100%',
              height: '100%',
              zIndex: 0,
            }}
          />

          {/* Shape image behind text - cycling through images */}
          <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none overflow-visible">
            <img
              src={`/shapes/shape${currentShapeIndex + 1}.png`}
              alt="Shape"
              className="object-contain opacity-100 transition-opacity duration-500"
              style={{ width: '100vw', height: '100vh', transform: 'translateY(0%)' }}
            />
          </div>

          {/* Large centered text in EB Garamond */}
          <div className="absolute inset-0 flex items-center justify-center z-1">
            <div className="text-center max-w-4xl px-12" style={{ color: '#232323' }}>
              <div className="font-serif text-[120px] font-normal leading-none tracking-tight pointer-events-none">
                Draw anything*
              </div>
              <div 
                className="font-sans text-[16px] block mt-6 pointer-events-none"
                style={{ color: '#232323' }}
              >
                *with today's shape
              </div>
            </div>
          </div>

          {/* Primary button at bottom */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <Button
              variant="secondary"
              size="lg"
              onClick={(e) => {
                e.preventDefault();
                // Stop the image cycling
                if (shapeIntervalRef.current) {
                  clearInterval(shapeIntervalRef.current);
                  shapeIntervalRef.current = null;
                }
                setIsTransitioning(true);
                
                // Animate offset to pan to drawing area (200vh upwards)
                // Drawing area is positioned at top: '200vh', so we need to pan by -200vh
                const viewportHeight = window.innerHeight;
                const targetOffsetY = -viewportHeight * 2; // -200vh (200vh in pixels)
                
                // Smooth parallax-like transition over 1200ms
                const startTime = Date.now();
                const duration = 1200;
                const startOffsetY = offset.y;
                
                const animate = () => {
                  const elapsed = Date.now() - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  
                  // Smooth ease-out cubic bezier for parallax effect
                  // Using a more refined easing: easeOutCubic
                  const ease = 1 - Math.pow(1 - progress, 3);
                  
                  const currentOffsetY = startOffsetY + (targetOffsetY - startOffsetY) * ease;
                  setOffset({ x: 0, y: currentOffsetY });
                  
                  if (progress < 1) {
                    requestAnimationFrame(animate);
                  } else {
                    setIsTransitioning(false);
                    // Navigate to drawing page after animation completes
                    navigate('/draw');
                  }
                };
                
                requestAnimationFrame(animate);
              }}
            >
              Start Drawing
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
