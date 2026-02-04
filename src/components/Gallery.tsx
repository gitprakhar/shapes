import { useRef, useState, useEffect } from 'react';

const GAP = 40; // Gap between drawings
const DRAWING_DISPLAY_SIZE = 600; // Display size for each drawing
const DESKTOP_SHAPES_PER_ROW = 5; // Desktop shapes per row
const MOBILE_SHAPES_PER_ROW = 3;  // Mobile shapes per row
const DESKTOP_INITIAL_ZOOM_MAX = 1.6;
const DESKTOP_ZOOM_IN_FACTOR = 2.5;
const DESKTOP_BOTTOM_SPARE_ROWS = 0.1;
const MOBILE_INITIAL_ZOOM = 1;
const MOBILE_BOTTOM_SPARE_ROWS = 0.1;

interface Submission {
  id: string;
  imageData?: string;
  drawingPaths?: any[];
  svgString?: string;
  author: string;
  note: string;
  x: number;
  y: number;
}

interface GalleryProps {
  submissions: Submission[];
  onAddSubmission: (submission: Submission) => void;
  onNewDrawing: () => void;
}

export function Gallery({}: GalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const lastTouchDistanceRef = useRef<number | null>(null);
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastGestureScaleRef = useRef<number>(1);
  const isGestureActiveRef = useRef(false); // Track if Safari gesture is active to avoid double-handling
  const rafIdRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<{ zoom: number; offset: { x: number; y: number } } | null>(null);
  const wheelEndTimeoutRef = useRef<number | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Load all submissions from Supabase on mount and when submissions change
  useEffect(() => {
    // Detect mobile for responsive grid (3 per row on mobile)
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const loadSubmissions = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's daily_shape_id
        const { data: dailyShape, error: shapeError } = await supabase
          .from('daily_shapes')
          .select('id')
          .eq('date', today)
          .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
        
        if (shapeError) {
          setAllSubmissions([]);
          return;
        }
        
        // Load drawings - if daily shape exists, filter by it, otherwise show all recent drawings
        let drawings;
        let drawingsError;
        
        let shapeToUse = dailyShape;

        // If no shape for today, get the most recent shape
        if (!shapeToUse) {
          const { data: recentShape } = await supabase
            .from('daily_shapes')
            .select('id')
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

          shapeToUse = recentShape;
        }

        if (shapeToUse) {
          // Load all drawings for the shape
          const result = await supabase
            .from('user_drawings')
            .select('id, daily_shape_id, drawing_paths, created_at')
            .eq('daily_shape_id', shapeToUse.id)
            .order('created_at', { ascending: true });

          drawings = result.data;
          drawingsError = result.error;
        } else {
          // No shapes exist at all
          drawings = [];
          drawingsError = null;
        }
        
        if (drawingsError) {
          setAllSubmissions([]);
          return;
        }
        
        // Convert Supabase format to Submission format
        const submissions: Submission[] = (drawings || []).map((drawing: any) => {
          // Handle both possible structures: drawing_paths as object or direct properties
          const drawingPaths = typeof drawing.drawing_paths === 'object' && drawing.drawing_paths !== null
            ? drawing.drawing_paths
            : {};
          
          const submission = {
            id: drawing.id,
            svgString: drawingPaths.svgString,
            imageData: drawingPaths.imageData,
            drawingPaths: drawingPaths.drawingPaths,
            author: 'User', // Could be enhanced with user auth later
            note: '',
            x: 0,
            y: 0,
          };
          
          return submission;
        });
        
        setAllSubmissions(submissions);
        setIsLoading(false);
      } catch (error) {
        setAllSubmissions([]);
        setIsLoading(false);
      }
    };
    
    loadSubmissions();
    
    // Refresh every 5 seconds to get new submissions
    const interval = setInterval(() => {
      loadSubmissions();
    }, 5000);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);
  
  // Calculate time remaining until midnight
  useEffect(() => {
    const updateTimeRemaining = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0); // Next midnight
      
      const diff = midnight.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    };
    
    // Update immediately
    updateTimeRemaining();
    
    // Update every minute (since we're not showing seconds)
    const interval = setInterval(updateTimeRemaining, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Calculate grid layout: responsive shapes per row
  const shapesPerRow = isMobile ? MOBILE_SHAPES_PER_ROW : DESKTOP_SHAPES_PER_ROW;
  const numRows = Math.ceil(allSubmissions.length / shapesPerRow);
  const totalWidth = shapesPerRow * DRAWING_DISPLAY_SIZE + (shapesPerRow - 1) * GAP;
  const totalHeight = numRows * DRAWING_DISPLAY_SIZE + (numRows - 1) * GAP;

  // Handle panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      // Store the initial mouse position (absolute screen coordinates)
      panStartRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      // Calculate the delta from where we started dragging
      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;
      
      // Apply the delta to the current offset
      const currentOffset = offsetRef.current;
      const currentZoom = zoomRef.current;
      const newX = currentOffset.x + deltaX;
      const newY = currentOffset.y + deltaY;
      
      const nextOffset = { x: newX, y: newY };
      offsetRef.current = nextOffset;
      scheduleTransform(zoomRef.current, nextOffset);
      
      // Update panStart to current position for smooth continuous dragging
      panStartRef.current = { x: e.clientX, y: e.clientY };
      
      e.preventDefault();
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setZoom(zoomRef.current);
    setOffset(offsetRef.current);
  };

  const clampOffset = (
    off: { x: number; y: number },
    z: number,
    opts: { bottomPad?: number } = {}
  ) => {
    const scaledWidth = totalWidth * z;
    const scaledHeight = totalHeight * z;
    const maxX = 0;
    const minX = window.innerWidth - scaledWidth;
    const maxY = 0;
    const minY = window.innerHeight - scaledHeight - (opts.bottomPad ?? 0);
    const constrainedX = scaledWidth > window.innerWidth
      ? Math.max(minX, Math.min(maxX, off.x))
      : off.x;
    const constrainedY = scaledHeight > window.innerHeight
      ? Math.max(minY, Math.min(maxY, off.y))
      : off.y;
    return { x: constrainedX, y: constrainedY };
  };

  // Calculate initial zoom/offset
  useEffect(() => {
    if (allSubmissions.length > 0 && containerRef.current) {
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;

      if (isMobile) {
        const padding = 24;
        const availableWidth = containerWidth - padding * 2;
        const availableHeight = containerHeight - padding * 2;
        const fitWidthZoom = availableWidth / totalWidth;
        const fitRowHeightZoom = availableHeight / DRAWING_DISPLAY_SIZE;
        const initialZoom = Math.min(MOBILE_INITIAL_ZOOM, fitWidthZoom, fitRowHeightZoom, 1);
        const extraSpace = (DRAWING_DISPLAY_SIZE + GAP) * MOBILE_BOTTOM_SPARE_ROWS;
        const rawOffset = {
          x: (containerWidth - totalWidth * initialZoom) / 2,
          y: containerHeight - extraSpace - totalHeight * initialZoom,
        };

        const nextOffset = clampOffset(rawOffset, initialZoom, { bottomPad: extraSpace });
        setZoom(initialZoom);
        setOffset(nextOffset);
        return;
      }

      // Desktop: fit all shapes with some padding
      const padding = 80;
      const availableWidth = containerWidth - padding * 2;
      const availableHeight = containerHeight - padding * 2;

      const zoomX = availableWidth / totalWidth;
      const zoomY = availableHeight / totalHeight;
      const fitZoom = Math.min(zoomX, zoomY);
      const initialZoom = Math.min(fitZoom * DESKTOP_ZOOM_IN_FACTOR, DESKTOP_INITIAL_ZOOM_MAX);

      const extraSpace = (DRAWING_DISPLAY_SIZE + GAP) * DESKTOP_BOTTOM_SPARE_ROWS;
      const rawOffset = {
        x: (containerWidth - totalWidth * initialZoom) / 2,
        y: containerHeight - extraSpace - totalHeight * initialZoom,
      };
      const nextOffset = clampOffset(rawOffset, initialZoom, { bottomPad: extraSpace });
      setZoom(initialZoom);
      setOffset(nextOffset);
    }
  }, [allSubmissions.length, totalWidth, totalHeight, isMobile, shapesPerRow]);
  
  // Keep refs in sync with state
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const applyTransform = (z: number, off: { x: number; y: number }) => {
    const el = canvasRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${off.x}px, ${off.y}px, 0) scale(${z})`;
  };

  const scheduleTransform = (z: number, off: { x: number; y: number }) => {
    pendingTransformRef.current = { zoom: z, offset: off };
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        const pending = pendingTransformRef.current;
        if (pending) {
          applyTransform(pending.zoom, pending.offset);
        }
        rafIdRef.current = null;
      });
    }
  };

  useEffect(() => {
    applyTransform(zoom, offset);
  }, [zoom, offset]);

  // Prevent browser zoom and handle wheel/gesture events at document level
  // This ensures Safari can't intercept events on child elements (images)
  useEffect(() => {
    // Detect Safari (supports GestureEvent) to avoid double-handling pinch zoom
    const isSafari = 'GestureEvent' in window;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();

      // Skip wheel zoom entirely on Safari — gesture handler handles it
      if (isGestureActiveRef.current) return;

      if ((e.ctrlKey || e.metaKey) && !isSafari) {
        // Zoom towards cursor using multiplicative factor for smooth behavior
        const currentZoom = zoomRef.current;
        const currentOffset = offsetRef.current;
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Clamp deltaY to prevent large jumps on Chrome
        const clampedDelta = Math.max(-50, Math.min(50, e.deltaY));
        const zoomFactor = Math.exp(-clampedDelta * 0.01);
        const newZoom = Math.max(0.1, Math.min(2, currentZoom * zoomFactor));

        const canvasX = (mouseX - currentOffset.x) / currentZoom;
        const canvasY = (mouseY - currentOffset.y) / currentZoom;

        const newOffsetX = mouseX - canvasX * newZoom;
        const newOffsetY = mouseY - canvasY * newZoom;

        const nextOffset = { x: newOffsetX, y: newOffsetY };
        zoomRef.current = newZoom;
        offsetRef.current = nextOffset;
        scheduleTransform(newZoom, nextOffset);
      } else {
        // Pan
        const currentOffset = offsetRef.current;
        const newOffset = {
          x: currentOffset.x - e.deltaX,
          y: currentOffset.y - e.deltaY,
        };
        offsetRef.current = newOffset;
        scheduleTransform(zoomRef.current, newOffset);
      }

      if (wheelEndTimeoutRef.current !== null) {
        window.clearTimeout(wheelEndTimeoutRef.current);
      }
      wheelEndTimeoutRef.current = window.setTimeout(() => {
        setZoom(zoomRef.current);
        setOffset(offsetRef.current);
      }, 120);
    };

    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      isGestureActiveRef.current = true;
      const gestureEvent = e as any;
      if (gestureEvent.scale !== undefined) {
        lastGestureScaleRef.current = gestureEvent.scale;
      }
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();

      const gestureEvent = e as any;
      if (gestureEvent.scale === undefined) return;

      const currentScale = gestureEvent.scale;
      const scaleDelta = currentScale / lastGestureScaleRef.current;
      const currentZoom = zoomRef.current;
      const currentOffset = offsetRef.current;
      const newZoom = Math.max(0.1, Math.min(2, currentZoom * scaleDelta));

      const gestureX = gestureEvent.clientX !== undefined ? gestureEvent.clientX : window.innerWidth / 2;
      const gestureY = gestureEvent.clientY !== undefined ? gestureEvent.clientY : window.innerHeight / 2;

      const canvasX = (gestureX - currentOffset.x) / currentZoom;
      const canvasY = (gestureY - currentOffset.y) / currentZoom;

      const newOffsetX = gestureX - canvasX * newZoom;
      const newOffsetY = gestureY - canvasY * newZoom;

      zoomRef.current = newZoom;
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      lastGestureScaleRef.current = currentScale;

      scheduleTransform(newZoom, { x: newOffsetX, y: newOffsetY });
    };

    const handleGestureEnd = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      isGestureActiveRef.current = false;
      lastGestureScaleRef.current = 1;
      // Sync state once at end of gesture to avoid re-render jitter mid-gesture
      setZoom(zoomRef.current);
      setOffset(offsetRef.current);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    document.addEventListener('wheel', handleWheelEvent, { passive: false });
    document.addEventListener('touchstart', preventTouchZoom, { passive: false });
    document.addEventListener('touchmove', preventTouchZoom, { passive: false });
    document.addEventListener('gesturestart', handleGestureStart, { passive: false });
    document.addEventListener('gesturechange', handleGestureChange, { passive: false });
    document.addEventListener('gestureend', handleGestureEnd, { passive: false });

    return () => {
      document.removeEventListener('wheel', handleWheelEvent);
      document.removeEventListener('touchstart', preventTouchZoom);
      document.removeEventListener('touchmove', preventTouchZoom);
      document.removeEventListener('gesturestart', handleGestureStart);
      document.removeEventListener('gesturechange', handleGestureChange);
      document.removeEventListener('gestureend', handleGestureEnd);
    };
  }, []);


  // Touch handlers for mobile pinch-to-zoom and two-finger pan
  const getTouchDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));

  const getTouchCenter = (t1: React.Touch, t2: React.Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      lastTouchDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
      lastTouchCenterRef.current = getTouchCenter(e.touches[0], e.touches[1]);
    } else if (e.touches.length === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();

      if (lastTouchDistanceRef.current === null || lastTouchCenterRef.current === null) {
        lastTouchDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        lastTouchCenterRef.current = getTouchCenter(e.touches[0], e.touches[1]);
        return;
      }

      const center = getTouchCenter(e.touches[0], e.touches[1]);
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const prevCenter = lastTouchCenterRef.current;
      const prevDistance = lastTouchDistanceRef.current;
      const currentZoom = zoomRef.current;
      const currentOffset = offsetRef.current;

      // Ratio-based zoom
      const newZoom = Math.max(0.1, Math.min(2, currentZoom * (distance / prevDistance)));

      // Transform: translate(offset) scale(zoom), origin top-left
      // screenX = offset.x + cx * zoom
      // cx = (screenX - offset.x) / zoom
      const canvasX = (prevCenter.x - currentOffset.x) / currentZoom;
      const canvasY = (prevCenter.y - currentOffset.y) / currentZoom;

      // New offset: same canvas point under new center at new zoom
      const newOffsetX = center.x - canvasX * newZoom;
      const newOffsetY = center.y - canvasY * newZoom;

      zoomRef.current = newZoom;
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;

      scheduleTransform(newZoom, { x: newOffsetX, y: newOffsetY });
    } else if (e.touches.length === 1 && isPanning) {
      const deltaX = e.touches[0].clientX - panStartRef.current.x;
      const deltaY = e.touches[0].clientY - panStartRef.current.y;

      const currentOffset = offsetRef.current;
      const nextOffset = { x: currentOffset.x + deltaX, y: currentOffset.y + deltaY };
      offsetRef.current = nextOffset;
      scheduleTransform(zoomRef.current, nextOffset);
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    lastTouchDistanceRef.current = null;
    lastTouchCenterRef.current = null;
    setZoom(zoomRef.current);
    setOffset(offsetRef.current);
  };

  return (
    <div
      ref={containerRef}
      className="gallery-container relative w-full h-screen overflow-hidden"
      style={{
        cursor: isPanning ? 'grabbing' : 'grab',
        backgroundColor: '#F1F1F1',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Countdown timer in top right */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
        }}
      >
        <div 
          className="text-[14px] 2xl:text-[21px]"
          style={{ 
          color: '#232323', 
          fontFamily: 'var(--font-sans)',
          fontWeight: 'normal',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span>Next shape in</span>
          <span style={{ letterSpacing: '1px' }}>{timeRemaining}</span>
        </div>
      </div>
      
      {/* Dot grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      
      {/* Render all drawings as SVGs */}
      {!isLoading && allSubmissions.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center" style={{ color: '#232323' }}>
            <div className="font-sans text-[24px] 2xl:text-[36px] mb-2">No drawings yet</div>
            <div className="font-sans text-[14px] 2xl:text-[21px]">Submit a drawing to see it here</div>
          </div>
        </div>
      ) : !isLoading ? (
        <div
          ref={canvasRef}
          className="absolute"
          style={{
            width: `${totalWidth}px`,
            height: `${totalHeight}px`,
            left: 0,
            top: 0,
            transformOrigin: 'top left',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        >
          {allSubmissions.map((submission, index) => {
            // Calculate row and column position (responsive: 3 per row on mobile, 5 on desktop)
            const row = Math.floor(index / shapesPerRow);
            const col = index % shapesPerRow;
            const x = col * (DRAWING_DISPLAY_SIZE + GAP);
            const y = row * (DRAWING_DISPLAY_SIZE + GAP);
            
            // Prefer SVG string if available (new format)
            if (submission.svgString) {
              // SVG is saved at 500x500, scale up to display size (600px)
              const svgSize = 500;
              const scale = DRAWING_DISPLAY_SIZE / svgSize;
              
              return (
                <div
                  key={submission.id}
                  style={{
                    position: 'absolute',
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${DRAWING_DISPLAY_SIZE}px`,
                    height: `${DRAWING_DISPLAY_SIZE}px`,
                    overflow: 'hidden',
                  }}
                >
                  {/* Rectangle background */}
                  <div
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#F8F8F8',
                      zIndex: 0,
                    }}
                  />
                  {/* SVG content - scaled up */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      width: `${svgSize}px`,
                      height: `${svgSize}px`,
                    }}
                    dangerouslySetInnerHTML={{ __html: submission.svgString }}
                  />
                </div>
              );
            }
            
            // Fallback to imageData for old submissions
            if (submission.imageData) {
              return (
                <div
                  key={submission.id}
                  style={{
                    position: 'absolute',
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${DRAWING_DISPLAY_SIZE}px`,
                    height: `${DRAWING_DISPLAY_SIZE}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Rectangle background */}
                  <div
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#F8F8F8',
                      zIndex: 0,
                    }}
                  />
                  {/* Image content */}
                  <img
                    src={submission.imageData}
                    alt={`Drawing ${index + 1}`}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              );
            }
            
            return null;
          })}
        </div>
      ) : null}
    </div>
  );
}
