// Simulates a live game: every few seconds a random player in a random
// active session scores some points. It goes through the same repository
// function as the PATCH endpoint, so the real-time path is exercised exactly
// as it would be by real game servers reporting scores.
export function startSimulator({ repo, onChange, intervalMs = 3000 }) {
  const timer = setInterval(() => {
    const pick = repo.randomActivePlayer();
    if (!pick) return;
    const delta = 1 + Math.floor(Math.random() * 10);
    try {
      const session = repo.updateSession(pick.session_id, { players: [{ id: pick.player_id, delta }] });
      onChange(session);
    } catch (err) {
      console.warn('[simulator]', err.message);
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
