import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Homepage() {
  const navigate = useNavigate();
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
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
              src={`/shapes/shape${currentShapeIndex+1}.png`}
              alt="Shape"
              className="object-contain opacity-100 transition-opacity duration-500"
              style={{ width: '90vw', height: '90vh', transform: 'translateY(0%)' }}
            />
          </div>

          {/* Large centered text in EB Garamond */}
          <div className="absolute inset-0 flex items-center justify-center z-1">
            <div className="text-center max-w-4xl px-12" style={{ color: '#232323' }}>
              <div className="font-serif text-[120px] font-normal leading-none tracking-tight pointer-events-none">
                Draw <em>anything*</em>
              </div>
            </div>
          </div>

          {/* Large centered text in EB Garamond */}
          <div className="absolute inset-0 flex items-center justify-center z-1">
            <div className="text-center max-w-4xl px-12" style={{ color: '#232323' }}>
              <div className="font-serif text-[120px] font-normal leading-none tracking-tight pointer-events-none">
                Draw <em>anything*</em>
              </div>
            </div>
          </div>

          {/* Text at bottom */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <div 
              className="font-sans text-[16px] text-center"
              style={{ color: '#232323' }}
            >
              *from <span 
                className="underline cursor-pointer hover:opacity-70 transition-opacity"
                style={{ textUnderlineOffset: '0.3em' }}
                onClick={() => navigate('/draw')}
              >
                today's shape
              </span> in 5 moves or less
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
