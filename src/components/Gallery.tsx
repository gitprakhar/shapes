import { useRef, useState, useEffect } from 'react';

const SUBMISSIONS_STORAGE_KEY = 'drawingSubmissions';
const GAP = 40; // Gap between drawings
const DRAWING_DISPLAY_SIZE = 600; // Display size for each drawing (much smaller than full canvas)

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
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>(propSubmissions);

  // Load all submissions from Supabase on mount
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
          // Fallback to localStorage
          const stored = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setAllSubmissions(parsed);
          }
          return;
        }
        
        if (!dailyShape) {
          console.warn('No daily shape found for today');
          // Fallback to localStorage
          const stored = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setAllSubmissions(parsed);
          }
          return;
        }
        
        // Load all drawings for today's shape
        const { data: drawings, error: drawingsError } = await supabase
          .from('user_drawings')
          .select('*')
          .eq('daily_shape_id', dailyShape.id)
          .order('created_at', { ascending: true });
        
        if (drawingsError) {
          console.error('Error loading drawings:', drawingsError);
          console.error('Drawings error details:', JSON.stringify(drawingsError, null, 2));
          throw drawingsError;
        }
        
        // Convert Supabase format to Submission format
        const submissions: Submission[] = (drawings || []).map((drawing) => ({
          id: drawing.id,
          svgString: drawing.drawing_paths?.svgString,
          imageData: drawing.drawing_paths?.imageData,
          drawingPaths: drawing.drawing_paths?.drawingPaths,
          author: 'User', // Could be enhanced with user auth later
          note: '',
          x: 0,
          y: 0,
        }));
        
        setAllSubmissions(submissions);
      } catch (error) {
        console.error('Failed to load submissions from Supabase:', error);
        // Fallback to localStorage
        try {
          const stored = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setAllSubmissions(parsed);
          }
        } catch (localError) {
          console.error('Failed to load from localStorage:', localError);
        }
      }
    };
    
    loadSubmissions();
  }, []);

  // Update when propSubmissions change (new submission added)
  useEffect(() => {
    if (propSubmissions.length > 0) {
      setAllSubmissions(propSubmissions);
    }
  }, [propSubmissions]);

  // Handle panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Calculate total width needed - canvas grows with number of submissions
  const totalWidth = allSubmissions.length > 0
    ? allSubmissions.length * DRAWING_DISPLAY_SIZE + (allSubmissions.length - 1) * GAP
    : DRAWING_DISPLAY_SIZE;
  const totalHeight = DRAWING_DISPLAY_SIZE;

  // Initialize offset to center the canvas in viewport
  useEffect(() => {
    if (allSubmissions.length > 0 && offset.x === 0 && offset.y === 0) {
      const centerX = Math.max(0, (window.innerWidth - totalWidth) / 2);
      const centerY = Math.max(0, (window.innerHeight - totalHeight) / 2);
      setOffset({ x: centerX, y: centerY });
    }
  }, [allSubmissions.length, totalWidth, totalHeight]);

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
    >
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
            <div className="font-sans text-[24px] mb-2">No drawings yet</div>
            <div className="font-sans text-[14px]">Submit a drawing to see it here</div>
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
            transform: `translate(${offset.x}px, ${offset.y}px)`,
          }}
        >
          {allSubmissions.map((submission, index) => {
            const x = index * (DRAWING_DISPLAY_SIZE + GAP);
            
            // Prefer SVG string if available (new format)
            if (submission.svgString) {
              // Scale down the SVG to fit the display size
              // The original SVG is canvasSize x canvasSize (300vh = ~2400px)
              // We want to display it at DRAWING_DISPLAY_SIZE (600px)
              const canvasSize = typeof window !== 'undefined' ? window.innerHeight * 3 : 2400;
              const scale = DRAWING_DISPLAY_SIZE / canvasSize;
              
              return (
                <div
                  key={submission.id}
                  style={{
                    position: 'absolute',
                    left: `${x}px`,
                    top: '0px',
                    width: `${DRAWING_DISPLAY_SIZE}px`,
                    height: `${DRAWING_DISPLAY_SIZE}px`,
                    overflow: 'hidden',
                    backgroundColor: 'transparent',
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      width: `${canvasSize}px`,
                      height: `${canvasSize}px`,
                    }}
                    dangerouslySetInnerHTML={{ __html: submission.svgString }}
                  />
                </div>
              );
            }
            
            // Fallback to imageData for old submissions - remove white background
            if (submission.imageData) {
              return (
                <div
                  key={submission.id}
                  style={{
                    position: 'absolute',
                    left: `${x}px`,
                    top: '0px',
                    width: `${DRAWING_DISPLAY_SIZE}px`,
                    height: `${DRAWING_DISPLAY_SIZE}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                  }}
                >
                  <img
                    src={submission.imageData}
                    alt={`Drawing ${index + 1}`}
                    style={{
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
