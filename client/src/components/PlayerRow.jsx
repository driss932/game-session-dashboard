import { memo, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';

// One row of the scoreboard.
// memo(): when one player's score changes, only that row re-renders; the
// others get the same props and are skipped. onScore is a stable callback
// (useCallback in useDashboard), which is what makes memo effective.
function PlayerRow({ player, rank, isLeader, editable, onScore }) {
  // Briefly highlight the row and show "+N" when the score changes (e.g. via a live update).
  const prev = useRef(player.score);
  const [bump, setBump] = useState(null);
  useEffect(() => {
    const diff = player.score - prev.current;
    prev.current = player.score;
    if (diff === 0) return;
    setBump(diff);
    const t = setTimeout(() => setBump(null), 900);
    return () => clearTimeout(t);
  }, [player.score]);

  return (
    <li className={`player ${isLeader ? 'player--leader' : ''} ${bump ? 'player--bump' : ''}`}>
      <span className="player__rank" aria-label={`Rank ${rank}`}>{rank}</span>
      <Avatar name={player.name} photoUrl={player.photoUrl} size={44} />
      <span className="player__name">
        {player.name}
        {isLeader && <span className="player__crown" title="Leader" aria-label="leader">★</span>}
      </span>
      <span className="player__score" aria-live="polite">
        {player.score.toLocaleString()}
        {bump != null && <span className={`delta ${bump > 0 ? 'delta--up' : 'delta--down'}`}>{bump > 0 ? `+${bump}` : bump}</span>}
      </span>
      {editable && (
        <span className="player__actions">
          <button type="button" className="btn btn--icon" onClick={() => onScore(player.id, -1)} disabled={player.score === 0} aria-label={`Remove 1 point from ${player.name}`}>−1</button>
          <button type="button" className="btn btn--icon" onClick={() => onScore(player.id, 1)} aria-label={`Add 1 point to ${player.name}`}>+1</button>
          <button type="button" className="btn btn--icon" onClick={() => onScore(player.id, 5)} aria-label={`Add 5 points to ${player.name}`}>+5</button>
        </span>
      )}
    </li>
  );
}

export default memo(PlayerRow);
