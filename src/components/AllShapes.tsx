import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface DailyShapeRecord {
  id: string;
  date: string;
  shape_data: string;
}

const ACCESS_STORAGE_KEY = 'adminAuthed';

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function AllShapes() {
  const navigate = useNavigate();
  const requiredPassword = import.meta.env.VITE_DELETE_PASSWORD as string | undefined;
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(() => sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'true');
  const [isLoading, setIsLoading] = useState(false);
  const [shapes, setShapes] = useState<DailyShapeRecord[]>([]);

  const today = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const loadShapes = async () => {
      setIsLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('daily_shapes')
        .select('id, date, shape_data')
        .lte('date', today)
        .order('date', { ascending: false });

      if (fetchError) {
        setError('Could not load shapes right now.');
        setShapes([]);
      } else {
        setShapes(data || []);
      }

      setIsLoading(false);
    };

    loadShapes().catch(() => {
      setError('Could not load shapes right now.');
      setIsLoading(false);
    });
  }, [isAuthorized, today]);

  const handleUnlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requiredPassword) {
      setError('Missing VITE_DELETE_PASSWORD env var.');
      return;
    }

    if (password.trim() !== requiredPassword) {
      setError('Incorrect password.');
      return;
    }

    sessionStorage.setItem(ACCESS_STORAGE_KEY, 'true');
    setIsAuthorized(true);
    setPassword('');
    setError('');
  };

  const handleLock = () => {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    setIsAuthorized(false);
    setShapes([]);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#f1f1f1] text-[#232323] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#232323]/10 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold mb-2">all-shapes</h1>
          <p className="text-sm text-[#232323]/70 mb-5">Enter password to view all daily shapes through {today}.</p>
          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#232323]/20 px-3 py-2 text-sm outline-none focus:border-[#232323]"
              placeholder="Password"
              autoFocus
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-[#232323] text-white py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Unlock
            </button>
          </form>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full mt-3 rounded-lg border border-[#232323]/20 py-2 text-sm hover:bg-[#f7f7f7] transition-colors"
          >
            Back Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-[#232323] p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold">all-shapes</h1>
            <p className="text-sm text-[#232323]/70 mt-1">
              {isLoading ? 'Loading...' : `${shapes.length} shape day${shapes.length === 1 ? '' : 's'} through ${today}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg border border-[#232323]/20 px-4 py-2 text-sm hover:bg-white transition-colors"
            >
              Home
            </button>
            <button
              type="button"
              onClick={handleLock}
              className="rounded-lg bg-[#232323] text-white px-4 py-2 text-sm hover:opacity-90 transition-opacity"
            >
              Lock
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {!isLoading && shapes.length === 0 && !error && (
          <p className="text-sm text-[#232323]/70">No saved daily shapes yet.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {shapes.map((shape) => (
            <article key={shape.id} className="bg-white rounded-xl border border-[#232323]/10 overflow-hidden shadow-sm">
              <div className="aspect-square bg-[#f6f6f6]">
                <img src={shape.shape_data} alt={`Shape ${shape.date}`} className="h-full w-full object-contain" />
              </div>
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{shape.date}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
