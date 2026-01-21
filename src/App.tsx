import { useState, useMemo } from 'react';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import { Gallery } from '@/components/Gallery';

interface Submission {
  id: string;
  imageData: string;
  author: string;
  note: string;
  x: number;
  y: number;
}

const DRAWING_SIZE = 800;
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

export function App() {
  const [mode, setMode] = useState<'drawing' | 'gallery'>('drawing');
  const [submissions, setSubmissions] = useState<Submission[]>([]);

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

  const handleSubmit = (imageData: string, note: string) => {
    const newSubmission: Submission = {
      id: Date.now().toString(),
      imageData,
      author: 'Prakhar', // Could be made dynamic later
      note,
      x: 0, // Will be calculated by board position
      y: 0, // Will be calculated by board position
    };
    
    setSubmissions((prev) => [...prev, newSubmission]);
    setMode('gallery');
  };

  const handleAddSubmission = (submission: Submission) => {
    setSubmissions((prev) => [...prev, submission]);
  };

  const handleNewDrawing = () => {
    setMode('drawing');
  };

  if (mode === 'drawing') {
    return <DrawingCanvas onSubmit={handleSubmit} existingSubmissions={submissionsWithPositions} />;
  }

  return (
    <Gallery 
      submissions={submissionsWithPositions} 
      onAddSubmission={handleAddSubmission}
      onNewDrawing={handleNewDrawing}
    />
  );
}

export default App;
