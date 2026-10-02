import React, { useState, useMemo } from 'react';
import { CallSummaryItem } from '../data/types.ts';

interface CallListProps {
  calls: CallSummaryItem[];
  onSelectCall: (id: string) => void;
  loading?: boolean;
}

export const CallList: React.FC<CallListProps> = ({ calls, onSelectCall, loading = false }) => {
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterVariant, setFilterVariant] = useState('all');
  const [filterPersona, setFilterPersona] = useState('all');
  const [filterHardFail, setFilterHardFail] = useState('all');
  const [filterBlocked, setFilterBlocked] = useState('all');
  const [filterEscalated, setFilterEscalated] = useState('all');

  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (search && !c.id.toLowerCase().includes(search.toLowerCase()) && !c.persona.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filterSource !== 'all' && c.source !== filterSource) return false;
      if (filterVariant !== 'all' && c.variant !== filterVariant) return false;
      if (filterPersona !== 'all' && c.persona !== filterPersona) return false;
      if (filterHardFail === 'passed' && !c.hardFailPassed) return false;
      if (filterHardFail === 'failed' && c.hardFailPassed) return false;
      if (filterBlocked === 'blocked' && !c.hasComplianceBlock) return false;
      if (filterBlocked === 'none' && c.hasComplianceBlock) return false;
      if (filterEscalated === 'yes' && !c.hasEscalation) return false;
      return true;
    });
  }, [calls, search, filterSource, filterVariant, filterPersona, filterHardFail, filterBlocked, filterEscalated]);

  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / pageSize));
  const paginatedCalls = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCalls.slice(start, start + pageSize);
  }, [filteredCalls, page, pageSize]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
            Call Inspector: Browse & Review Calls
          </h2>
          <p style={{ color: '#8b949e', margin: '4px 0 0 0', fontSize: '0.85rem' }}>
            Inspect turn-by-turn agent reasoning, guard diffs, latency breakdown, and SHA-256 hash chains.
          </p>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#8b949e', textAlign: 'right' }}>
          Showing <strong>{filteredCalls.length}</strong> of <strong>{calls.length}</strong> total calls
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 16px',
          background: '#161b22',
          borderRadius: '8px',
          border: '1px solid #30363d',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search by Call ID or Persona..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            flex: '1 1 200px',
            background: '#0d1117',
            color: '#c9d1d9',
            border: '1px solid #30363d',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '0.85rem',
          }}
        />

        <select
          value={filterSource}
          onChange={(e) => {
            setFilterSource(e.target.value);
            setPage(1);
          }}
          style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
        >
          <option value="all">Source: All</option>
          <option value="sim">Simulated</option>
          <option value="live">Live Calls</option>
        </select>

        <select
          value={filterVariant}
          onChange={(e) => {
            setFilterVariant(e.target.value);
            setPage(1);
          }}
          style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
        >
          <option value="all">Variant: All</option>
          <option value="v2_graph">v2_graph (LangGraph)</option>
          <option value="v1_baseline">v1_baseline</option>
          <option value="v1_no_guard">v1_no_guard</option>
          <option value="v2_graph_no_slow_path">v2_no_slow_path</option>
        </select>

        <select
          value={filterHardFail}
          onChange={(e) => {
            setFilterHardFail(e.target.value);
            setPage(1);
          }}
          style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
        >
          <option value="all">Hard-Fail: All</option>
          <option value="passed">Passed (0 Violations)</option>
          <option value="failed">Failed (Violations Hit)</option>
        </select>

        <select
          value={filterPersona}
          onChange={(e) => {
            setFilterPersona(e.target.value);
            setPage(1);
          }}
          style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
        >
          <option value="all">Persona: All</option>
          <option value="cooperative">Cooperative</option>
          <option value="hostile">Hostile</option>
          <option value="evasive">Evasive</option>
          <option value="hardship">Hardship</option>
          <option value="already_paid">Already Paid</option>
          <option value="third_party">Third Party</option>
          <option value="stop_contact">Stop Contact</option>
          <option value="off_script">Off Script</option>
          <option value="interrupting">Interrupting</option>
          <option value="fails_verification">Fails Verification</option>
        </select>

        <select
          value={filterBlocked}
          onChange={(e) => {
            setFilterBlocked(e.target.value);
            setPage(1);
          }}
          style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
        >
          <option value="all">Guard Interception: All</option>
          <option value="blocked">Guard Intercepted</option>
          <option value="none">No Interception</option>
        </select>

        <select
          value={filterEscalated}
          onChange={(e) => {
            setFilterEscalated(e.target.value);
            setPage(1);
          }}
          style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
        >
          <option value="all">Escalation: All</option>
          <option value="yes">Escalated</option>
          <option value="no">Not Escalated</option>
        </select>
      </div>

      {/* Calls Table */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#8b949e' }}>Loading calls...</div>
      ) : paginatedCalls.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#8b949e', background: '#161b22', borderRadius: '8px' }}>
          No calls match the selected filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#161b22', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
                <th style={{ padding: '12px 16px' }}>Call Session ID</th>
                <th style={{ padding: '12px 16px' }}>Source / Variant</th>
                <th style={{ padding: '12px 16px' }}>Persona</th>
                <th style={{ padding: '12px 16px' }}>Outcome</th>
                <th style={{ padding: '12px 16px' }}>Compliance Status</th>
                <th style={{ padding: '12px 16px' }}>Hard-Fail Status</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCalls.map((call) => (
                <tr
                  key={call.id}
                  style={{
                    borderBottom: '1px solid #21262d',
                    background: !call.hardFailPassed
                      ? 'rgba(248, 81, 73, 0.04)'
                      : call.hasComplianceBlock
                      ? 'rgba(210, 153, 34, 0.04)'
                      : 'transparent',
                  }}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#f0f6fc' }}>
                    <div style={{ fontWeight: 600 }}>{call.id.length > 32 ? call.id.substring(0, 32) + '...' : call.id}</div>
                    <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                      {new Date(call.timestamp).toLocaleTimeString()} • {call.totalTurns} turns
                    </div>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: call.source === 'live' ? 'rgba(56, 139, 253, 0.15)' : 'rgba(139, 148, 158, 0.15)',
                        color: call.source === 'live' ? '#58a6ff' : '#c9d1d9',
                        marginRight: '6px',
                      }}
                    >
                      {call.source.toUpperCase()}
                    </span>
                    <span style={{ color: '#8b949e' }}>{call.variant}</span>
                  </td>

                  <td style={{ padding: '12px 16px', color: '#e6edf3', fontWeight: 500 }}>
                    {call.persona}
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    {call.promiseSecured ? (
                      <span style={{ color: '#3fb950', fontWeight: 600 }}>★ Promise Secured</span>
                    ) : (
                      <span style={{ color: '#8b949e' }}>{call.outcome}</span>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    {call.hasComplianceBlock ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(210, 153, 34, 0.15)',
                          color: '#d29922',
                          border: '1px solid rgba(210, 153, 34, 0.3)',
                        }}
                      >
                        ⚠ Guard Intercepted
                      </span>
                    ) : (
                      <span style={{ color: '#8b949e' }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    {call.hardFailPassed ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(63, 185, 80, 0.15)',
                          color: '#3fb950',
                        }}
                      >
                        ✓ Passed
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(248, 81, 73, 0.15)',
                          color: '#f85149',
                          border: '1px solid rgba(248, 81, 73, 0.4)',
                        }}
                      >
                        ✗ Hard-Fail Hit
                      </span>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => onSelectCall(call.id)}
                      style={{
                        padding: '4px 12px',
                        background: '#21262d',
                        color: '#58a6ff',
                        border: '1px solid #30363d',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '0.8rem',
                      }}
                    >
                      Inspect →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '6px 14px',
              background: page === 1 ? '#161b22' : '#21262d',
              color: page === 1 ? '#484f58' : '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: '4px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: '0.85rem', color: '#8b949e', margin: '0 8px' }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              padding: '6px 14px',
              background: page === totalPages ? '#161b22' : '#21262d',
              color: page === totalPages ? '#484f58' : '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: '4px',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};
