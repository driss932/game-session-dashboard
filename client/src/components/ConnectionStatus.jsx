const LABELS = {
  live: 'Live',
  connecting: 'Connecting…',
  offline: 'Reconnecting · polling every 5s',
};

export default function ConnectionStatus({ status }) {
  return (
    <span className={`conn conn--${status}`} role="status" title="Real-time connection">
      <span className="conn__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
