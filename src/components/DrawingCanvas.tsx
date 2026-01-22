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
  onOpenShapeCreator?: () => void;
}

// Simple crayon drawing - no sticky notes

export function DrawingCanvas({ onSubmit, existingSubmissions = [], onOpenShapeCreator }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isKeyPressed, setIsKeyPressed] = useState(false); // Track if key is pressed for drawing
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Pan offset for page navigation (homepage <-> drawing area)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 }); // Pan offset for drawing canvas (for panning within drawing area)
  const [isTransitioning, setIsTransitioning] = useState(false); // Track if transitioning between pages
  const [zoom, setZoom] = useState(1); // Zoom level (1 = 100%)
  const zoomRef = useRef(1); // Ref to track current zoom for gesture handlers
  const offsetRef = useRef({ x: 0, y: 0 }); // Ref to track current canvasOffset for gesture handlers
  const lastTouchDistanceRef = useRef<number | null>(null); // For two-finger panning/zooming
  const lastTouchCenterRef = useRef<Point | null>(null); // For two-finger panning
  const lastGestureScaleRef = useRef<number>(1); // For trackpad gesture zoom
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
  
  // Zoom settings
  const MIN_ZOOM = 0.1; // 10%
  const MAX_ZOOM = 4; // 400%
  
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

  // Draw the default shape (loaded from localStorage)
  const drawShape = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    // Load default shape from localStorage
    const defaultShapeData = localStorage.getItem('defaultShape');
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
    if (!isDrawingEnabled) return;
    
    // The canvas is 300vh x 300vh, positioned at -100vh, -100vh
    // The shape is drawn at the center of the canvas (150vh, 150vh in canvas coords)
    // Canvas container position: left: -100vh, top: -100vh
    // Shape position in viewport (before transform): 
    //   X: -100vh + 150vh = 50vh = viewportHeight * 0.5
    //   Y: -100vh + 150vh = 50vh = viewportHeight * 0.5
    // Viewport center: (viewportWidth/2, viewportHeight/2)
    // To center the shape, we need to offset by:
    //   offsetX = viewportWidth/2 - (viewportHeight * 0.5)
    //   offsetY = viewportHeight/2 - (viewportHeight * 0.5) = 0
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;
    
    // Shape position in viewport before offset (50vh = viewportHeight * 0.5)
    const shapeXInViewport = viewportHeight * 0.5;
    const shapeYInViewport = viewportHeight * 0.5;
    
    // Calculate offset to center the shape
    const offsetX = viewportCenterX - shapeXInViewport;
    const offsetY = viewportCenterY - shapeYInViewport;
    
    setCanvasOffset({ x: offsetX, y: offsetY });
  }, [isDrawingEnabled]);

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
      const canvasSize = viewportHeight * 3; // 300vh = 3 * 100vh
      
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
      drawShape(shapeCtx, canvasSize, canvasSize);
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
      
      // Get the container element to calculate proper coordinates
      // The container is the parent of the canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      
      // Calculate gesture position relative to container's current position
      const mouseRelX = gestureX - containerRect.left;
      const mouseRelY = gestureY - containerRect.top;
      
      // Calculate the point in canvas space (before zoom)
      const canvasX = (mouseRelX - currentOffset.x) / currentZoom;
      const canvasY = (mouseRelY - currentOffset.y) / currentZoom;
      
      // Adjust canvasOffset so that canvasPoint appears at the same screen position after zoom
      const newOffsetX = mouseRelX - canvasX * newZoom;
      const newOffsetY = mouseRelY - canvasY * newZoom;
      
      setZoom(newZoom);
      setCanvasOffset({
        x: newOffsetX,
        y: newOffsetY,
      });
      
      lastGestureScaleRef.current = currentScale;
    };

    const handleGestureEnd = (e: Event) => {
      if (!isDrawingEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      lastGestureScaleRef.current = 1;
    };

    // Use passive: false to allow preventDefault
    document.addEventListener('wheel', preventBrowserZoom as EventListener, { passive: false });
    document.addEventListener('touchstart', preventBrowserZoom as EventListener, { passive: false });
    document.addEventListener('touchmove', preventBrowserZoom as EventListener, { passive: false });
    document.addEventListener('gesturestart', handleGestureStart, { passive: false });
    document.addEventListener('gesturechange', handleGestureChange, { passive: false });
    document.addEventListener('gestureend', handleGestureEnd, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventBrowserZoom as EventListener);
      document.removeEventListener('touchstart', preventBrowserZoom as EventListener);
      document.removeEventListener('touchmove', preventBrowserZoom as EventListener);
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
        setIsKeyPressed(true);
        setIsPanning(false); // Stop panning when key is pressed
      }
    };

    const handleKeyUp = () => {
      setIsKeyPressed(false);
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
      // Two-finger panning - prevent browser zoom
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      setIsPanning(true);
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;
      setPanStart({
        x: center.x - canvasOffset.x,
        y: center.y - canvasOffset.y,
      });
    } else if (e.touches.length === 1) {
      // Single touch = drawing
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
      
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = STROKE_OPACITY;
      
      setIsDrawing(true);
      lastPointRef.current = pos;
      lastTimeRef.current = Date.now();
      
      drawingPathsRef.current.push({
        points: [pos],
        strokeWidth: BASE_STROKE_WIDTH,
      });
      
      drawSvgStamp(ctx, pos.x, pos.y, BASE_STROKE_WIDTH);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDrawingEnabled) return;
    
    if (e.touches.length === 2 && isPanning) {
      // Two-finger gesture - prevent browser navigation/zoom
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      
      // Check if this is a pinch zoom (distance changed significantly)
      if (lastTouchDistanceRef.current !== null) {
        const distanceDelta = distance - lastTouchDistanceRef.current;
        const zoomDelta = distanceDelta / 100; // Adjust sensitivity
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + zoomDelta));
        
        if (Math.abs(distanceDelta) > 5) {
          // Significant distance change = zoom towards center of pinch
          // Get center point between two touches (in viewport coordinates)
          const centerX = center.x;
          const centerY = center.y;
          
          // Get the container element to calculate proper coordinates
          const canvas = canvasRef.current;
          if (!canvas) return;
          const container = canvas.parentElement;
          if (!container) return;
          
          const containerRect = container.getBoundingClientRect();
          
          // Calculate center position relative to container's current position
          const centerRelX = centerX - containerRect.left;
          const centerRelY = centerY - containerRect.top;
          
          // Calculate the center position in canvas space (before zoom)
          // canvasPoint = (centerPos - canvasOffset) / currentZoom
          const canvasX = (centerRelX - canvasOffset.x) / zoom;
          const canvasY = (centerRelY - canvasOffset.y) / zoom;
          
          // Adjust canvasOffset so that canvasPoint appears at the same screen position after zoom
          // newCanvasOffset = centerPos - (canvasPoint * newZoom)
          const newOffsetX = centerRelX - canvasX * newZoom;
          const newOffsetY = centerRelY - canvasY * newZoom;
          
          setZoom(newZoom);
          setCanvasOffset({
            x: newOffsetX,
            y: newOffsetY,
          });
          lastTouchDistanceRef.current = distance;
          return;
        }
      }
      
      // Otherwise, pan the canvas
      const viewportHeight = window.innerHeight;
      const maxOffset = viewportHeight * 1; // 100vh
      const minOffset = -viewportHeight * 1; // -100vh
      
      setCanvasOffset({
        x: Math.max(minOffset, Math.min(maxOffset, center.x - panStart.x)),
        y: Math.max(minOffset, Math.min(maxOffset, center.y - panStart.y)),
      });
      
      lastTouchDistanceRef.current = distance;
    } else if (e.touches.length === 1 && isDrawing) {
      // Single touch = drawing
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
      
      // Get the container element to calculate proper coordinates
      // The container is the element that the wheel event is attached to
      const container = e.currentTarget;
      const containerRect = container.getBoundingClientRect();
      
      // Calculate mouse position relative to container's current position
      // getBoundingClientRect() already accounts for the CSS transform (translate + scale)
      const mouseRelX = mouseX - containerRect.left;
      const mouseRelY = mouseY - containerRect.top;
      
      // Calculate the point in canvas space (before zoom)
      // canvasPoint = (mousePos - canvasOffset) / currentZoom
      const canvasX = (mouseRelX - canvasOffset.x) / zoom;
      const canvasY = (mouseRelY - canvasOffset.y) / zoom;
      
      // Adjust canvasOffset so that canvasPoint appears at the same screen position after zoom
      // newCanvasOffset = mousePos - (canvasPoint * newZoom)
      const newOffsetX = mouseRelX - canvasX * newZoom;
      const newOffsetY = mouseRelY - canvasY * newZoom;
      
      setZoom(newZoom);
      setCanvasOffset({
        x: newOffsetX,
        y: newOffsetY,
      });
    } else {
      // Pan the canvas (no modifier key)
      // Limit panning to keep canvas within bounds (100vh on each side)
      const viewportHeight = window.innerHeight;
      const maxOffset = viewportHeight * 1; // 100vh
      const minOffset = -viewportHeight * 1; // -100vh
      
      setCanvasOffset(prev => ({
        x: Math.max(minOffset, Math.min(maxOffset, prev.x - e.deltaX)),
        y: Math.max(minOffset, Math.min(maxOffset, prev.y - e.deltaY)),
      }));
    }
  };

  // Start drawing - mouse click and drag
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingEnabled) return;
    
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
          transition: isTransitioning ? 'none' : 'transform 0.1s ease-out',
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
            pointerEvents: shouldSlideUp ? 'none' : 'auto',
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
            style={{ width: '100vw', height: '100vh', transform: 'translateY(-5%)' }}
          />
        </div>

                      {/* Large centered text in EB Garamond */}
                      <div className="absolute inset-0 flex items-center justify-center z-1 pointer-events-none">
                        <div className="font-serif text-[130px] font-normal leading-none tracking-tight text-center max-w-5xl px-12" style={{ color: '#232323' }}>
                        The constraint is the point.
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
              setIsTransitioning(true);
              
              // Animate offset to pan to drawing area (200vh upwards)
              // Drawing area is positioned at top: '200vh', so we need to pan by -200vh
              const viewportHeight = window.innerHeight;
              const targetOffsetY = -viewportHeight * 2; // -200vh (200vh in pixels)
              
              // Smooth transition over 800ms
              const startTime = Date.now();
              const duration = 800;
              const startOffsetY = offset.y;
              
              const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Use cubic-bezier easing (0.4, 0, 0.2, 1) - ease-in-out
                const ease = progress < 0.5
                  ? 2 * progress * progress
                  : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                const currentOffsetY = startOffsetY + (targetOffsetY - startOffsetY) * ease;
                setOffset({ x: 0, y: currentOffsetY });
                
                if (progress < 1) {
                  requestAnimationFrame(animate);
                } else {
                  setIsTransitioning(false);
                  setShouldSlideUp(true);
                }
              };
              
              requestAnimationFrame(animate);
            }}
          >
            Start Today's Challenge
          </a>
        </div>
      </div>

      {/* Drawing section - positioned at y: 200vh */}
      <div 
        className="absolute w-screen h-screen overflow-hidden"
        style={{ 
          backgroundColor: '#F1F1F1',
          left: 0,
          top: '200vh',
          pointerEvents: shouldSlideUp ? 'auto' : 'none',
        }}
      >
        {/* Grid background - 300vh x 300vh (100vh on each side) - dots don't scale */}
        <div
          className="absolute pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            width: '300vh',
            height: '300vh',
            left: '-100vh',
            top: '-100vh',
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
            zIndex: 0,
          }}
        />

        {/* Zoom level indicator */}
        <div className="absolute top-16 right-12 z-20 pointer-events-none">
          <div className="font-sans text-[12px] font-normal" style={{ color: '#232323' }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Rules in bottom left */}
        <div className="absolute bottom-16 left-12 z-20">
          <div className="font-sans text-[24px] font-normal mb-1 pointer-events-none" style={{ color: '#232323' }}>
            Vibeform
          </div>
          <div className="font-sans text-[12px] font-normal pointer-events-none mb-2" style={{ color: '#232323', lineHeight: '1.4', maxWidth: '300px' }}>
            Every day, everyone gets the same shape. Draw something from it, and submit and see what others made
          </div>
          {onOpenShapeCreator && (
            <button
              onClick={onOpenShapeCreator}
              className="font-sans text-[10px] underline cursor-pointer hover:opacity-70 transition-opacity text-left p-0 m-0 border-0 bg-transparent font-normal mt-2"
              style={{ color: '#232323', opacity: 0.5 }}
            >
              Create Shape (Admin)
            </button>
          )}
        </div>


        {/* Canvas container with transform - 300vh x 300vh (100vh on each side) */}
        <div
          className="absolute"
          style={{
            width: '300vh',
            height: '300vh',
            left: '-100vh',
            top: '-100vh',
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z\' fill=\'%231a1818\'/%3E%3C/svg%3E") 2 22, auto',
            userSelect: 'none',
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
              setIsHovering(true);
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
    </div>
  );
}
