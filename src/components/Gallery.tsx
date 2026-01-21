import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const DRAWING_SIZE = 800; // Size for drawings in gallery

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

export function Gallery({ submissions, onAddSubmission, onNewDrawing }: GalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Handle panning
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking on background, not on a card
    const target = e.target as HTMLElement;
    if (e.button === 0 && !target.closest('.sticky-note-card')) {
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

  // Calculate initial offset to center the board on first load
  useEffect(() => {
    if (submissions.length > 0 && offset.x === 0 && offset.y === 0) {
      // Find the bounds of all submissions
      const minX = Math.min(...submissions.map(s => s.x));
      const minY = Math.min(...submissions.map(s => s.y));
      const maxX = Math.max(...submissions.map(s => s.x + DRAWING_SIZE));
      const maxY = Math.max(...submissions.map(s => s.y + DRAWING_SIZE));
      
      // Center the board in viewport
      const boardWidth = maxX - minX;
      const boardHeight = maxY - minY;
      const centerX = (window.innerWidth - boardWidth) / 2 - minX;
      const centerY = (window.innerHeight - boardHeight) / 2 - minY;
      
      setOffset({ x: centerX, y: centerY });
    }
  }, [submissions.length]);

  return (
    <div
      ref={containerRef}
      className="gallery-container relative w-full h-screen overflow-hidden"
      style={{
        cursor: isPanning ? 'grabbing' : 'grab',
        backgroundColor: '#fafbfc',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Dot grid background - infinite canvas - more subtle */}
      <div
        className="absolute"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          width: '500%',
          height: '500%',
          left: '-200%',
          top: '-200%',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      />
      
      {/* Description in top left - modern typography */}
      <div className="absolute top-12 left-12 z-20 pointer-events-none">
        <div className="font-sans text-[13px] text-gray-600 leading-relaxed tracking-tight">
          <div className="font-semibold text-gray-900 mb-1">Shape of the Day</div>
          <div className="text-gray-500">Pan around to explore submissions</div>
        </div>
      </div>
      
      {/* Submissions */}
      <div
        className="absolute"
        style={{
          width: '100%',
          height: '100%',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      >
        {submissions.map((submission) => (
          <DrawingCard key={submission.id} submission={submission} />
        ))}
      </div>
      
      {/* New Drawing button - modern styling */}
      <div className="absolute top-12 right-12 z-20">
        <Button 
          onClick={onNewDrawing} 
          size="lg"
          className="shadow-lg hover:shadow-xl transition-all"
        >
          New Drawing
        </Button>
      </div>
    </div>
  );
}

interface DrawingCardProps {
  submission: Submission;
}

function DrawingCard({ submission }: DrawingCardProps) {
  const [rotation] = useState(() => (Math.random() - 0.5) * 3); // Random rotation

  return (
    <div
      className="drawing-card absolute pointer-events-auto"
      style={{
        left: `${submission.x}px`,
        top: `${submission.y}px`,
        width: `${DRAWING_SIZE}px`,
        height: `${DRAWING_SIZE}px`,
        transform: `rotate(${rotation}deg)`,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = `rotate(0deg) scale(1.05)`;
        e.currentTarget.style.zIndex = '10';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `rotate(${rotation}deg) scale(1)`;
        e.currentTarget.style.zIndex = '1';
      }}
      onMouseDown={(e) => {
        e.stopPropagation(); // Prevent panning when clicking on card
      }}
    >
      {/* Drawing image - simple, no container */}
      <img
        src={submission.imageData}
        alt="Drawing"
        className="w-full h-full object-contain"
        style={{
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))',
        }}
      />
    </div>
  );
}
