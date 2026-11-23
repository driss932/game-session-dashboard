import { lazy, Suspense, useEffect, useState } from 'react';
import { useDashboard } from './hooks/useDashboard.js';
import MatchHistory from './components/MatchHistory.jsx';
import SessionOverview from './components/SessionOverview.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';

// Code-split: the form's JavaScript is only fetched when it's opened.
const NewSessionForm = lazy(() => import('./components/NewSessionForm.jsx'));

export default function App() {
  const d = useDashboard();
  const [showForm, setShowForm] = useState(false);

  // Auto-hide error toasts.
  useEffect(() => {
    if (!d.toast) return;
    const t = setTimeout(d.dismissToast, 5000);
    return () => clearTimeout(t);
  }, [d.toast, d.dismissToast]);

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo" aria-hidden="true">▲</span> Game Session Dashboard</h1>
        <ConnectionStatus status={d.connection} />
      </header>

      <main className="layout">
        <SessionOverview detail={d.detail} onScore={d.changeScore} onStatus={d.setStatus} onRetry={d.retryDetail} />
        <MatchHistory
          list={d.list}
          filter={d.filter}
          onFilter={d.setFilter}
          selectedId={d.selectedId}
          onSelect={d.select}
          onLoadMore={d.loadMore}
          onNew={() => setShowForm(true)}
        />
      </main>

      {showForm && (
        <Suspense fallback={null}>
          <NewSessionForm onCreate={d.createSession} onClose={() => setShowForm(false)} />
        </Suspense>
      )}

      {d.toast && (
        <div className="toast" role="alert">
          {d.toast}
          <button className="btn btn--icon" onClick={d.dismissToast} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}
