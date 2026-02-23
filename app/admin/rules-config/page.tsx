'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Rule {
  id: number;
  rule_key: string;
  display_name: string;
  description: string;
  default_max_score: number;
  category: string;
}

interface ContentType {
  id: number;
  content_type_key: string;
  display_name: string;
  pass_threshold: number;
}

interface ContentTypeRule {
  rule_id: number;
  content_type_id: number;
  is_enabled: boolean;
  max_score_override: number | null;
}

interface Parameter {
  rule_id: number;
  content_type_id: number | null;
  param_key: string;
  param_value: string;
}

interface ConfigData {
  rules: Rule[];
  contentTypes: ContentType[];
  contentTypeRules: ContentTypeRule[];
  parameters: Parameter[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCTRMap(ctrs: ContentTypeRule[]): Map<string, ContentTypeRule> {
  const map = new Map<string, ContentTypeRule>();
  for (const ctr of ctrs) {
    map.set(`${ctr.rule_id}-${ctr.content_type_id}`, ctr);
  }
  return map;
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? '#6366f1' : '#cbd5e1',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.15s',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s',
          display: 'block',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminRulesConfigPage() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [ctrMap, setCTRMap] = useState<Map<string, ContentTypeRule>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Add content type form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCT, setNewCT] = useState({ displayName: '', passThreshold: '90' });
  const [addingCT, setAddingCT] = useState(false);

  // Param drafts
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>({});

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config');
      if (res.status === 403) { setError('access_denied'); return; }
      if (!res.ok) throw new Error('Failed to load config');
      const data: ConfigData = await res.json();
      setConfig(data);
      setCTRMap(buildCTRMap(data.contentTypeRules));

      const drafts: Record<string, string> = {};
      for (const p of data.parameters) {
        drafts[`${p.rule_id}-${p.content_type_id}-${p.param_key}`] = p.param_value;
      }
      setParamDrafts(drafts);

      const cats = new Set(data.rules.map((r) => r.category));
      setExpandedCategories(cats);

      // Set first tab as active if not already set
      if (data.contentTypes.length > 0) {
        setActiveTabId((prev) => prev ?? data.contentTypes[0].id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleToggle = async (rule: Rule, ct: ContentType, currentEnabled: boolean) => {
    const saveKey = `toggle-${rule.id}-${ct.id}`;
    setSaving(saveKey);
    const ctrKey = `${rule.id}-${ct.id}`;

    setCTRMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(ctrKey);
      if (existing) next.set(ctrKey, { ...existing, is_enabled: !currentEnabled });
      return next;
    });

    try {
      const res = await fetch(`/api/admin/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentTypeId: ct.id, isEnabled: !currentEnabled }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(`${rule.display_name} ${!currentEnabled ? 'enabled' : 'disabled'}`, true);
    } catch {
      setCTRMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(ctrKey);
        if (existing) next.set(ctrKey, { ...existing, is_enabled: currentEnabled });
        return next;
      });
      showToast('Failed to save', false);
    } finally {
      setSaving(null);
    }
  };

  const handleScoreBlur = async (rule: Rule, ct: ContentType, value: string, prevValue: string) => {
    if (value === prevValue) return;
    setSaving(`score-${rule.id}-${ct.id}`);
    try {
      const res = await fetch(`/api/admin/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentTypeId: ct.id,
          maxScoreOverride: value === '' ? null : parseFloat(value),
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setCTRMap((prev) => {
        const next = new Map(prev);
        const ctrKey = `${rule.id}-${ct.id}`;
        const existing = next.get(ctrKey);
        if (existing)
          next.set(ctrKey, {
            ...existing,
            max_score_override: value === '' ? null : parseFloat(value),
          });
        return next;
      });
      showToast(`Score updated`, true);
    } catch {
      showToast('Failed to save score', false);
    } finally {
      setSaving(null);
    }
  };

  const handleParamSave = async (
    rule: Rule,
    paramKey: string,
    paramValue: string,
    contentTypeId: number | null
  ) => {
    setSaving(`param-${rule.id}-${paramKey}`);
    try {
      const res = await fetch(`/api/admin/parameters/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentTypeId, paramKey, paramValue }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(`"${paramKey}" updated`, true);
    } catch {
      showToast('Failed to save parameter', false);
    } finally {
      setSaving(null);
    }
  };

  const handleAddContentType = async () => {
    if (!newCT.displayName) return;
    setAddingCT(true);
    try {
      const res = await fetch('/api/admin/content-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCT),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(`"${newCT.displayName}" added`, true);
      setNewCT({ displayName: '', passThreshold: '90' });
      setShowAddForm(false);
      await loadConfig();
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setAddingCT(false);
    }
  };

  // ── Render guards ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={S.centeredFull}>
        <div style={S.spinner} />
        <p style={{ color: '#64748b', marginTop: 16, fontSize: 14 }}>Loading configuration…</p>
      </div>
    );
  }

  if (error === 'access_denied') {
    return (
      <div style={S.centeredFull}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: '#0f172a', margin: 0, fontSize: 20 }}>Access Denied</h2>
        <p style={{ color: '#64748b', marginTop: 8, fontSize: 14 }}>
          Your account is not authorised to access the admin panel.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.centeredFull}>
        <p style={{ color: '#dc2626' }}>{error}</p>
        <button onClick={loadConfig} style={S.btnPrimary}>Retry</button>
      </div>
    );
  }

  if (!config) return null;

  const activeTab = config.contentTypes.find((ct) => ct.id === activeTabId) ?? config.contentTypes[0];
  const categories = Array.from(new Set(config.rules.map((r) => r.category))).sort();
  const rulesByCategory = new Map<string, Rule[]>();
  for (const cat of categories) {
    rulesByCategory.set(cat, config.rules.filter((r) => r.category === cat));
  }

  const activeEnabledCount = config.contentTypeRules.filter(
    (c) => c.content_type_id === activeTab?.id && c.is_enabled
  ).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Admin Panel</div>
          <h1 style={S.title}>Rules Configuration</h1>
        </div>
        <button onClick={loadConfig} style={S.btnSecondary}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div style={S.statsBar}>
        {[
          { label: 'Rules', value: config.rules.length },
          { label: 'Content Types', value: config.contentTypes.length },
          { label: 'Parameters', value: config.parameters.length },
        ].map(({ label, value }) => (
          <div key={label} style={S.statBox}>
            <span style={S.statValue}>{value}</span>
            <span style={S.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Content Type Tabs */}
      <section style={S.section}>
        <div style={S.sectionHeader}>
          <div>
            <h2 style={S.sectionTitle}>Rules Matrix</h2>
            <p style={S.sectionSubtitle}>
              Select a content type to configure its rules. Toggle on/off and override max score per rule.
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div style={S.tabBar}>
          {config.contentTypes.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setActiveTabId(ct.id)}
              style={{
                ...S.tab,
                ...(ct.id === activeTab?.id ? S.tabActive : {}),
              }}
            >
              {ct.display_name}
              <span style={{
                ...S.tabBadge,
                background: ct.id === activeTab?.id ? '#ede9fe' : '#f1f5f9',
                color: ct.id === activeTab?.id ? '#6366f1' : '#94a3b8',
              }}>
                {config.contentTypeRules.filter(
                  (c) => c.content_type_id === ct.id && c.is_enabled
                ).length}
              </span>
            </button>
          ))}

          {/* Add new tab button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              style={S.tabAdd}
            >
              + Add Content Type
            </button>
          )}
        </div>

        {/* Add content type inline form */}
        {showAddForm && (
          <div style={S.addForm}>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Display Name</label>
              <input
                placeholder="e.g. Controls"
                value={newCT.displayName}
                onChange={(e) => setNewCT((p) => ({ ...p, displayName: e.target.value }))}
                style={S.formInput}
                autoFocus
              />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Pass Threshold</label>
              <input
                type="number"
                min={0}
                max={100}
                value={newCT.passThreshold}
                onChange={(e) => setNewCT((p) => ({ ...p, passThreshold: e.target.value }))}
                style={{ ...S.formInput, width: 80 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
              <button
                onClick={handleAddContentType}
                disabled={addingCT || !newCT.displayName}
                style={{ ...S.btnPrimary, opacity: addingCT || !newCT.displayName ? 0.5 : 1 }}
              >
                {addingCT ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewCT({ displayName: '', passThreshold: '90' }); }}
                style={S.btnSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active tab info bar */}
        {activeTab && (
          <div style={S.tabInfoBar}>
            <span style={S.tabInfoName}>{activeTab.display_name}</span>
            <span style={S.tabInfoMeta}>Pass threshold: {activeTab.pass_threshold}</span>
            <span style={S.tabInfoMeta}>·</span>
            <span style={S.tabInfoMeta}>{activeEnabledCount} of {config.rules.length} rules enabled</span>
          </div>
        )}

        {/* Rules table for active tab */}
        {activeTab && (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: 'left', minWidth: 280 }}>Rule</th>
                  <th style={{ ...S.th, textAlign: 'center', width: 90 }}>Default</th>
                  <th style={{ ...S.th, textAlign: 'center', width: 100 }}>Enabled</th>
                  <th style={{ ...S.th, textAlign: 'center', width: 140 }}>Score Override</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const isExpanded = expandedCategories.has(cat);
                  const catRules = rulesByCategory.get(cat) ?? [];
                  return (
                    <>
                      <tr key={`cat-${cat}`}>
                        <td
                          colSpan={4}
                          style={S.categoryRow}
                          onClick={() => setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat)) next.delete(cat); else next.add(cat);
                            return next;
                          })}
                        >
                          <span style={{ marginRight: 8 }}>{isExpanded ? '▾' : '▸'}</span>
                          {cat}
                          <span style={S.categoryCount}>{catRules.length} rules</span>
                        </td>
                      </tr>

                      {isExpanded && catRules.map((rule) => {
                        const ctr = ctrMap.get(`${rule.id}-${activeTab.id}`);
                        const enabled = ctr?.is_enabled ?? false;
                        const override = ctr?.max_score_override;
                        const scoreVal = override !== null && override !== undefined ? String(override) : '';
                        const isSavingToggle = saving === `toggle-${rule.id}-${activeTab.id}`;
                        const isSavingScore = saving === `score-${rule.id}-${activeTab.id}`;

                        return (
                          <tr
                            key={rule.id}
                            style={{
                              ...S.ruleRow,
                              background: enabled ? '#ffffff' : '#fafafa',
                            }}
                          >
                            <td style={S.td}>
                              <div style={{ fontWeight: 500, fontSize: 13, color: '#1e293b' }}>
                                {rule.display_name}
                              </div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                {rule.rule_key}
                              </div>
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              <span style={S.defaultScore}>{rule.default_max_score}</span>
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              <Toggle
                                checked={enabled}
                                onChange={() => handleToggle(rule, activeTab, enabled)}
                                disabled={isSavingToggle}
                              />
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              {enabled ? (
                                <input
                                  type="number"
                                  placeholder={String(rule.default_max_score)}
                                  defaultValue={scoreVal}
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  disabled={isSavingScore}
                                  onBlur={(e) =>
                                    handleScoreBlur(rule, activeTab, e.target.value.trim(), scoreVal)
                                  }
                                  style={S.scoreInput}
                                />
                              ) : (
                                <span style={{ color: '#e2e8f0', fontSize: 12 }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Parameters — scoped to active tab */}
      {activeTab && (() => {
        const tabParams = config.parameters.filter(
          (p) => p.content_type_id === activeTab.id
        );
        const rulesWithTabParams = config.rules.filter((r) =>
          tabParams.some((p) => p.rule_id === r.id)
        );
        if (rulesWithTabParams.length === 0) return null;

        return (
          <section style={S.section}>
            <h2 style={S.sectionTitle}>Rule Parameters</h2>
            <p style={S.sectionSubtitle}>
              Tunable thresholds for <strong>{activeTab.display_name}</strong>. Changes take effect immediately.
            </p>
            <div style={S.paramsGrid}>
              {rulesWithTabParams.map((rule) => {
                const params = tabParams.filter((p) => p.rule_id === rule.id);
                return (
                  <div key={rule.id} style={S.paramCard}>
                    <div style={S.paramCardTitle}>{rule.display_name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>{rule.rule_key}</div>
                    {params.map((p) => {
                      const draftKey = `${p.rule_id}-${activeTab.id}-${p.param_key}`;
                      const draft = paramDrafts[draftKey] ?? p.param_value;
                      const isSaving = saving === `param-${p.rule_id}-${p.param_key}`;
                      const unchanged = draft === p.param_value;
                      return (
                        <div key={p.param_key} style={S.paramRow}>
                          <label style={S.paramLabel}>{p.param_key}</label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              value={draft}
                              onChange={(e) =>
                                setParamDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))
                              }
                              style={S.paramInput}
                            />
                            <button
                              onClick={() => handleParamSave(rule, p.param_key, draft, activeTab.id)}
                              disabled={isSaving || unchanged}
                              style={{ ...S.btnSave, opacity: isSaving || unchanged ? 0.4 : 1 }}
                            >
                              {isSaving ? '…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div style={{
          ...S.toast,
          background: toast.ok ? '#f0fdf4' : '#fef2f2',
          borderColor: toast.ok ? '#86efac' : '#fca5a5',
          color: toast.ok ? '#15803d' : '#dc2626',
        }}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    color: '#1e293b',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    padding: '32px 32px 80px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  centeredFull: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
    paddingBottom: 20,
    borderBottom: '1px solid #e2e8f0',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#6366f1',
    fontWeight: 700,
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  statsBar: {
    display: 'flex',
    gap: 12,
    marginBottom: 32,
  },
  statBox: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '14px 22px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 110,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: '#6366f1',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    fontWeight: 600,
  },
  section: {
    marginBottom: 48,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 4px',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    gap: 4,
    borderBottom: '2px solid #e2e8f0',
    marginBottom: 0,
    flexWrap: 'wrap' as const,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 500,
    color: '#64748b',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'color 0.1s',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  tabActive: {
    color: '#6366f1',
    fontWeight: 600,
    borderBottom: '2px solid #6366f1',
    background: '#fafbff',
  },
  tabBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 7px',
    borderRadius: 10,
  },
  tabAdd: {
    display: 'flex',
    alignItems: 'center',
    padding: '9px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: '#6366f1',
    background: 'transparent',
    border: 'none',
    marginBottom: -2,
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    fontFamily: "'Inter', system-ui, sans-serif",
    letterSpacing: '0.01em',
  },
  addForm: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-end',
    background: '#fafbff',
    border: '1px solid #e0e7ff',
    borderTop: 'none',
    borderRadius: '0 0 8px 8px',
    padding: '16px 20px',
    marginBottom: 0,
  },
  tabInfoBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    background: '#fafbff',
    border: '1px solid #e2e8f0',
    borderTop: 'none',
    marginBottom: 1,
  },
  tabInfoName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#6366f1',
  },
  tabInfoMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    border: '1px solid #e2e8f0',
    borderTop: 'none',
    background: '#ffffff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  th: {
    padding: '10px 16px',
    background: '#f1f5f9',
    color: '#475569',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '10px 16px',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'middle' as const,
  },
  categoryRow: {
    background: '#f8fafc',
    padding: '8px 16px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.09em',
    textTransform: 'uppercase' as const,
    color: '#94a3b8',
    cursor: 'pointer',
    borderBottom: '1px solid #e2e8f0',
    userSelect: 'none' as const,
  },
  categoryCount: {
    marginLeft: 10,
    fontSize: 10,
    color: '#cbd5e1',
    fontWeight: 500,
  },
  ruleRow: {
    transition: 'background 0.1s',
  },
  defaultScore: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 600,
  },
  scoreInput: {
    width: 80,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    color: '#1e293b',
    fontSize: 13,
    padding: '4px 8px',
    textAlign: 'center' as const,
    fontFamily: 'inherit',
    outline: 'none',
  },
  paramsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  paramCard: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '18px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  paramCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: 2,
  },
  paramRow: { marginBottom: 10 },
  paramLabel: {
    display: 'block',
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 4,
    fontWeight: 600,
  },
  paramInput: {
    flex: 1,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    color: '#1e293b',
    fontSize: 13,
    padding: '6px 10px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  btnSave: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  formLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    fontWeight: 600,
  },
  formInput: {
    background: '#ffffff',
    border: '1px solid #c7d2fe',
    borderRadius: 5,
    color: '#1e293b',
    fontSize: 13,
    padding: '7px 12px',
    fontFamily: 'inherit',
    outline: 'none',
    minWidth: 180,
  },
  btnPrimary: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSecondary: {
    background: '#ffffff',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: '7px 14px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
  },
  toast: {
    position: 'fixed' as const,
    bottom: 24,
    right: 24,
    padding: '11px 18px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Inter', system-ui, sans-serif",
    zIndex: 999,
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e2e8f0',
    borderTop: '3px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};