import { useEffect, useRef, useState, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
}

interface ShapeCreatorProps {
  onSave: () => void;
  onBack: () => void;
}

export function ShapeCreator({ onSave, onBack }: ShapeCreatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPointRef = useRef<Point | null>(null);
  const lastTimeRef = useRef<number>(0);
  const drawingPathsRef = useRef<Array<{ points: Point[], strokeWidth: number }>>([]);
  const strokeImageRef = useRef<HTMLImageElement | null>(null);

  // Marker/crayon settings
  const BASE_STROKE_WIDTH = 10;
  const MIN_STROKE_WIDTH = 6;
  const MAX_STROKE_WIDTH = 14;
  const STROKE_OPACITY = 0.8;

  // Calculate stroke width based on drawing speed
  const calculateStrokeWidth = (distance: number, timeDelta: number): number => {
    if (timeDelta === 0) return BASE_STROKE_WIDTH;

    const speed = distance / timeDelta;
    const normalizedSpeed = Math.min(speed / 2, 1);
    const width = BASE_STROKE_WIDTH * (1 - normalizedSpeed * 0.4);
    const randomVariation = (Math.random() - 0.5) * 2;

    return Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, width + randomVariation));
  };

  // Draw SVG stamp at position
  const drawSvgStamp = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number
  ) => {
    if (!strokeImageRef.current) return;

    const baseSvgSize = 45;
    const scale = width / BASE_STROKE_WIDTH;
    const svgWidth = baseSvgSize * scale;
    const svgHeight = baseSvgSize * scale;

    const offsetX = (Math.random() - 0.5) * 2;
    const offsetY = (Math.random() - 0.5) * 2;

    ctx.drawImage(
      strokeImageRef.current,
      x + offsetX - svgWidth / 2,
      y + offsetY - svgHeight / 2,
      svgWidth,
      svgHeight
    );
  };

  // Initialize canvas and load SVG
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load SVG image
    const img = new Image();
    img.onload = () => {
      strokeImageRef.current = img;
    };
    img.src = '/stroke/stroke-vector.svg';

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = 800; // Fixed size for the shape

      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      ctx.strokeStyle = '#1a1818';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = STROKE_OPACITY;

      // Redraw all stored paths
      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Redraw all stored paths
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = STROKE_OPACITY;

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
  }, []);

  // Get mouse position relative to canvas
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    return { x, y };
  };

  // Start drawing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = STROKE_OPACITY;

    setIsDrawing(true);
    const pos = getMousePos(e);
    lastPointRef.current = pos;
    lastTimeRef.current = Date.now();

    drawingPathsRef.current.push({
      points: [pos],
      strokeWidth: BASE_STROKE_WIDTH,
    });

    drawSvgStamp(ctx, pos.x, pos.y, BASE_STROKE_WIDTH);
  };

  // Draw while moving
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = STROKE_OPACITY;

    const pos = getMousePos(e);

    if (lastPointRef.current) {
      const lastPoint = lastPointRef.current;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastTimeRef.current;

      const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
      );

      const strokeWidth = calculateStrokeWidth(distance, timeDelta);

      if (drawingPathsRef.current.length > 0) {
        const currentPath = drawingPathsRef.current[drawingPathsRef.current.length - 1];
        currentPath.points.push(pos);
        currentPath.strokeWidth = strokeWidth;
      }

      const stampSpacing = 8;
      const stampCount = Math.max(1, Math.floor(distance / stampSpacing));

      for (let i = 0; i <= stampCount; i++) {
        const t = i / stampCount;
        const x = lastPoint.x + (pos.x - lastPoint.x) * t;
        const y = lastPoint.y + (pos.y - lastPoint.y) * t;
        drawSvgStamp(ctx, x, y, strokeWidth);
      }

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
        ctx.globalCompositeOperation = 'source-over';
        drawSvgStamp(ctx, lastPointRef.current.x, lastPointRef.current.y, BASE_STROKE_WIDTH);
      }
    }

    setIsDrawing(false);
    lastPointRef.current = null;
    lastTimeRef.current = 0;
  };

  // Save the shape
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert to image data URL at full size (800x800)
    const imageData = canvas.toDataURL('image/png');
    
    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // Save to Supabase daily_shapes table
      const { supabase } = await import('@/lib/supabase');
      
      // Check if shape for today already exists
      const { data: existingShape, error: checkError } = await supabase
        .from('daily_shapes')
        .select('id')
        .eq('date', today)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
      
      if (checkError) {
        console.error('Error checking for existing shape:', checkError);
        throw checkError;
      }
      
      if (existingShape) {
        // Update existing shape
        const { error } = await supabase
          .from('daily_shapes')
          .update({ shape_data: imageData })
          .eq('id', existingShape.id);
        
        if (error) {
          console.error('Error updating shape:', error);
          throw error;
        }
      } else {
        // Insert new shape
        const { error } = await supabase
          .from('daily_shapes')
          .insert({
            date: today,
            shape_data: imageData,
          });
        
        if (error) {
          console.error('Error inserting shape:', error);
          throw error;
        }
      }
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem('defaultShape', imageData);
      
      console.log('Shape saved successfully to Supabase!');
      
      // Call the onSave callback
      onSave();
    } catch (error) {
      console.error('Failed to save shape to Supabase:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Still save to localStorage as fallback
      localStorage.setItem('defaultShape', imageData);
      
      alert(`Failed to save shape to Supabase: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`);
    }
  };

  // Clear the canvas
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawingPathsRef.current = [];
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: '#F1F1F1' }}>
      {/* Grid dots background */}
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

      {/* Controls */}
      <div className="absolute top-16 left-12 z-20">
        <div className="font-sans text-[24px] font-normal mb-4 pointer-events-none" style={{ color: '#232323' }}>
          Shape Creator
        </div>
        <div className="font-sans text-[12px] font-normal pointer-events-none mb-4" style={{ color: '#232323', lineHeight: '1.4', maxWidth: '300px' }}>
          Draw the default shape that will appear on the drawing canvas for all users.
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleClear}
            className="font-sans text-[12px] underline cursor-pointer hover:opacity-70 transition-opacity text-left p-0 m-0 border-0 bg-transparent font-normal"
            style={{ color: '#232323' }}
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            className="font-sans text-[12px] underline cursor-pointer hover:opacity-70 transition-opacity text-left p-0 m-0 border-0 bg-transparent font-normal"
            style={{ color: '#232323' }}
          >
            Save Shape
          </button>
          <button
            onClick={onBack}
            className="font-sans text-[12px] underline cursor-pointer hover:opacity-70 transition-opacity text-left p-0 m-0 border-0 bg-transparent font-normal"
            style={{ color: '#232323' }}
          >
            Back
          </button>
        </div>
      </div>

      {/* Canvas container - centered */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div
          style={{
            width: '800px',
            height: '800px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z\' fill=\'%231a1818\'/%3E%3C/svg%3E") 2 22, auto',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
    </div>
  );
}
