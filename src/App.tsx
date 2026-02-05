import { useState, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Homepage } from '@/components/Homepage';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import { Gallery } from '@/components/Gallery';
import { ShapeCreator } from '@/components/ShapeCreator';
import { DeleteDrawings } from '@/components/DeleteDrawings';
import { Collage } from '@/components/Collage';
import { Analytics } from '@vercel/analytics/react';

interface Point {
  x: number;
  y: number;
}

interface DrawingPath {
  points: Point[];
  strokeWidth: number;
}

interface Submission {
  id: string;
  imageData?: string;
  drawingPaths?: DrawingPath[];
  svgString?: string; // Full SVG combining shape + drawing
  author: string;
  note: string;
  x: number;
  y: number;
}

const SUBMISSIONS_STORAGE_KEY = 'drawingSubmissions';

const GRID_SPACING = 900; // Space between drawings (800px + 100px gap)
const GRID_OFFSET_X = 200; // Starting X offset
const GRID_OFFSET_Y = 200; // Starting Y offset

// Calculate board-like positions for submissions
const calculateBoardPosition = (index: number, total: number): { x: number; y: number } => {
  // Calculate grid dimensions
  const cols = Math.ceil(Math.sqrt(total));
  const row = Math.floor(index / cols);
  const col = index % cols;
  
  // Add slight randomness for organic board feel (max 30px offset)
  const randomX = (Math.random() - 0.5) * 30;
  const randomY = (Math.random() - 0.5) * 30;
  
  return {
    x: GRID_OFFSET_X + col * GRID_SPACING + randomX,
    y: GRID_OFFSET_Y + row * GRID_SPACING + randomY,
  };
};

function AppContent() {
  // Load submissions from localStorage on mount
  const [submissions, setSubmissions] = useState<Submission[]>(() => {
    try {
      const stored = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const navigate = useNavigate();

  // Save submissions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(submissions));
    } catch (error) {
      // Failed to save to localStorage
    }
  }, [submissions]);

  // Calculate positions for all submissions in board pattern
  const submissionsWithPositions = useMemo(() => {
    return submissions.map((submission, index) => {
      const position = calculateBoardPosition(index, submissions.length);
      return {
        ...submission,
        x: submission.x || position.x,
        y: submission.y || position.y,
      };
    });
  }, [submissions]);

  const handleSubmit = (imageData: string, note: string, drawingPaths?: DrawingPath[], svgString?: string) => {
    const newSubmission: Submission = {
      id: Date.now().toString(),
      imageData, // Keep for backward compatibility
      drawingPaths, // Keep for backward compatibility
      svgString, // Full SVG combining shape + drawing
      author: 'Prakhar', // Could be made dynamic later
      note,
      x: 0, // Will be calculated by board position
      y: 0, // Will be calculated by board position
    };
    
    setSubmissions((prev) => [...prev, newSubmission]);
    navigate('/gallery');
  };

  const handleAddSubmission = (submission: Submission) => {
    setSubmissions((prev) => [...prev, submission]);
  };

  const handleNewDrawing = () => {
    navigate('/draw');
  };

  const handleShapeSaved = () => {
    // Shape is saved to localStorage in ShapeCreator, navigate back to home
    navigate('/');
  };

  const handleBackFromCreator = () => {
    navigate('/');
  };

  return (
    <Routes>
      <Route 
        path="/" 
        element={<Homepage />} 
      />
      <Route 
        path="/draw" 
        element={<DrawingCanvas onSubmit={handleSubmit} />} 
      />
      <Route 
        path="/create-shape" 
        element={<ShapeCreator onSave={handleShapeSaved} onBack={handleBackFromCreator} />} 
      />
      <Route 
        path="/gallery" 
        element={
          <Gallery 
            submissions={submissionsWithPositions} 
            onAddSubmission={handleAddSubmission}
            onNewDrawing={handleNewDrawing}
          />
        } 
      />
      <Route 
        path="/delete-drawings" 
        element={<DeleteDrawings />} 
      />
      <Route 
        path="/collage" 
        element={<Collage />} 
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
      <Analytics />
    </BrowserRouter>
  );
}

export default App;
