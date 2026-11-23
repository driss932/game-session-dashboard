import { useEffect, useRef, useState } from 'react';

// Form for POST /sessions. Lazy-loaded: most visitors never open it, so its
// code isn't part of the initial download.
const PRESET_PHOTOS = ['Nova', 'Kai', 'Rhea', 'Jonas', 'Mira', 'Theo', 'Ana', 'Leo', 'Sana'];
const GAMES = ['Arena Rush', 'Starfall Rally', 'Pixel Tactics', 'Quarry Kings'];
const blankPlayer = () => ({ key: crypto.randomUUID(), name: '', photo: '' });

export default function NewSessionForm({ onCreate, onClose }) {
  const [game, setGame] = useState(GAMES[0]);
  const [players, setPlayers] = useState([blankPlayer(), blankPlayer()]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);

  // Native <dialog> gives focus trapping and Esc-to-close for free.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const update = (key, field, value) =>
    setPlayers((ps) => ps.map((p) => (p.key === key ? { ...p, [field]: value } : p)));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const named = players.filter((p) => p.name.trim());
    if (named.length === 0) return setError('Add at least one player.');
    setSaving(true);
    try {
      await onCreate({
        game: game.trim(),
        players: named.map((p) => ({
          name: p.name.trim(),
          ...(p.photo ? { photoUrl: `/media/players/${p.photo.toLowerCase()}-128.webp` } : {}),
        })),
      });
      onClose();
    } catch (err) {
      setError(err.details?.map((d) => d.message).join(', ') || err.message);
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} aria-labelledby="new-session-title">
      <form onSubmit={submit}>
        <h2 id="new-session-title">New session</h2>

        <label className="field">
          <span>Game</span>
          <input list="games" value={game} onChange={(e) => setGame(e.target.value)} maxLength={60} required />
          <datalist id="games">{GAMES.map((g) => <option key={g} value={g} />)}</datalist>
        </label>

        <fieldset className="field">
          <legend>Players (max 8)</legend>
          {players.map((p, i) => (
            <div className="player-input" key={p.key}>
              <input
                aria-label={`Player ${i + 1} name`}
                placeholder={`Player ${i + 1}`}
                value={p.name}
                maxLength={40}
                onChange={(e) => update(p.key, 'name', e.target.value)}
              />
              <select aria-label={`Player ${i + 1} photo`} value={p.photo} onChange={(e) => update(p.key, 'photo', e.target.value)}>
                <option value="">No photo</option>
                {PRESET_PHOTOS.map((n) => <option key={n} value={n}>{n}’s photo</option>)}
              </select>
              {players.length > 1 && (
                <button type="button" className="btn btn--icon" aria-label={`Remove player ${i + 1}`} onClick={() => setPlayers((ps) => ps.filter((x) => x.key !== p.key))}>×</button>
              )}
            </div>
          ))}
          {players.length < 8 && (
            <button type="button" className="btn btn--ghost" onClick={() => setPlayers((ps) => [...ps, blankPlayer()])}>+ Add player</button>
          )}
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Starting…' : 'Start session'}</button>
        </div>
      </form>
    </dialog>
  );
}
