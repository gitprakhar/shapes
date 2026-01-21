import { useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface Submission {
  id: string;
  imageData: string;
  author: string;
  note: string;
  x: number;
  y: number;
}

interface DrawingCanvasProps {
  onSubmit: (imageData: string, note: string) => void;
  existingSubmissions?: Submission[];
}

// Simple crayon drawing - no sticky notes

export function DrawingCanvas({ onSubmit, existingSubmissions = [] }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Pan offset for infinite canvas
  const lastPointRef = useRef<Point | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawingPathsRef = useRef<Array<{ points: Point[], strokeWidth: number }>>([]); // Store drawing paths for redraw
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [shouldSlideUp, setShouldSlideUp] = useState(false);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const shapeIntervalRef = useRef<number | null>(null);
  const strokeImageRef = useRef<HTMLImageElement | null>(null);
  
  // Marker/crayon settings
  const BASE_STROKE_WIDTH = 10;
  const MIN_STROKE_WIDTH = 6;
  const MAX_STROKE_WIDTH = 14;
  const STROKE_OPACITY = 0.8;
  
  // Total number of shape images
  const TOTAL_SHAPES = 5;

  // Generate a random polygon
  const generateRandomPolygon = (centerX: number, centerY: number, radius: number): Point[] => {
    const sides = Math.floor(Math.random() * 5) + 5; // 5-9 sides
    const points: Point[] = [];
    const angleStep = (2 * Math.PI) / sides;
    const rotation = Math.random() * Math.PI * 2;

    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep + rotation;
      const distance = radius * (0.7 + Math.random() * 0.3); // Vary distance for irregularity
      points.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
      });
    }

    return points;
  };

  // Draw text instead of shape for now
  const drawShape = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    // Don't draw anything - shape removed for now
  };

  // Initialize canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    const shapeCanvas = shapeCanvasRef.current;
    
    if (!canvas || !shapeCanvas) return;

    const ctx = canvas.getContext('2d');
    const shapeCtx = shapeCanvas.getContext('2d');
    
    if (!ctx || !shapeCtx) return;

    // Set canvas size to full window with device pixel ratio support
    const resizeCanvases = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Set actual size in memory (scaled for DPI)
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      shapeCanvas.width = width * dpr;
      shapeCanvas.height = height * dpr;
      
      // Scale the canvas back down using CSS
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      shapeCanvas.style.width = `${width}px`;
      shapeCanvas.style.height = `${height}px`;
      
      // Reset transforms and scale the drawing context
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      shapeCtx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      shapeCtx.scale(dpr, dpr);
      
      // Set up drawing context - marker/crayon style
      ctx.strokeStyle = '#1a1818';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = STROKE_OPACITY;
      
      // Redraw all stored paths after resize (for infinite canvas)
      if (isDrawingEnabled && drawingPathsRef.current.length > 0) {
        // Redraw all paths (no transforms needed - canvas is positioned via CSS)
        drawingPathsRef.current.forEach((path) => {
          if (path.points.length === 0) return;
          
          drawSvgStamp(ctx, path.points[0].x, path.points[0].y, path.strokeWidth);
          
          for (let i = 1; i < path.points.length; i++) {
            const prevPoint = path.points[i - 1];
            const currentPoint = path.points[i];
            const distance = Math.sqrt(
              Math.pow(currentPoint.x - prevPoint.x, 2) + Math.pow(currentPoint.y - prevPoint.y, 2)
            );
            const stampSpacing = 8;
            const stampCount = Math.max(1, Math.floor(distance / stampSpacing));
            
            for (let j = 0; j <= stampCount; j++) {
              const t = j / stampCount;
              const x = prevPoint.x + (currentPoint.x - prevPoint.x) * t;
              const y = prevPoint.y + (currentPoint.y - prevPoint.y) * t;
              drawSvgStamp(ctx, x, y, path.strokeWidth);
            }
          }
        });
      }
      
      // Redraw shape after resize
      drawShape(shapeCtx, width, height);
    };

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    // Load the SVG stroke texture
    const strokeImg = new Image();
    strokeImg.onload = () => {
      strokeImageRef.current = strokeImg;
    };
    strokeImg.onerror = () => {
      console.error('Failed to load stroke SVG');
    };
    strokeImg.src = '/stroke/stroke-vector.svg';

    // Cycle through shape images in a loop
    shapeIntervalRef.current = setInterval(() => {
      setCurrentShapeIndex((prev) => (prev + 1) % TOTAL_SHAPES);
    }, 600); // Change image every 0.6 seconds

    return () => {
      window.removeEventListener('resize', resizeCanvases);
      if (shapeIntervalRef.current) {
        clearInterval(shapeIntervalRef.current);
      }
    };
  }, []);

  // Redraw canvas when zoom or pan changes
  useEffect(() => {
    if (!isDrawingEnabled || drawingPathsRef.current.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = STROKE_OPACITY;
    
    // Redraw all stored paths (no transforms needed - canvas is positioned via CSS)
    drawingPathsRef.current.forEach((path) => {
      if (path.points.length === 0) return;
      
      // Draw first point
      drawSvgStamp(ctx, path.points[0].x, path.points[0].y, path.strokeWidth);
      
      // Draw path segments
      for (let i = 1; i < path.points.length; i++) {
        const prevPoint = path.points[i - 1];
        const currentPoint = path.points[i];
        const distance = Math.sqrt(
          Math.pow(currentPoint.x - prevPoint.x, 2) + Math.pow(currentPoint.y - prevPoint.y, 2)
        );
        const stampSpacing = 8;
        const stampCount = Math.max(1, Math.floor(distance / stampSpacing));
        
        for (let j = 0; j <= stampCount; j++) {
          const t = j / stampCount;
          const x = prevPoint.x + (currentPoint.x - prevPoint.x) * t;
          const y = prevPoint.y + (currentPoint.y - prevPoint.y) * t;
          drawSvgStamp(ctx, x, y, path.strokeWidth);
        }
      }
    });
  }, [isDrawingEnabled]);

  // Get mouse position relative to canvas (accounting for pan offset)
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    // Account for the canvas transform offset (world coordinates)
    const x = e.clientX - rect.left - offset.x;
    const y = e.clientY - rect.top - offset.y;
    
    return {
      x,
      y,
    };
  };

  // Calculate stroke width based on drawing speed
  const calculateStrokeWidth = (distance: number, timeDelta: number): number => {
    if (timeDelta === 0) return BASE_STROKE_WIDTH;
    
    const speed = distance / timeDelta; // pixels per ms
    // Faster = thinner, slower = thicker
    // Normalize speed (adjust these values based on typical drawing speeds)
    const normalizedSpeed = Math.min(speed / 2, 1); // Cap at 1
    const width = BASE_STROKE_WIDTH * (1 - normalizedSpeed * 0.4); // 40% variation
    const randomVariation = (Math.random() - 0.5) * 2; // ±1px randomness
    
    return Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, width + randomVariation));
  };

  // Draw SVG stamp at position
  const drawSvgStamp = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number
  ) => {
    if (!strokeImageRef.current) return; // Wait for SVG to load
    
    // Scale the SVG based on stroke width
    // SVG viewBox is 45x45, so use that as base size
    const baseSvgSize = 45;
    const scale = width / BASE_STROKE_WIDTH;
    const svgWidth = baseSvgSize * scale;
    const svgHeight = baseSvgSize * scale;
    
    // Add slight random offset for texture
    const offsetX = (Math.random() - 0.5) * 2;
    const offsetY = (Math.random() - 0.5) * 2;
    
    // Draw SVG at position
    ctx.drawImage(
      strokeImageRef.current,
      x + offsetX - svgWidth / 2,
      y + offsetY - svgHeight / 2,
      svgWidth,
      svgHeight
    );
  };


  // Start drawing or panning (like Gallery - simple click and drag)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingEnabled) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if middle mouse button for panning
    if (e.button === 1) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      });
      e.preventDefault();
      return;
    }

    // Otherwise, start drawing
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up context (no zoom/pan transforms needed - canvas is transformed via CSS)
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = STROKE_OPACITY;

    setIsDrawing(true);
    const pos = getMousePos(e);
    lastPointRef.current = pos;
    lastTimeRef.current = Date.now();
    
    // Start a new path
    drawingPathsRef.current.push({
      points: [pos],
      strokeWidth: BASE_STROKE_WIDTH,
    });
    
    // Draw initial point
    drawSvgStamp(ctx, pos.x, pos.y, BASE_STROKE_WIDTH);
  };

  // Draw while moving with marker/crayon texture
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingEnabled || isPanning) return; // Don't draw while panning
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle drawing
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up context (no zoom/pan transforms needed - canvas is positioned via CSS)
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = STROKE_OPACITY;

    const pos = getMousePos(e);

    if (isDrawing && lastPointRef.current) {
      const lastPoint = lastPointRef.current;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastTimeRef.current;
      
      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
      );
      
      // Calculate variable stroke width based on speed
      const strokeWidth = calculateStrokeWidth(distance, timeDelta);
      
      // Update current path
      if (drawingPathsRef.current.length > 0) {
        const currentPath = drawingPathsRef.current[drawingPathsRef.current.length - 1];
        currentPath.points.push(pos);
        currentPath.strokeWidth = strokeWidth;
      }
      
      // Set up context for SVG brush drawing
      ctx.globalCompositeOperation = 'source-over';
      
      // Stamp SVG along the path - more stamps for longer distances
      const stampSpacing = 8; // pixels between stamps (increased to reduce density)
      const stampCount = Math.max(1, Math.floor(distance / stampSpacing));
      
      for (let i = 0; i <= stampCount; i++) {
        const t = i / stampCount;
        const x = lastPoint.x + (pos.x - lastPoint.x) * t;
        const y = lastPoint.y + (pos.y - lastPoint.y) * t;
        drawSvgStamp(ctx, x, y, strokeWidth);
      }
      
      // Update references
      lastPointRef.current = pos;
      lastTimeRef.current = currentTime;
    }
  };

  // Stop drawing or panning
  const handleMouseUp = () => {
    setIsPanning(false);
    
    if (isDrawing && lastPointRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      
      if (canvas && ctx) {
        // Draw final point
        ctx.globalCompositeOperation = 'source-over';
        drawSvgStamp(ctx, lastPointRef.current.x, lastPointRef.current.y, BASE_STROKE_WIDTH);
      }
    }
    
    setIsDrawing(false);
    lastPointRef.current = null;
    lastTimeRef.current = 0;
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    if (isDrawing && lastPointRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      
      if (canvas && ctx) {
        // Draw final point
        ctx.globalCompositeOperation = 'source-over';
        drawSvgStamp(ctx, lastPointRef.current.x, lastPointRef.current.y, BASE_STROKE_WIDTH);
      }
    }
    
    setIsDrawing(false);
    setIsHovering(false);
    lastPointRef.current = null;
    lastTimeRef.current = 0;
  };

  // Capture the drawing and submit
  const handleSubmit = () => {
    if (isSubmitting) return; // Prevent double submission
    
    setIsSubmitting(true);
    
    const canvas = canvasRef.current;
    const shapeCanvas = shapeCanvasRef.current;
    
    if (!canvas || !shapeCanvas) {
      setIsSubmitting(false);
      return;
    }

    // Create a new canvas to combine both layers
    const combinedCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    combinedCanvas.width = width * dpr;
    combinedCanvas.height = height * dpr;
    
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) {
      setIsSubmitting(false);
      return;
    }

    // Scale context to match the original canvas scaling
    ctx.scale(dpr, dpr);
    
    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Draw shape canvas
    ctx.drawImage(shapeCanvas, 0, 0, shapeCanvas.width / dpr, shapeCanvas.height / dpr);
    
    // Draw drawing canvas
    ctx.drawImage(canvas, 0, 0, canvas.width / dpr, canvas.height / dpr);
    
    // Convert to image data URL
    const imageData = combinedCanvas.toDataURL('image/png');
    onSubmit(imageData, '');
  };

  return (
    <>
      {/* Intro page - fades out */}
      <div 
        className="absolute inset-0 w-full h-screen overflow-hidden"
        style={{ 
          backgroundColor: '#F1F1F1',
          opacity: shouldSlideUp ? 0 : 1,
          transition: 'opacity 0.6s ease-out',
          pointerEvents: shouldSlideUp ? 'none' : 'auto',
          zIndex: shouldSlideUp ? 0 : 10,
        }}
      >
        {/* Shape image behind text - cycling through images */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none overflow-visible">
          <img
            src={`/shapes/shape${currentShapeIndex + 1}.png`}
            alt="Shape"
            className="object-contain opacity-100 transition-opacity duration-500"
            style={{ width: '100vw', height: '100vh', transform: 'translateY(-5%)' }}
          />
        </div>

        {/* Large centered text in EB Garamond */}
        <div className="absolute inset-0 flex items-center justify-center z-1 pointer-events-none">
          <div className="font-serif text-[150px] font-normal leading-none tracking-tight text-center max-w-5xl px-12" style={{ color: '#232323' }}>
            Same shape. Different minds.
          </div>
        </div>

        {/* Enter Vibeform link at bottom */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
          <a 
            href="#" 
            className="font-sans text-[12px] underline cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: '#232323' }}
            onClick={(e) => {
              e.preventDefault();
              // Stop the image cycling
              if (shapeIntervalRef.current) {
                clearInterval(shapeIntervalRef.current);
                shapeIntervalRef.current = null;
              }
              setIsDrawingEnabled(true);
              setShouldSlideUp(true);
            }}
          >
            Play Today's Vibeform
          </a>
        </div>
      </div>

      {/* Drawing page - appears after dissolve */}
      <div 
        className="relative w-full h-screen overflow-hidden"
        style={{ 
          backgroundColor: '#F1F1F1',
          opacity: shouldSlideUp ? 1 : 0,
          transition: 'opacity 0.6s ease-out',
          pointerEvents: shouldSlideUp ? 'auto' : 'none',
          zIndex: shouldSlideUp ? 10 : 0,
        }}
      >
        {/* Infinite dot grid background - like Gallery */}
        <div
          className="absolute pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            width: '500%',
            height: '500%',
            left: '-200%',
            top: '-200%',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            zIndex: 0,
          }}
        />

        {/* Rules in bottom left */}
        <div className="absolute bottom-16 left-12 z-20">
          <div className="font-sans text-[24px] font-normal mb-1 pointer-events-none" style={{ color: '#232323' }}>
            Vibeform
          </div>
          <div className="font-sans text-[12px] font-normal pointer-events-none mb-2" style={{ color: '#232323', lineHeight: '1.4', maxWidth: '300px' }}>
            Every day, everyone gets the same shape. Draw something from it, then explore what others created. Same starting point, infinite interpretations.
          </div>
          <div className="font-sans text-[12px] font-normal pointer-events-none" style={{ color: '#232323', lineHeight: '1.3' }}>
            <button
              onClick={handleSubmit}
              className="underline cursor-pointer hover:opacity-70 transition-opacity text-left p-0 m-0 border-0 bg-transparent font-normal"
              style={{ color: '#232323' }}
            >
              Submit
            </button>
            {' '}to see what others made
          </div>
        </div>


        {/* Canvas container with transform - like Gallery */}
        <div
          className="absolute"
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            cursor: isPanning ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
          onMouseDown={(e) => {
            // Only pan if clicking on background, not drawing
            if (e.button === 0 && !isDrawing) {
              setIsPanning(true);
              setPanStart({
                x: e.clientX - offset.x,
                y: e.clientY - offset.y,
              });
              e.preventDefault();
            }
          }}
          onMouseMove={(e) => {
            if (isPanning) {
              setOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
              });
            }
          }}
          onMouseUp={() => {
            setIsPanning(false);
          }}
          onMouseLeave={() => {
            setIsPanning(false);
          }}
        >
          {/* Shape canvas (base layer) - hidden for now */}
          <canvas
            ref={shapeCanvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1, display: 'none' }}
          />
          
          {/* Drawing canvas (interactive layer) */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ 
              zIndex: 2,
              cursor: isHovering 
                ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z\' fill=\'%231a1818\'/%3E%3C/svg%3E") 2 22, auto' 
                : 'crosshair',
              pointerEvents: isPanning ? 'none' : 'auto',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => {
              setIsHovering(true);
              handleMouseMove(e);
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(e) => e.preventDefault()} // Prevent context menu on right click
          />
        </div>
      </div>
    </>
  );
}
