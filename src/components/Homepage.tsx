import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Homepage() {
  const navigate = useNavigate();
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const shapeIntervalRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Detect mobile and count available shapes
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cycle through shape images in a loop
  useEffect(() => {
    shapeIntervalRef.current = setInterval(() => {
      setCurrentShapeIndex((prev) => {
        // Both mobile and desktop cycle through 5 shapes (0-4, which maps to shape1.png through shape5.png)
        return (prev + 1) % 5;
      });
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

          {/* Shape image - centered on both mobile and desktop */}
          <div className="absolute inset-0 flex items-center md:items-center justify-center z-0 pointer-events-none overflow-visible">
            <img
              src={isMobile ? `/mobile/shape${currentShapeIndex + 1}.png` : `/shapes/shape${currentShapeIndex + 1}.png`}
              alt="Shape"
              className="object-contain opacity-100 transition-opacity duration-500"
              style={{
                width: isMobile ? '100vw' : '90vw',
                height: isMobile ? 'auto' : '90vh',
              }}
            />
          </div>

          {/* Large text - mobile: left-aligned at bottom, desktop: 120px centered */}
          <div className="absolute inset-0 flex items-end md:items-center justify-start md:justify-center z-1 px-12 pb-16 md:pb-0 md:pt-0">
            <div className="text-left md:text-center max-w-4xl" style={{ color: '#232323' }}>
              <div className="font-serif text-[80px] md:text-[120px] 2xl:text-[180px] font-normal leading-none tracking-tight pointer-events-none">
                <em>draw anything*</em>
              </div>
              
              {/* Small text - mobile: below main text, desktop: at bottom */}
              <div 
                className="font-sans text-[16px] md:text-[16px] 2xl:text-[24px] mt-6 md:mt-0 pointer-events-auto"
                style={{ color: '#232323' }}
              >
                <span className="md:hidden">
                  *from <span 
                    className="underline cursor-pointer hover:opacity-70 transition-opacity"
                    style={{ textUnderlineOffset: '0.3em' }}
                    onClick={() => navigate('/draw')}
                  >
                    today's shape
                  </span> in 5 moves or less
                </span>
              </div>
            </div>
          </div>

          {/* Text at bottom - desktop only */}
          <div className="hidden md:block absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <div 
              className="font-sans text-[16px] 2xl:text-[24px] text-center"
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
