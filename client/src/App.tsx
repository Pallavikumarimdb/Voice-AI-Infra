import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from './ui/Navbar.tsx';
import { LiveCallPanel } from './ui/LiveCallPanel.tsx';
import { CallList } from './ui/CallList.tsx';
import { CallInspector } from './ui/CallInspector.tsx';
import { ResultsViewer } from './ui/ResultsViewer.tsx';
import { LabelingScreen } from './ui/LabelingScreen.tsx';
import { TranslatePanel } from './ui/TranslatePanel.tsx';
import { apiClient } from './data/apiClient.ts';
import { CallSummaryItem, CallDetail } from './data/types.ts';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [activeCallDetail, setActiveCallDetail] = useState<CallDetail | null>(null);
  const [calls, setCalls] = useState<CallSummaryItem[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isSampleData, setIsSampleData] = useState(false);

  // Sync state from current URL
  useEffect(() => {
    function parseRoute() {
      const path = window.location.pathname;
      if (path.startsWith('/calls/')) {
        const id = path.replace('/calls/', '').trim();
        setActiveTab('calls');
        setSelectedCallId(id);
      } else if (path === '/calls') {
        setActiveTab('calls');
        setSelectedCallId(null);
      } else if (path === '/results') {
        setActiveTab('results');
        setSelectedCallId(null);
      } else if (path === '/label') {
        setActiveTab('label');
        setSelectedCallId(null);
      } else if (path === '/translate') {
        setActiveTab('translate');
        setSelectedCallId(null);
      } else {
        setActiveTab('live');
        setSelectedCallId(null);
      }
    }

    parseRoute();
    window.addEventListener('popstate', parseRoute);
    return () => window.removeEventListener('popstate', parseRoute);
  }, []);

  // Update URL history when navigation occurs
  const navigateTo = (tab: ActiveTab, callId?: string | null) => {
    setActiveTab(tab);
    setSelectedCallId(callId || null);

    let targetPath = `/${tab}`;
    if (tab === 'calls' && callId) {
      targetPath = `/calls/${encodeURIComponent(callId)}`;
    }
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  // Load calls list
  useEffect(() => {
    async function fetchCalls() {
      setLoadingCalls(true);
      const res = await apiClient.getCalls();
      setCalls(res.data);
      setIsSampleData(res.isSampleData);
      setLoadingCalls(false);
    }
    fetchCalls();
  }, []);

  // Load detail when selectedCallId changes
  useEffect(() => {
    async function fetchDetail() {
      if (!selectedCallId) {
        setActiveCallDetail(null);
        return;
      }
      setLoadingDetail(true);
      try {
        const res = await apiClient.getCallDetail(selectedCallId);
        setActiveCallDetail(res.data);
        setIsSampleData(res.isSampleData);
      } catch (err) {
        console.error('Failed to load call detail:', err);
      } finally {
        setLoadingDetail(false);
      }
    }
    fetchDetail();
  }, [selectedCallId]);

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => navigateTo(tab, null)}
        isSampleData={isSampleData}
      />

      {/* Main View Router */}
      <main style={{ flex: 1 }}>
        {activeTab === 'live' && (
          <LiveCallPanel onInspectCall={(id) => navigateTo('calls', id)} />
        )}

        {activeTab === 'calls' && !selectedCallId && (
          <CallList
            calls={calls}
            onSelectCall={(id) => navigateTo('calls', id)}
            loading={loadingCalls}
          />
        )}

        {activeTab === 'calls' && selectedCallId && (
          loadingDetail ? (
            <div style={{ padding: '64px', textAlign: 'center', color: '#8b949e' }}>
              Loading call record {selectedCallId}...
            </div>
          ) : activeCallDetail ? (
            <CallInspector
              call={activeCallDetail}
              onBack={() => navigateTo('calls', null)}
            />
          ) : (
            <div style={{ padding: '64px', textAlign: 'center', color: '#8b949e' }}>
              <div>Call record not found.</div>
              <button
                onClick={() => navigateTo('calls', null)}
                style={{ marginTop: '12px', padding: '6px 14px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
              >
                ← Back to List
              </button>
            </div>
          )
        )}

        {activeTab === 'results' && (
          <ResultsViewer
            onSelectVariantFilter={(_variant) => {
              navigateTo('calls', null);
            }}
            onNavigateToLabeling={() => navigateTo('label', null)}
          />
        )}

        {activeTab === 'label' && (
          <LabelingScreen onInspectCall={(id) => navigateTo('calls', id)} />
        )}

        {activeTab === 'translate' && (
          <TranslatePanel />
        )}
      </main>
    </div>
  );
};
