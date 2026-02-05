import { useEffect, useMemo, useState } from 'react';

const drawings = [
  'drawing-004e7743-7efb-4293-bbaa-9864d78769ad.png',
  'drawing-0c29a8f0-2a5b-4585-98bf-9d75c2bdb1fa.png',
  'drawing-1186298c-4caa-4d1e-856b-269423f4fbfd.png',
  'drawing-15d8d5de-4445-46d0-80c2-e9aa25b49af5.png',
  'drawing-17e1547b-1cc3-4fa4-86a2-5599fd03663b.png',
  'drawing-1cd5e126-acc3-4675-86f7-15e4391ebedd.png',
  'drawing-1e024cca-90f3-4c03-a55f-17e43f049cbb.png',
  'drawing-33fb3c45-d245-43fa-8e09-f473e61ea55b.png',
  'drawing-3e6eb91c-8d68-46db-ab67-1d2364c4889d.png',
  'drawing-50f91182-3ca5-4824-a6ef-1a00453470b4.png',
  'drawing-5cfab681-e9f6-4bd9-b0ad-f9c83c7a3247.png',
  'drawing-6ce3e345-9468-44be-9cf1-65d0e90b4cf3.png',
  'drawing-6d97e792-d4f9-4884-a9ef-66e37548c731.png',
  'drawing-71669855-efd1-4bf8-acfb-c4b6f59e6447.png',
  'drawing-71df31de-4a02-47b3-b959-061bf7772182.png',
  'drawing-766ba641-e493-4135-91fc-c180d13a8888.png',
  'drawing-7ebc0737-eeea-4929-b950-3753575903bd.png',
  'drawing-83a52269-32a7-423b-a43b-f3ac27a6f08a.png',
  'drawing-9b906baf-4d25-4207-b79f-2ba2357c19d4.png',
  'drawing-bc41de95-0c34-4437-bb36-946011e48607.png',
  'drawing-c08bb3a1-7fd4-4444-9d6b-a11b2d607f29.png',
  'drawing-c6e0ee71-0643-4aeb-a28e-839a32f3aac7.png',
  'drawing-d2aed37d-1fbb-4986-b6ed-d644c601f2de.png',
  'drawing-dc24ee4f-c642-4872-a485-097017213972.png',
  'drawing-eb21723d-6e30-4d80-a33b-92806944bab8.png',
  'drawing-ecf2046d-8f84-49c6-b0eb-350d23ac1f53.png',
  'drawing-95248a2b-edd7-46fa-9af4-edc5092df2a4.png',
  'drawing-fa37af77-4268-4926-9a70-7418ca882778.png',
];

const MIN_TILE = 140;
const MAX_TILE = 200;
const HERO_SPAN = 2;
const GRID_GAP = 4;

export function Collage() {
  const [password, setPassword] = useState('');
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem('adminAuthed') === 'true');
  const [authError, setAuthError] = useState('');
  const requiredPassword = import.meta.env.VITE_DELETE_PASSWORD as string | undefined;

  const handleAuth = () => {
    if (!requiredPassword) {
      setAuthError('Missing VITE_DELETE_PASSWORD env var.');
      return;
    }
    if (password.trim() !== requiredPassword) {
      setAuthError('Incorrect password.');
      return;
    }
    sessionStorage.setItem('adminAuthed', 'true');
    setIsAuthed(true);
    setAuthError('');
  };

  if (!isAuthed) {
    return (
      <div
        className="relative w-full h-screen overflow-hidden"
        style={{
          backgroundColor: '#F1F1F1',
          userSelect: 'none',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            style={{
              width: 'min(360px, 90vw)',
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.08)',
              padding: '24px',
            }}
          >
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '16px', marginBottom: '10px' }}>
              Enter password to access collage
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={{
                width: '100%',
                height: '40px',
                border: '1px solid rgba(0,0,0,0.2)',
                padding: '0 10px',
                fontSize: '14px',
                marginBottom: '12px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleAuth}
              style={{
                width: '100%',
                height: '40px',
                background: '#111',
                color: '#fff',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Unlock
            </button>
            {authError ? (
              <div style={{ marginTop: '10px', color: '#B3261E', fontSize: '12px' }}>
                {authError}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  const [grid, setGrid] = useState({ cols: 6, rows: 6, tile: 150 });

  useEffect(() => {
    const updateGrid = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const targetTile = Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor(w / 7)));
      let cols = Math.max(4, Math.floor(w / targetTile));
      let rows = Math.max(4, Math.floor(h / targetTile));
      if (cols % 2 === 1) cols -= 1;
      if (rows % 2 === 1) rows -= 1;
      cols = Math.max(4, cols);
      rows = Math.max(4, rows);
      setGrid({ cols, rows, tile: targetTile });
    };

    updateGrid();
    window.addEventListener('resize', updateGrid);
    return () => window.removeEventListener('resize', updateGrid);
  }, []);

  const { cols, rows, tile } = grid;
  const heroStartCol = Math.max(0, Math.floor((cols - HERO_SPAN) / 2));
  const heroStartRow = Math.max(0, Math.floor((rows - HERO_SPAN) / 2));
  const gridWidth = cols * tile + (cols - 1) * GRID_GAP;
  const gridHeight = rows * tile + (rows - 1) * GRID_GAP;

  const slots = useMemo(() => {
    const reserved = new Set<string>();
    for (let r = heroStartRow; r < heroStartRow + HERO_SPAN; r += 1) {
      for (let c = heroStartCol; c < heroStartCol + HERO_SPAN; c += 1) {
        reserved.add(`${r}-${c}`);
      }
    }

    const next: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (reserved.has(`${r}-${c}`)) continue;
        next.push({ row: r, col: c });
      }
    }
    return next;
  }, [cols, rows, heroStartCol, heroStartRow]);

  const tiles = useMemo(() => {
    const totalSlots = slots.length;
    const images = drawings.slice(0, totalSlots);
    const remaining = Math.max(0, totalSlots - images.length);
    return {
      images,
      pinkCount: remaining,
    };
  }, [slots.length]);

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{
        backgroundColor: '#F1F1F1',
        userSelect: 'none',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${gridWidth}px`,
          height: `${gridHeight}px`,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${tile}px)`,
          gridTemplateRows: `repeat(${rows}, ${tile}px)`,
          gap: `${GRID_GAP}px`,
        }}
      >
        <div
          style={{
            gridColumn: `${heroStartCol + 1} / span ${HERO_SPAN}`,
            gridRow: `${heroStartRow + 1} / span ${HERO_SPAN}`,
            backgroundColor: '#F8F8F8',
            boxShadow: 'none',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          <img
            src="/firstday_drawings/drawing-shape-of-day.png"
            alt="Shape of the day"
            style={{
              width: '88%',
              height: '88%',
              objectFit: 'contain',
            }}
          />
        </div>

        {slots.map((slot, index) => {
          const isImage = index < tiles.images.length;
          const imageFile = tiles.images[index];
          return (
            <div
              key={`${slot.row}-${slot.col}`}
              style={{
                gridColumn: slot.col + 1,
                gridRow: slot.row + 1,
                backgroundColor: isImage ? '#F8F8F8' : '#F3A1C8',
                boxShadow: 'none',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {isImage ? (
                <img
                  src={`/firstday_drawings/${imageFile}`}
                  alt="Drawing"
                  style={{
                    width: '90%',
                    height: '90%',
                    objectFit: 'contain',
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
