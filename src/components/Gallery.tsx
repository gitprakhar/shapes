import { useRef, useState, useEffect } from 'react';

const DRAWING_SIZE = 800; // Size for drawings in gallery
const SUBMISSIONS_STORAGE_KEY = 'drawingSubmissions';
const GAP = 40; // Gap between drawings

interface Submission {
  id: string;
  imageData: string;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>(propSubmissions);

  // Load all submissions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setAllSubmissions(parsed);
      }
    } catch (error) {
      console.error('Failed to load submissions from localStorage:', error);
    }
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

  // Calculate canvas dimensions based on number of submissions
  const canvasWidth = allSubmissions.length > 0 
    ? allSubmissions.length * DRAWING_SIZE + (allSubmissions.length - 1) * GAP
    : DRAWING_SIZE;
  const canvasHeight = DRAWING_SIZE;

  // Draw all submissions on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allSubmissions.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up canvas with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Starting position (drawings start at x: 0, centered vertically)
    const startX = 0;
    const startY = 0;

    // Load and draw each submission
    let loadedCount = 0;
    const images: HTMLImageElement[] = [];

    allSubmissions.forEach((submission) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === allSubmissions.length) {
          // All images loaded, redraw canvas
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          images.forEach((image, imgIndex) => {
            const x = startX + imgIndex * (DRAWING_SIZE + GAP);
            ctx.drawImage(image, x, startY, DRAWING_SIZE, DRAWING_SIZE);
          });
        }
      };
      img.onerror = () => {
        console.error('Failed to load submission image:', submission.id);
        loadedCount++;
      };
      img.src = submission.imageData;
      images.push(img);
    });

    // Center the canvas in the viewport
    if (allSubmissions.length > 0 && offset.x === 0 && offset.y === 0) {
      const centerX = (window.innerWidth - canvasWidth) / 2;
      const centerY = (window.innerHeight - canvasHeight) / 2;
      setOffset({ x: centerX, y: centerY });
    }
  }, [allSubmissions, canvasWidth, canvasHeight]);

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
      
      {/* Canvas with all submitted drawings - sized to fit the drawings */}
      <canvas
        ref={canvasRef}
        className="absolute"
        style={{
          left: 0,
          top: 0,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      />
    </div>
  );
}
