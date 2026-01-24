import { useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}


interface DrawingPath {
  points: Point[];
  strokeWidth: number;
}

interface DrawingCanvasProps {
  onSubmit: (imageData: string, note: string, drawingPaths?: DrawingPath[], svgString?: string) => void;
}

// Simple crayon drawing - no sticky notes

export function DrawingCanvas({ onSubmit }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 }); // Pan offset for drawing canvas (for panning within drawing area)
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 }); // Initial centered offset for calculating pan limits
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [zoom, setZoom] = useState(isMobile ? 0.8 : 1); // Zoom level (mobile starts at 80%)
  const zoomRef = useRef(isMobile ? 0.8 : 1); // Ref to track current zoom for gesture handlers
  const offsetRef = useRef({ x: 0, y: 0 }); // Ref to track current canvasOffset for gesture handlers
  const lastTouchDistanceRef = useRef<number | null>(null); // For two-finger panning/zooming
  const lastTouchCenterRef = useRef<Point | null>(null); // For two-finger panning
  const lastGestureScaleRef = useRef<number>(1); // For trackpad gesture zoom
  const pendingTouchRef = useRef<{ pos: Point, ctx: CanvasRenderingContext2D } | null>(null); // Delay draw until confirmed single-finger
  const lastPointRef = useRef<Point | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moveCount, setMoveCount] = useState(0); // Track number of moves (max 5)
  const [canvasSize, setCanvasSize] = useState(0); // Canvas size in pixels (300vh = viewportHeight * 3)
  const drawingPathsRef = useRef<Array<{ points: Point[], strokeWidth: number }>>([]); // Store drawing paths for redraw
  const isDrawingEnabled = true; // Always enabled on drawing page
  const strokeImageRef = useRef<HTMLImageElement | null>(null);
  
  // Marker/crayon settings
  const BASE_STROKE_WIDTH = 10;
  const MIN_STROKE_WIDTH = 6;
  const MAX_STROKE_WIDTH = 14;
  const STROKE_OPACITY = 0.8;
  
  // Zoom settings
  const MIN_ZOOM = 0.3; // 30%
  const MAX_ZOOM = 4; // 400%

  // Draw the default shape (loaded from Supabase or localStorage fallback)
  const drawShape = async (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    // Try to load from Supabase first, fallback to localStorage
    let defaultShapeData: string | null = null;
    
    try {
      const { supabase } = await import('@/lib/supabase');
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('daily_shapes')
        .select('shape_data')
        .eq('date', today)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
      
      if (!error && data) {
        defaultShapeData = data.shape_data;
      } else {
        if (error) {
          console.error('Error loading shape from Supabase:', error);
        }
        // Fallback to localStorage
        defaultShapeData = localStorage.getItem('defaultShape');
      }
    } catch (error) {
      console.error('Failed to load shape from Supabase, using localStorage:', error);
      defaultShapeData = localStorage.getItem('defaultShape');
    }
    
    if (defaultShapeData) {
      const img = new Image();
      img.onload = () => {
        // Center the shape on the canvas at its original size (800x800px)
        // The canvas is 300vh x 300vh, so center is at width/2, height/2
        const centerX = width / 2;
        const centerY = height / 2;
        const imgWidth = 800; // Original size from ShapeCreator (800x800px)
        const imgHeight = 800;
        
        // Draw the image centered - coordinates are already in the scaled coordinate system (DPR applied)
        ctx.drawImage(
          img,
          centerX - imgWidth / 2,
          centerY - imgHeight / 2,
          imgWidth,
          imgHeight
        );
      };
      img.onerror = () => {
        console.error('Failed to load default shape image');
      };
      img.src = defaultShapeData;
    }
  };

  // Initialize canvas offset to center the shape in the viewport
  useEffect(() => {
    if (!isDrawingEnabled || canvasSize === 0) return;
    
    // The canvas is square (canvasSize x canvasSize), positioned at -canvasSize/3, -canvasSize/3
    // The shape is drawn at the center of the canvas (canvasSize/2, canvasSize/2 in canvas coords)
    // Canvas container position: left: -canvasSize/3, top: -canvasSize/3
    // Canvas center position in viewport (before transform): 
    //   X: -canvasSize/3 + canvasSize/2 = canvasSize/6
    //   Y: -canvasSize/3 + canvasSize/2 = canvasSize/6
    // Viewport center: (viewportWidth/2, viewportHeight/2)
    // To center the shape, we need to offset by:
    //   offsetX = viewportWidth/2 - canvasSize/6
    //   offsetY = viewportHeight/2 - canvasSize/6
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;
    const currentZoom = isMobile ? 0.8 : 1;

    // CSS transform: scale(zoom) translate(offset, offset), origin 0 0
    // Screen position of canvas center (canvasSize/2):
    //   screenX = containerLeft + (canvasSize/2 + offset.x) * zoom
    //   containerLeft = -canvasSize/3
    // To center: viewportCenterX = -canvasSize/3 + (canvasSize/2 + offset.x) * zoom
    // Solve for offset.x: offset.x = (viewportCenterX + canvasSize/3) / zoom - canvasSize/2
    const offsetX = (viewportCenterX + canvasSize / 3) / currentZoom - canvasSize / 2;
    const offsetY = (viewportCenterY + canvasSize / 3) / currentZoom - canvasSize / 2;
    
    // Store the initial centered offset for panning limits
    setInitialOffset({ x: offsetX, y: offsetY });
    setCanvasOffset({ x: offsetX, y: offsetY });
  }, [isDrawingEnabled, canvasSize]);

  // Initialize canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    const shapeCanvas = shapeCanvasRef.current;
    
    if (!canvas || !shapeCanvas) return;

    const ctx = canvas.getContext('2d');
    const shapeCtx = shapeCanvas.getContext('2d');
    
    if (!ctx || !shapeCtx) return;

    // Set canvas size to 300vh x 300vh (100vh on each side) with device pixel ratio support
    const resizeCanvases = () => {
      const dpr = window.devicePixelRatio || 1;
      const viewportHeight = window.innerHeight;
      const canvasSizeValue = viewportHeight * 3; // 300vh = 3 * 100vh
      
      // Update canvas size state for container sizing
      setCanvasSize(canvasSizeValue);
      
      const canvasSize = canvasSizeValue;
      
      // Set actual size in memory (scaled for DPI)
      canvas.width = canvasSize * dpr;
      canvas.height = canvasSize * dpr;
      shapeCanvas.width = canvasSize * dpr;
      shapeCanvas.height = canvasSize * dpr;
      
      // Scale the canvas back down using CSS
      canvas.style.width = `${canvasSize}px`;
      canvas.style.height = `${canvasSize}px`;
      shapeCanvas.style.width = `${canvasSize}px`;
      shapeCanvas.style.height = `${canvasSize}px`;
      
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
      drawShape(shapeCtx, canvasSize, canvasSize).catch((error) => {
        console.error('Failed to draw shape:', error);
      });
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

    return () => {
      window.removeEventListener('resize', resizeCanvases);
    };
  }, []);

  // Prevent browser zoom on ctrl/cmd+wheel and touch gestures (like Figma)
  useEffect(() => {
    if (!isDrawingEnabled) return;

    const preventBrowserZoom = (e: WheelEvent | TouchEvent) => {
      // Prevent browser zoom when ctrl/cmd is pressed - we handle zoom ourselves
      if (e instanceof WheelEvent) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      } else if (e instanceof TouchEvent) {
        // Prevent pinch-to-zoom on touch devices
        if (e.touches.length === 2) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };

    const handleGestureStart = (e: Event) => {
      if (!isDrawingEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      const gestureEvent = e as any; // GestureEvent is not in standard types
      if (gestureEvent.scale !== undefined) {
        lastGestureScaleRef.current = gestureEvent.scale;
      }
    };

    const handleGestureChange = (e: Event) => {
      if (!isDrawingEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      
      const gestureEvent = e as any; // GestureEvent is not in standard types
      if (gestureEvent.scale === undefined) return;
      
      const currentScale = gestureEvent.scale;
      const scaleDelta = currentScale / lastGestureScaleRef.current;
      const currentZoom = zoomRef.current;
      const currentOffset = offsetRef.current;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * scaleDelta));
      
      // Get gesture center position (if available, otherwise use viewport center)
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gestureX = gestureEvent.clientX !== undefined ? gestureEvent.clientX : viewportWidth / 2;
      const gestureY = gestureEvent.clientY !== undefined ? gestureEvent.clientY : viewportHeight / 2;
      
      // Container CSS: left: -canvasSize/3, top: -canvasSize/3
      const containerLeft = canvasSize > 0 ? -canvasSize / 3 : -window.innerHeight;
      const containerTop = canvasSize > 0 ? -canvasSize / 3 : -window.innerHeight;

      // CSS transform: scale(zoom) translate(offset.x, offset.y), origin 0 0
      // Screen position formula: screenX = containerLeft + (cx + offset.x) * zoom
      // Therefore: cx = (screenX - containerLeft) / zoom - offset.x
      const canvasX = (gestureX - containerLeft) / currentZoom - currentOffset.x;
      const canvasY = (gestureY - containerTop) / currentZoom - currentOffset.y;

      // New offset so same canvas point stays under gesture center after zoom
      // newOffset.x = (screenX - containerLeft) / newZoom - cx
      const newOffsetX = (gestureX - containerLeft) / newZoom - canvasX;
      const newOffsetY = (gestureY - containerTop) / newZoom - canvasY;
      
      // Update refs synchronously first, then state (async)
      zoomRef.current = newZoom;
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      lastGestureScaleRef.current = currentScale;

      setZoom(newZoom);
      setCanvasOffset({ x: newOffsetX, y: newOffsetY });
    };

    const handleGestureEnd = (e: Event) => {
      if (!isDrawingEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      lastGestureScaleRef.current = 1;
    };

    // Prevent browser swipe navigation (back/forward gestures)
    const preventSwipeNavigation = (e: Event) => {
      // Prevent horizontal swipe gestures that trigger browser navigation
      const touchEvent = e as TouchEvent;
      if (touchEvent.touches && touchEvent.touches.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Use passive: false to allow preventDefault
    document.addEventListener('wheel', preventBrowserZoom as EventListener, { passive: false });
    document.addEventListener('touchstart', preventBrowserZoom as EventListener, { passive: false });
    document.addEventListener('touchmove', preventBrowserZoom as EventListener, { passive: false });
    document.addEventListener('touchmove', preventSwipeNavigation as EventListener, { passive: false });
    document.addEventListener('gesturestart', handleGestureStart, { passive: false });
    document.addEventListener('gesturechange', handleGestureChange, { passive: false });
    document.addEventListener('gestureend', handleGestureEnd, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventBrowserZoom as EventListener);
      document.removeEventListener('touchstart', preventBrowserZoom as EventListener);
      document.removeEventListener('touchmove', preventBrowserZoom as EventListener);
      document.removeEventListener('touchmove', preventSwipeNavigation as EventListener);
      document.removeEventListener('gesturestart', handleGestureStart);
      document.removeEventListener('gesturechange', handleGestureChange);
      document.removeEventListener('gestureend', handleGestureEnd);
    };
  }, [isDrawingEnabled]);

  // Keep refs in sync with state
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = canvasOffset;
  }, [canvasOffset]);

  // Handle keyboard events for drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDrawingEnabled) return;
      // Allow drawing when any key is pressed (except modifier keys)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setIsPanning(false); // Stop panning when key is pressed
      }
    };

    const handleKeyUp = () => {
      setIsDrawing(false); // Stop drawing when key is released
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isDrawingEnabled]);

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
    // Get position relative to canvas element
    // Account for zoom: divide by zoom to get correct canvas coordinates
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
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


  // Calculate distance between two touches
  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  };

  // Calculate center point between two touches
  const getTouchCenter = (touch1: React.Touch, touch2: React.Touch): Point => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  };

  // Handle touch events for two-finger panning
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isDrawingEnabled) return;
    
    if (e.touches.length === 2) {
      // Two-finger panning - prevent browser zoom and navigation
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      e.nativeEvent.stopImmediatePropagation();

      // Cancel any pending touch (second finger arrived before draw committed)
      pendingTouchRef.current = null;

      // Stop any active drawing immediately
      if (isDrawing) {
        setIsDrawing(false);
      }
      
      // Prevent browser swipe navigation
      if (e.nativeEvent.cancelable) {
        e.nativeEvent.preventDefault();
      }
      setIsPanning(true);
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;
    } else if (e.touches.length === 1 && !isPanning) {
      // Single touch - defer drawing until we confirm it's not a pinch gesture
      if (moveCount >= 5) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const pos = {
        x: (touch.clientX - rect.left) / zoom,
        y: (touch.clientY - rect.top) / zoom,
      };

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = STROKE_OPACITY;

      // Store pending touch - don't draw yet until confirmed single-finger
      pendingTouchRef.current = { pos, ctx };
      lastPointRef.current = pos;
      lastTimeRef.current = Date.now();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDrawingEnabled) return;
    
    // If two fingers are on screen, stop drawing immediately and only handle panning/zooming
    if (e.touches.length === 2) {
      // Cancel any pending touch (finger landed just before the second one)
      pendingTouchRef.current = null;

      // Stop any active drawing
      if (isDrawing) {
        setIsDrawing(false);
      }

      // Two-finger gesture - prevent browser navigation/zoom
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      e.nativeEvent.stopImmediatePropagation();

      // Initialize tracking on first two-finger detection
      if (!isPanning || lastTouchDistanceRef.current === null || lastTouchCenterRef.current === null) {
        setIsPanning(true);
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

      // Ratio-based zoom (consistent behavior at all zoom levels)
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * (distance / prevDistance)));

      // Container CSS: left: -canvasSize/3, top: -canvasSize/3
      const containerLeft = canvasSize > 0 ? -canvasSize / 3 : -window.innerHeight;
      const containerTop = canvasSize > 0 ? -canvasSize / 3 : -window.innerHeight;

      // CSS transform: scale(zoom) translate(offset.x, offset.y), origin 0 0
      // Screen position formula: screenX = containerLeft + (cx + offset.x) * zoom
      // Therefore: cx = (screenX - containerLeft) / zoom - offset.x
      const canvasX = (prevCenter.x - containerLeft) / currentZoom - currentOffset.x;
      const canvasY = (prevCenter.y - containerTop) / currentZoom - currentOffset.y;

      // New offset: same canvas point under NEW pinch center at NEW zoom
      // This naturally handles both zoom (distance change) and pan (center movement)
      const newOffsetX = (center.x - containerLeft) / newZoom - canvasX;
      const newOffsetY = (center.y - containerTop) / newZoom - canvasY;

      // Update refs synchronously first, then state (async)
      zoomRef.current = newZoom;
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;

      setZoom(newZoom);
      setCanvasOffset({ x: newOffsetX, y: newOffsetY });
    } else if (e.touches.length === 1 && !isPanning) {
      // Single touch - commit pending touch if exists, then continue drawing
      if (pendingTouchRef.current) {
        const { pos, ctx } = pendingTouchRef.current;
        setIsDrawing(true);
        setMoveCount(prev => prev + 1);
        drawingPathsRef.current.push({
          points: [pos],
          strokeWidth: BASE_STROKE_WIDTH,
        });
        drawSvgStamp(ctx, pos.x, pos.y, BASE_STROKE_WIDTH);
        pendingTouchRef.current = null;
      }

      if (!isDrawing && drawingPathsRef.current.length === 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      // Account for zoom in touch coordinates
      const pos = {
        x: (touch.clientX - rect.left) / zoom,
        y: (touch.clientY - rect.top) / zoom,
      };
      
      if (lastPointRef.current) {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = STROKE_OPACITY;
        
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
    }
  };

  const handleTouchEnd = () => {
    // If there's a pending touch that was never committed (tap without move),
    // commit it now as a single dot
    if (pendingTouchRef.current) {
      const { pos, ctx } = pendingTouchRef.current;
      setMoveCount(prev => prev + 1);
      drawingPathsRef.current.push({
        points: [pos],
        strokeWidth: BASE_STROKE_WIDTH,
      });
      drawSvgStamp(ctx, pos.x, pos.y, BASE_STROKE_WIDTH);
      pendingTouchRef.current = null;
    }

    setIsPanning(false);
    setIsDrawing(false);
    lastTouchDistanceRef.current = null;
    lastTouchCenterRef.current = null;
    lastPointRef.current = null;
    lastTimeRef.current = 0;
  };

  // Handle wheel events for trackpad two-finger panning and zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isDrawingEnabled) return;
    
    // Always prevent default to stop browser zoom and navigation
    e.preventDefault();
    e.stopPropagation();
    
    // Additional prevention for zoom gestures
    if (e.ctrlKey || e.metaKey) {
      e.nativeEvent.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    // Check if ctrl/cmd is pressed for zoom (trackpad pinch or cmd+scroll)
    if (e.ctrlKey || e.metaKey) {
      // For trackpad pinch, deltaY is the zoom amount
      // Use a more sensitive zoom calculation that responds to deltaY directly
      // Negative deltaY = zoom in, positive deltaY = zoom out
      const zoomSensitivity = 0.001; // Adjust for smooth trackpad zoom
      const zoomDelta = -e.deltaY * zoomSensitivity; // Invert: negative delta = zoom in
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + zoomDelta));
      
      // Get mouse position relative to viewport
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      
      // Container CSS: left: -canvasSize/3, top: -canvasSize/3
      const containerLeft = canvasSize > 0 ? -canvasSize / 3 : -window.innerHeight;
      const containerTop = canvasSize > 0 ? -canvasSize / 3 : -window.innerHeight;

      // CSS transform: scale(zoom) translate(offset.x, offset.y), origin 0 0
      // Screen position formula: screenX = containerLeft + (cx + offset.x) * zoom
      // Therefore: cx = (screenX - containerLeft) / zoom - offset.x
      const canvasX = (mouseX - containerLeft) / zoom - canvasOffset.x;
      const canvasY = (mouseY - containerTop) / zoom - canvasOffset.y;

      // New offset so same canvas point stays under cursor after zoom
      // newOffset.x = (screenX - containerLeft) / newZoom - cx
      const newOffsetX = (mouseX - containerLeft) / newZoom - canvasX;
      const newOffsetY = (mouseY - containerTop) / newZoom - canvasY;
      
      setZoom(newZoom);
      setCanvasOffset({
        x: newOffsetX,
        y: newOffsetY,
      });
    } else {
      // Pan the canvas (no modifier key)
      // Offset is in scaled space (CSS: scale then translate), so divide delta by zoom
      setCanvasOffset(prev => ({
        x: prev.x - e.deltaX / zoom,
        y: prev.y - e.deltaY / zoom,
      }));
    }
  };

  // Start drawing - mouse click and drag
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingEnabled) return;
    
    // Check if user has reached the move limit
    if (moveCount >= 5) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Start drawing on mouse click
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
    
    // Increment move count (one mouse click = one move)
    setMoveCount(prev => prev + 1);
    
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
    if (!isDrawingEnabled) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only draw if we're actually drawing
    if (!isDrawing) return;

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
    lastPointRef.current = null;
    lastTimeRef.current = 0;
  };

  // Reset the drawing (clear all drawn paths and reset zoom/pan)
  const handleReset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Clear all drawing paths
    drawingPathsRef.current = [];
    
    // Reset move count
    setMoveCount(0);
    
    // Reset zoom to default
    const defaultZoom = isMobile ? 0.8 : 1;
    setZoom(defaultZoom);
    zoomRef.current = defaultZoom;
    
    // Reset pan position to initial centered position
    setCanvasOffset(initialOffset);
    offsetRef.current = { ...initialOffset };
    
    // Clear the canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Capture the drawing and submit as SVG
  const handleSubmit = () => {
    if (isSubmitting) return; // Prevent double submission
    
    setIsSubmitting(true);
    
    const canvas = canvasRef.current;
    const shapeCanvas = shapeCanvasRef.current;
    
    if (!canvas || !shapeCanvas) {
      setIsSubmitting(false);
      return;
    }

    // Save SVG at smaller size (500x500) for gallery preview
    const svgSize = 500;
    
    // Create SVG that combines default shape and drawing
    // Scale down the canvases to save smaller SVG for gallery preview
    const createCombinedSVG = async (): Promise<string> => {
      // Create scaled-down temporary canvases
      const tempShapeCanvas = document.createElement('canvas');
      tempShapeCanvas.width = svgSize;
      tempShapeCanvas.height = svgSize;
      const tempShapeCtx = tempShapeCanvas.getContext('2d');
      if (tempShapeCtx) {
        // Scale down the shape canvas to fit in 500x500
        tempShapeCtx.drawImage(shapeCanvas, 0, 0, shapeCanvas.width, shapeCanvas.height, 0, 0, svgSize, svgSize);
      }
      
      const tempDrawingCanvas = document.createElement('canvas');
      tempDrawingCanvas.width = svgSize;
      tempDrawingCanvas.height = svgSize;
      const tempDrawingCtx = tempDrawingCanvas.getContext('2d');
      if (tempDrawingCtx) {
        // Scale down the drawing canvas to fit in 500x500
        tempDrawingCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, svgSize, svgSize);
      }
      
      // Get canvas data URLs (PNG supports transparency)
      const shapeDataUrl = tempShapeCanvas.toDataURL('image/png');
      const drawingDataUrl = tempDrawingCanvas.toDataURL('image/png');
      
      // Build SVG with transparent background at smaller size
      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">`;
      
      // Add shape canvas as background layer
      svgContent += `<image href="${shapeDataUrl}" x="0" y="0" width="${svgSize}" height="${svgSize}" />`;
      
      // Add drawing canvas as top layer
      svgContent += `<image href="${drawingDataUrl}" x="0" y="0" width="${svgSize}" height="${svgSize}" />`;
      
      svgContent += '</svg>';
      return svgContent;
    };
    
    // Create and submit SVG
    createCombinedSVG()
      .then(async (svgString) => {
        // Convert SVG to data URL for easy storage
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
        const reader = new FileReader();
        reader.onload = async () => {
          const svgDataUrl = reader.result as string;
          
          // Save to Supabase
          try {
            const { supabase } = await import('@/lib/supabase');
            const today = new Date().toISOString().split('T')[0];
            
            console.log('Attempting to save drawing to Supabase for date:', today);
            
            // Get today's daily_shape_id, or fall back to most recent daily shape
            let dailyShape;
            let shapeError;
            
            // First try to get today's shape
            const todayResult = await supabase
              .from('daily_shapes')
              .select('id')
              .eq('date', today)
              .maybeSingle();
            
            dailyShape = todayResult.data;
            shapeError = todayResult.error;
            
            // If no shape for today, get the most recent one
            if (!dailyShape && !shapeError) {
              console.log('No daily shape found for today, fetching most recent daily shape');
              const recentResult = await supabase
                .from('daily_shapes')
                .select('id')
                .order('date', { ascending: false })
                .limit(1)
                .maybeSingle();
              
              dailyShape = recentResult.data;
              shapeError = recentResult.error;
              
              if (dailyShape) {
                console.log('Using most recent daily shape:', dailyShape.id);
              }
            }
            
            if (shapeError) {
              console.error('Error fetching daily shape:', shapeError);
              console.error('Shape error details:', JSON.stringify(shapeError, null, 2));
              throw new Error(`Failed to fetch daily shape: ${shapeError.message}`);
            }
            
            console.log('Daily shape lookup result:', dailyShape);
            
            // Save drawing to user_drawings table
            if (dailyShape) {
              console.log('Saving drawing with daily_shape_id:', dailyShape.id);
              
              const insertData = {
                daily_shape_id: dailyShape.id,
                drawing_paths: {
                  svgString,
                  imageData: svgDataUrl,
                  drawingPaths: drawingPathsRef.current,
                },
              };
              
              console.log('Insert data:', { 
                daily_shape_id: insertData.daily_shape_id,
                hasSvgString: !!insertData.drawing_paths.svgString,
                hasImageData: !!insertData.drawing_paths.imageData,
                hasDrawingPaths: !!insertData.drawing_paths.drawingPaths,
              });
              
              const { data: insertedData, error: drawingError } = await supabase
                .from('user_drawings')
                .insert(insertData)
                .select();
              
              if (drawingError) {
                console.error('Error saving drawing to Supabase:', drawingError);
                console.error('Error details:', JSON.stringify(drawingError, null, 2));
                console.error('Error code:', drawingError.code);
                console.error('Error message:', drawingError.message);
                throw drawingError;
              }
              
              console.log('Drawing saved successfully to Supabase!', insertedData);
            } else {
              console.warn('No daily shape found for today:', today);
              console.warn('Drawing will not be saved to database.');
              console.warn('Please create a daily shape first.');
            }
          } catch (error: any) {
            console.error('Failed to save drawing to Supabase:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            console.error('Error type:', typeof error);
            console.error('Error constructor:', error?.constructor?.name);
            // Continue with local submission even if Supabase fails
          }
          
          onSubmit(svgDataUrl, '', undefined, svgString); // Pass both data URL and raw SVG string
          setIsSubmitting(false);
        };
        reader.onerror = () => {
          setIsSubmitting(false);
        };
        reader.readAsDataURL(svgBlob);
      })
      .catch((error) => {
        console.error('Failed to create SVG:', error);
        setIsSubmitting(false);
      });
  };

  return (
    <div 
      className="fixed inset-0 overflow-hidden" 
      style={{ 
        backgroundColor: '#F1F1F1',
        overscrollBehavior: 'none',
        overscrollBehaviorX: 'none',
        overscrollBehaviorY: 'none',
        touchAction: 'pan-x pan-y',
      }}
    >
      {/* Drawing section */}
      <div 
        className="absolute w-screen h-screen overflow-hidden"
        style={{ 
          backgroundColor: '#F1F1F1',
          left: 0,
          top: 0,
          overscrollBehavior: 'none',
          overscrollBehaviorX: 'none',
          overscrollBehaviorY: 'none',
          touchAction: 'pan-x pan-y',
        }}
      >
        {/* Grid background - covers entire viewport and beyond - dots don't scale */}
        <div
          className="fixed pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            width: '100vw',
            height: '100vh',
            left: 0,
            top: 0,
            zIndex: 0,
          }}
        />

        {/* Bottom section: text left with buttons below, moves right */}
        <div className="absolute bottom-16 left-0 right-0 z-20 px-12 pointer-events-none">
          <div className="flex items-end justify-between">
            {/* Left: Text and buttons */}
            <div className="flex flex-col">
              <div className="font-sans font-normal pointer-events-none" style={{ color: '#232323' }}>
                <div className="text-[28px] 2xl:text-[42px] mb-1">Draw and share</div>
                <div className="text-[14px] 2xl:text-[21px]" style={{ lineHeight: '1.4' }}>
                  Every day, a new shape.<br />
                  Draw something in 5 moves or less.<br />
                  Submit to see what others made.
                </div>
              </div>
              {/* Buttons under text */}
              <div className="flex items-center gap-6 pt-4 mt-2 pointer-events-auto">
                <button
                  onClick={handleReset}
                  disabled={moveCount === 0}
                  className="font-sans text-[16px] 2xl:text-[24px] underline cursor-pointer hover:opacity-70 transition-opacity text-left m-0 border-0 bg-transparent font-normal disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#232323', textUnderlineOffset: '0.3em' }}
                >
                  Reset Canvas
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || moveCount === 0}
                  className="font-sans text-[16px] 2xl:text-[24px] underline cursor-pointer hover:opacity-70 transition-opacity text-left m-0 border-0 bg-transparent font-normal disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#232323', textUnderlineOffset: '0.3em' }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
            
            {/* Right: Move counter */}
            <div 
              className="font-sans text-[16px] 2xl:text-[24px] font-normal pointer-events-none"
              style={{ color: '#232323' }}
            >
              {moveCount}/5 Moves
            </div>
          </div>
        </div>


        {/* Canvas container with transform - 300vh x 300vh (100vh on each side) */}
        <div
          className="absolute"
          style={{
            width: canvasSize > 0 ? `${canvasSize}px` : '300vh',
            height: canvasSize > 0 ? `${canvasSize}px` : '300vh',
            left: canvasSize > 0 ? `${-canvasSize / 3}px` : '-100vh',
            top: canvasSize > 0 ? `${-canvasSize / 3}px` : '-100vh',
            transform: `scale(${zoom}) translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
            transformOrigin: '0 0',
            cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z\' fill=\'%231a1818\'/%3E%3C/svg%3E") 2 22, auto',
            userSelect: 'none',
            overscrollBehavior: 'none',
            overscrollBehaviorX: 'none',
            overscrollBehaviorY: 'none',
            touchAction: 'pan-x pan-y',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          {/* Shape canvas (base layer) - displays default shape */}
          <canvas
            ref={shapeCanvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1 }}
          />
          
          {/* Drawing canvas (interactive layer) - full size of container */}
          <canvas
            ref={canvasRef}
            className="absolute"
            style={{ 
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              zIndex: 2,
              cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z\' fill=\'%231a1818\'/%3E%3C/svg%3E") 2 22, auto',
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => {
              e.stopPropagation(); // Prevent container from handling this
              handleMouseDown(e);
            }}
            onMouseMove={(e) => {
              e.stopPropagation(); // Prevent container from handling this
              handleMouseMove(e);
            }}
            onMouseUp={(e) => {
              e.stopPropagation(); // Prevent container from handling this
              handleMouseUp();
            }}
            onMouseLeave={(e) => {
              e.stopPropagation(); // Prevent container from handling this
              handleMouseLeave();
            }}
            onContextMenu={(e) => e.preventDefault()} // Prevent context menu on right click
          />
        </div>
      </div>
    </div>
  );
}
