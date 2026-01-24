import { useRef, useState, useEffect } from 'react';

const GAP = 40; // Gap between drawings
const DRAWING_DISPLAY_SIZE = 600; // Display size for each drawing
const SHAPES_PER_ROW = 5; // Number of shapes per row before wrapping

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

export function Gallery({ submissions: propSubmissions }: GalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const lastTouchDistanceRef = useRef<number | null>(null);
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>(propSubmissions);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Load all submissions from Supabase on mount and when submissions change
  useEffect(() => {
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
          console.error('Error fetching daily shape:', shapeError);
          console.error('Shape error details:', JSON.stringify(shapeError, null, 2));
          setAllSubmissions([]);
          return;
        }
        
        // Load drawings - if daily shape exists, filter by it, otherwise show all recent drawings
        let drawings;
        let drawingsError;
        
        if (dailyShape) {
          console.log('Daily shape ID:', dailyShape.id);
          console.log('Daily shape ID type:', typeof dailyShape.id);
          
          // Load all drawings for today's shape
          const result = await supabase
            .from('user_drawings')
            .select('id, daily_shape_id, drawing_paths, created_at')
            .eq('daily_shape_id', dailyShape.id)
            .order('created_at', { ascending: true });
          
          drawings = result.data;
          drawingsError = result.error;
        } else {
          console.warn('No daily shape found for today, loading all recent drawings');
          
          // Load all recent drawings if no daily shape exists
          const result = await supabase
            .from('user_drawings')
            .select('id, daily_shape_id, drawing_paths, created_at')
            .order('created_at', { ascending: false })
            .limit(100); // Limit to most recent 100 drawings
          
          drawings = result.data;
          drawingsError = result.error;
        }
        
        if (drawingsError) {
          console.error('Error loading drawings:', drawingsError);
          console.error('Drawings error details:', JSON.stringify(drawingsError, null, 2));
          setAllSubmissions([]);
          return;
        }
        
        console.log('Loaded drawings from Supabase:', drawings);
        console.log('Number of drawings found:', drawings?.length || 0);
        
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
          
          console.log('Processed submission:', { id: submission.id, hasSvgString: !!submission.svgString, hasImageData: !!submission.imageData });
          
          return submission;
        });
        
        console.log('Final submissions array:', submissions);
        setAllSubmissions(submissions);
      } catch (error) {
        console.error('Failed to load submissions from Supabase:', error);
        setAllSubmissions([]);
      }
    };
    
    loadSubmissions();
    
    // Refresh every 5 seconds to get new submissions
    const interval = setInterval(() => {
      loadSubmissions();
    }, 5000);
    
    return () => clearInterval(interval);
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

  // Update when propSubmissions change (new submission added)
  useEffect(() => {
    if (propSubmissions.length > 0) {
      setAllSubmissions(propSubmissions);
    }
  }, [propSubmissions]);

  // Calculate grid layout: 5 shapes per row
  const numRows = Math.ceil(allSubmissions.length / SHAPES_PER_ROW);
  const totalWidth = SHAPES_PER_ROW * DRAWING_DISPLAY_SIZE + (SHAPES_PER_ROW - 1) * GAP;
  const totalHeight = numRows * DRAWING_DISPLAY_SIZE + (numRows - 1) * GAP;

  // Handle panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      // Store the initial mouse position (absolute screen coordinates)
      setPanStart({
        x: e.clientX,
        y: e.clientY,
      });
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      // Calculate the delta from where we started dragging
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      
      // Apply the delta to the current offset
      const newX = offset.x + deltaX;
      const newY = offset.y + deltaY;
      
      // Constrain panning to canvas bounds (accounting for zoom)
      const scaledWidth = totalWidth * zoom;
      const scaledHeight = totalHeight * zoom;
      const maxX = 0; // Can't pan right beyond left edge
      const minX = window.innerWidth - scaledWidth; // Can't pan left beyond right edge
      const maxY = 0; // Can't pan down beyond top edge
      const minY = window.innerHeight - scaledHeight; // Can't pan up beyond bottom edge
      
      // Only constrain if canvas is larger than viewport
      const constrainedX = scaledWidth > window.innerWidth 
        ? Math.max(minX, Math.min(maxX, newX))
        : newX;
      const constrainedY = scaledHeight > window.innerHeight
        ? Math.max(minY, Math.min(maxY, newY))
        : newY;
      
      setOffset({
        x: constrainedX,
        y: constrainedY,
      });
      
      // Update panStart to current position for smooth continuous dragging
      setPanStart({
        x: e.clientX,
        y: e.clientY,
      });
      
      e.preventDefault();
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Calculate initial zoom to fit all shapes in viewport
  useEffect(() => {
    if (allSubmissions.length > 0 && containerRef.current) {
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      
      // Calculate zoom to fit all shapes with some padding
      const padding = 80; // Padding on each side
      const availableWidth = containerWidth - padding * 2;
      const availableHeight = containerHeight - padding * 2;
      
      const zoomX = availableWidth / totalWidth;
      const zoomY = availableHeight / totalHeight;
      const initialZoom = Math.min(zoomX, zoomY, 1); // Don't zoom in beyond 1x
      
      setZoom(initialZoom);
      
      // Center the canvas
      const scaledWidth = totalWidth * initialZoom;
      const scaledHeight = totalHeight * initialZoom;
      const centerX = (containerWidth - scaledWidth) / 2;
      const centerY = (containerHeight - scaledHeight) / 2;
      setOffset({ x: centerX, y: centerY });
    }
  }, [allSubmissions.length, totalWidth, totalHeight]);
  
  // Keep refs in sync with state
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // Handle wheel: Ctrl/Cmd+scroll = zoom, plain scroll = pan
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom towards mouse position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomSensitivity = 0.005;
        const zoomDelta = -e.deltaY * zoomSensitivity;
        const newZoom = Math.max(0.1, Math.min(2, zoom + zoomDelta));

        // Transform: translate(offset) scale(zoom), origin top-left
        // screenX = offset.x + cx * zoom
        const canvasX = (mouseX - offset.x) / zoom;
        const canvasY = (mouseY - offset.y) / zoom;

        const newOffsetX = mouseX - canvasX * newZoom;
        const newOffsetY = mouseY - canvasY * newZoom;

        setZoom(newZoom);
        setOffset({ x: newOffsetX, y: newOffsetY });
      }
    } else {
      // Pan the canvas
      setOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

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
      setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
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

      setZoom(newZoom);
      setOffset({ x: newOffsetX, y: newOffsetY });
    } else if (e.touches.length === 1 && isPanning) {
      const deltaX = e.touches[0].clientX - panStart.x;
      const deltaY = e.touches[0].clientY - panStart.y;

      setOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    lastTouchDistanceRef.current = null;
    lastTouchCenterRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="gallery-container relative w-full h-screen overflow-hidden"
      style={{
        cursor: isPanning ? 'grabbing' : 'grab',
        backgroundColor: '#F1F1F1',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
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
      {allSubmissions.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center" style={{ color: '#232323' }}>
            <div className="font-sans text-[24px] 2xl:text-[36px] mb-2">No drawings yet</div>
            <div className="font-sans text-[14px] 2xl:text-[21px]">Submit a drawing to see it here</div>
          </div>
        </div>
      ) : (
        <div
          className="absolute"
          style={{
            width: `${totalWidth}px`,
            height: `${totalHeight}px`,
            left: 0,
            top: 0,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {allSubmissions.map((submission, index) => {
            // Calculate row and column position
            const row = Math.floor(index / SHAPES_PER_ROW);
            const col = index % SHAPES_PER_ROW;
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
      )}
    </div>
  );
}
