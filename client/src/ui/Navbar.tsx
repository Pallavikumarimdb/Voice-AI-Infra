import React from 'react';

export type ActiveTab = 'live' | 'calls' | 'results' | 'label' | 'translate';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isSampleData: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, isSampleData }) => {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #1f6feb, #238636)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '0.9rem',
            }}
          >
            AI
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f6fc' }}>
              VoiceAI Platform
            </div>
            <div style={{ fontSize: '0.7rem', color: '#8b949e' }}>
              Multi-Purpose Regulated Voice Agent & Validation Suite
            </div>
          </div>
        </div>

        {/* Tab links */}
        <div style={{ display: 'flex', gap: '6px', marginLeft: '24px' }}>
          <button
            onClick={() => onSelectTab('live')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              background: activeTab === 'live' ? '#1f6feb' : 'transparent',
              color: activeTab === 'live' ? '#fff' : '#c9d1d9',
            }}
          >
            Live Agent Studio
          </button>

          <button
            onClick={() => onSelectTab('calls')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              background: activeTab === 'calls' ? '#1f6feb' : 'transparent',
              color: activeTab === 'calls' ? '#fff' : '#c9d1d9',
            }}
          >
            Call Inspector
          </button>

          <button
            onClick={() => onSelectTab('results')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              background: activeTab === 'results' ? '#1f6feb' : 'transparent',
              color: activeTab === 'results' ? '#fff' : '#c9d1d9',
            }}
          >
            Eval Results
          </button>

          <button
            onClick={() => onSelectTab('label')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              background: activeTab === 'label' ? '#1f6feb' : 'transparent',
              color: activeTab === 'label' ? '#fff' : '#c9d1d9',
            }}
          >
            Labeling
          </button>

          <button
            onClick={() => onSelectTab('translate')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              background: activeTab === 'translate' ? '#238636' : 'transparent',
              color: activeTab === 'translate' ? '#fff' : '#8b949e',
            }}
          >
            Voice Translator
          </button>
        </div>
      </div>

      {/* Right side: sample data banner indicator */}
      <div>
        {isSampleData ? (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '12px',
              background: 'rgba(210, 153, 34, 0.15)',
              color: '#d29922',
              border: '1px solid rgba(210, 153, 34, 0.4)',
            }}
          >
            📁 Sample Data Mode (Offline Fallback)
          </span>
        ) : (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '12px',
              background: 'rgba(63, 185, 80, 0.15)',
              color: '#3fb950',
              border: '1px solid rgba(63, 185, 80, 0.4)',
            }}
          >
            ● Live API Connected (:8443)
          </span>
        )}
      </div>
    </nav>
  );
};
