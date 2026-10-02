import React, { useState, useEffect } from 'react';
import { Navbar, Topbar, ActiveTab } from './ui/Navbar.tsx';
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
    <div className="shell">
      {/* Sidebar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => navigateTo(tab, null)}
        isSampleData={isSampleData}
      />

      <div className="main-col">
        <Topbar activeTab={activeTab} isSampleData={isSampleData} onHome={() => navigateTo('live', null)} onSelectTab={(tab) => navigateTo(tab, null)} />
        {/* Main View Router */}
        <main style={{ flex: 1, minWidth: 0 }}>
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
            <div className="page"><div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Loading call record…
            </div></div>
          ) : activeCallDetail ? (
            <CallInspector
              call={activeCallDetail}
              onBack={() => navigateTo('calls', null)}
            />
          ) : (
            <div className="page"><div className="card card-pad" style={{ textAlign: 'center' }}>
              <div>Call record not found.</div>
              <button className="btn" style={{ marginTop: 12 }} onClick={() => navigateTo('calls', null)}>
                Back to list
              </button>
            </div></div>
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
    </div>
  );
};
