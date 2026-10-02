import React from 'react';

export type ActiveTab = 'live' | 'calls' | 'results' | 'label' | 'translate';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isSampleData: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, isSampleData }) => {
  const navItems: { id: ActiveTab; label: string; icon: string; badge?: string }[] = [
    { id: 'live', label: 'Agent Studio', icon: '🎙️' },
    { id: 'calls', label: 'Call Telemetry', icon: '📊' },
    { id: 'results', label: 'Eval Suite', icon: '🎯' },
    { id: 'label', label: 'Dataset Labeling', icon: '🏷️' },
    { id: 'translate', label: 'Translator', icon: '🌐' },
  ];

  return (
    <header
      className="glass-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0 24px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Brand & Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => onSelectTab('live')}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
                Vocalis<span style={{ color: '#818cf8' }}>AI</span>
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  letterSpacing: '0.04em',
                }}
              >
                PROD
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', letterSpacing: '-0.01em' }}>
              Real-time Voice Pipeline & Compliance Suite
            </div>
          </div>
        </div>

        {/* Navigation Tabs Pill Container */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            gap: '2px',
          }}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.82rem',
                  background: isActive ? 'rgba(99, 102, 241, 0.22)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  boxShadow: isActive ? '0 2px 8px rgba(99, 102, 241, 0.25)' : 'none',
                  outline: isActive ? '1px solid rgba(99, 102, 241, 0.45)' : 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <span style={{ fontSize: '0.9rem', opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right side: Live engine connectivity & status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {isSampleData ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: '9999px',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }} />
            <span>Sample Mode (Offline)</span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '5px 14px',
              borderRadius: '9999px',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div style={{ position: 'relative', width: '8px', height: '8px' }}>
              <div
                className="pulse-active"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
            </div>
            <span>Engine Connected (8443)</span>
          </div>
        )}

        <div
          style={{
            height: '24px',
            width: '1px',
            background: 'var(--border-subtle)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Production Pipeline Latency Target: <500ms"
          >
            ⚡
          </div>
        </div>
      </div>
    </header>
  );
};

