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
  const lastPointRef = useRef<Point | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [zoomScale, setZoomScale] = useState(1); // Start at normal scale
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [shouldSlideUp, setShouldSlideUp] = useState(false);
  
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
      
      // Redraw shape after resize
      drawShape(shapeCtx, width, height);
    };

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    // Cycle through shape images quickly in a loop
    const shapeInterval = setInterval(() => {
      setCurrentShapeIndex((prev) => (prev + 1) % TOTAL_SHAPES);
    }, 300); // Change image every 0.3 seconds (fast)

    return () => {
      window.removeEventListener('resize', resizeCanvases);
      clearInterval(shapeInterval);
    };
  }, []);

  // Get mouse position relative to canvas (accounting for sticky note container)
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
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

  // Draw textured marker stroke with overlapping circles
  const drawTexturedStroke = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    width: number
  ) => {
    const distance = Math.sqrt(
      Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2)
    );
    const steps = Math.max(1, Math.floor(distance / (width * 0.3))); // Overlapping circles
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      
      // Add slight randomness to position for texture
      const offsetX = (Math.random() - 0.5) * width * 0.15;
      const offsetY = (Math.random() - 0.5) * width * 0.15;
      
      // Draw overlapping circles for marker texture
      ctx.beginPath();
      ctx.arc(
        x + offsetX,
        y + offsetY,
        width / 2 + (Math.random() - 0.5) * width * 0.1, // Slight size variation
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  };

  // Start drawing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx) return;

    setIsDrawing(true);
    const pos = getMousePos(e);
    lastPointRef.current = pos;
    lastTimeRef.current = Date.now();
    
    // Draw initial point
    ctx.globalAlpha = STROKE_OPACITY;
    ctx.fillStyle = '#1a1818';
    drawTexturedStroke(ctx, pos, pos, BASE_STROKE_WIDTH);
  };

  // Draw while moving with marker/crayon texture
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx) return;

    const pos = getMousePos(e);

    if (isDrawing && lastPointRef.current) {
      const lastPoint = lastPointRef.current;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastTimeRef.current;
      
      // Calculate distance and speed
      const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
      );
      
      // Calculate variable stroke width based on speed
      const strokeWidth = calculateStrokeWidth(distance, timeDelta);
      
      // Set up context for marker drawing
      ctx.globalAlpha = STROKE_OPACITY;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#1a1818';
      
      // Draw textured stroke with overlapping circles
      drawTexturedStroke(ctx, lastPoint, pos, strokeWidth);
      
      // Update references
      lastPointRef.current = pos;
      lastTimeRef.current = currentTime;
    }
  };

  // Stop drawing
  const handleMouseUp = () => {
    if (isDrawing && lastPointRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      
      if (canvas && ctx) {
        // Draw final point
        ctx.globalAlpha = STROKE_OPACITY;
        ctx.fillStyle = '#1a1818';
        drawTexturedStroke(
          ctx,
          lastPointRef.current,
          lastPointRef.current,
          BASE_STROKE_WIDTH
        );
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
        ctx.globalAlpha = STROKE_OPACITY;
        ctx.fillStyle = '#1a1818';
        drawTexturedStroke(
          ctx,
          lastPointRef.current,
          lastPointRef.current,
          BASE_STROKE_WIDTH
        );
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
    <div 
      className="relative w-full h-screen overflow-hidden"
      style={{ 
        backgroundColor: '#F1F1F1',
        transform: shouldSlideUp ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 1s ease-in-out',
      }}
    >
      {/* Shape image behind text - cycling through images */}
      <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none overflow-visible">
        <img
          src={`/shapes/shape${currentShapeIndex + 1}.png`}
          alt="Shape"
          className="object-contain opacity-100 transition-opacity duration-500"
          style={{ width: '120vw', height: '120vh' }}
        />
      </div>

      {/* Large centered text in EB Garamond - fades out when sliding */}
      <div 
        className="absolute inset-0 flex items-center justify-center z-1 pointer-events-none"
        style={{
          opacity: shouldSlideUp ? 0 : 1,
          transition: 'opacity 0.8s ease-out',
        }}
      >
        <div className="font-serif text-[166px] font-normal leading-none tracking-tight text-center max-w-4xl px-12" style={{ color: '#232323' }}>
          one shape can be many things
        </div>
      </div>

      {/* Enter Vibeform link at bottom - fades out when sliding */}
      <div 
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        style={{
          opacity: shouldSlideUp ? 0 : 1,
          transition: 'opacity 0.8s ease-out',
        }}
      >
        <a 
          href="#" 
          className="font-sans text-[12px] underline cursor-pointer hover:opacity-70 transition-opacity"
          style={{ color: '#232323' }}
          onClick={(e) => {
            e.preventDefault();
            // Add click handler if needed
          }}
        >
          Enter Vibeform
        </a>
      </div>

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
          cursor: isHovering ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z\' fill=\'%231a1818\'/%3E%3C/svg%3E") 2 22, auto' : 'crosshair'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          setIsHovering(true);
          handleMouseMove(e);
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      
    </div>
  );
}
