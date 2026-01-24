import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
}

// Create Supabase client with minimal configuration
// The client automatically adds required headers (apikey, Authorization)
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Database types
export interface DailyShape {
  id: string;
  created_at: string;
  date: string;
  shape_data: string;
}

export interface UserDrawing {
  id: string;
  created_at: string;
  daily_shape_id: string;
  drawing_paths: {
    svgString?: string;
    imageData?: string;
    drawingPaths?: any[];
  };
}
