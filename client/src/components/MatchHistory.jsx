import { memo } from 'react';
import StatusBadge from './StatusBadge.jsx';
import { timeAgo } from '../lib/format.js';

const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['completed', 'Completed'],
];

// One entry in the list. memo() so a live score change in one session
// re-renders only that entry, not the whole list.
const SessionItem = memo(function SessionItem({ s, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        className={`history__item ${selected ? 'is-selected' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(s.id)}
      >
        {s.posterUrl ? (
          <img className="history__thumb" src={s.posterUrl} alt="" width={96} height={54} loading="lazy" decoding="async" />
        ) : (
          <span className="history__thumb history__thumb--live" aria-hidden="true">LIVE</span>
        )}
        <span className="history__body">
          <span className="history__row">
            <strong>{s.game}</strong>
            <StatusBadge status={s.status} />
          </span>
          <span className="history__meta">
            {s.playerCount} players · {timeAgo(s.startedAt)}
          </span>
          {s.leader && (
            <span className="history__meta">
              {s.status === 'active' ? 'Leading' : 'Winner'}: <b>{s.leader.name}</b> ({s.leader.score})
            </span>
          )}
        </span>
      </button>
    </li>
  );
});

export default function MatchHistory({ list, filter, onFilter, selectedId, onSelect, onLoadMore, onNew }) {
  const { items, total, loading, error } = list;
  return (
    <nav className="panel history" aria-label="Match history">
      <div className="history__head">
        <h2>Match History</h2>
        <button type="button" className="btn btn--primary" onClick={onNew}>+ New session</button>
      </div>

      <div className="tabs" role="tablist" aria-label="Filter sessions">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            className={`tab ${filter === value ? 'is-active' : ''}`}
            onClick={() => onFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="error">Couldn’t load sessions: {error}</p>}

      <ul className="history__list">
        {items.map((s) => (
          <SessionItem key={s.id} s={s} selected={s.id === selectedId} onSelect={onSelect} />
        ))}
        {loading && items.length === 0 && [0, 1, 2].map((i) => <li key={i} className="skeleton skeleton--row" />)}
      </ul>

      {!loading && items.length === 0 && !error && <p className="muted">No sessions yet.</p>}
      {items.length < total && (
        <button type="button" className="btn btn--ghost history__more" onClick={onLoadMore} disabled={loading}>
          {loading ? 'Loading…' : `Load more (${total - items.length})`}
        </button>
      )}
    </nav>
  );
}
