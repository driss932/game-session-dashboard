export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge--${status}`}>
      {status === 'active' && <span className="pulse" aria-hidden="true" />}
      {status === 'active' ? 'Active' : 'Completed'}
    </span>
  );
}
