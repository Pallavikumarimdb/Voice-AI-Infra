import React from 'react';
import { Icons } from './primitives.tsx';

export type ActiveTab = 'live' | 'calls' | 'results' | 'label' | 'translate';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isSampleData: boolean;
}

const GROUPS: { section: string; items: { id: ActiveTab; label: string; desc: string }[] }[] = [
  {
    section: 'Build',
    items: [
      { id: 'live', label: 'Live call', desc: 'Run & monitor' },
      { id: 'translate', label: 'Translate', desc: 'Realtime demo' },
    ],
  },
  {
    section: 'Review',
    items: [
      { id: 'calls', label: 'Calls', desc: 'Inspector' },
      { id: 'label', label: 'Labeling', desc: 'Human ratings' },
    ],
  },
  {
    section: 'Measure',
    items: [{ id: 'results', label: 'Results', desc: 'Eval suite' }],
  },
];

const TITLES: Record<ActiveTab, { crumb: string; title: string }> = {
  live: { crumb: 'Build', title: 'Live call' },
  translate: { crumb: 'Build', title: 'Translate' },
  calls: { crumb: 'Review', title: 'Calls' },
  label: { crumb: 'Review', title: 'Labeling' },
  results: { crumb: 'Measure', title: 'Results' },
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, isSampleData }) => {
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 8, background: '#fff', color: '#0c111d',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
              }}
            >
              V
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                Vocalis
              </div>
              <div style={{ fontSize: 11, color: '#667085' }}>Voice infrastructure</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {GROUPS.map((g) => (
            <div key={g.section}>
              <div className="sidebar-section">{g.section}</div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => onSelectTab(item.id)}
                >
                  {Icons[item.id]}
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: isSampleData ? '#fedf89' : '#a6f4c5',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{isSampleData ? 'Sample data' : 'Engine · :8443'}</span>
          </div>
          <div style={{ fontSize: 11, color: '#667085', marginTop: 8, padding: '0 2px' }}>
            {isSampleData ? 'API unreachable — local fixture set.' : 'Live gateway reachable.'}
          </div>
        </div>
      </aside>
    </>
  );
};

export const Topbar: React.FC<{ activeTab: ActiveTab; isSampleData: boolean; onHome: () => void; onSelectTab: (t: ActiveTab) => void }> = ({
  activeTab,
  isSampleData,
  onHome,
  onSelectTab,
}) => {
  const t = TITLES[activeTab];
  const ids: ActiveTab[] = ['live', 'calls', 'results', 'label', 'translate'];
  const labels: Record<ActiveTab, string> = { live: 'Live', calls: 'Calls', results: 'Results', label: 'Label', translate: 'Translate' };
  return (
    <div className="topbar">
      <button onClick={onHome} className="btn btn-sm" style={{ padding: '4px 10px' }}>
        Vocalis
      </button>
      <span className="topbar-crumb">
        {t.crumb} <span style={{ margin: '0 4px' }}>/</span>
      </span>
      <span className="topbar-title">{t.title}</span>
      <nav className="topbar-nav" aria-label="Primary">
        {ids.map((id) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => onSelectTab(id)}>
            {labels[id]}
          </button>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {isSampleData ? (
          <span className="badge badge-warning">Sample data</span>
        ) : (
          <span className="badge badge-success"><span className="dot" />Live</span>
        )}
        <span className="badge badge-neutral mono">p50 target &lt; 500ms</span>
      </div>
    </div>
  );
};
