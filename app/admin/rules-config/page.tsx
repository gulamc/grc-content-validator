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
  id: number;
  rule_id: number;
  content_type_id: number;
  is_enabled: boolean;
  max_score_override: number | null;
}

interface Parameter {
  id: number;
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

function getCTR(
  ctrMap: Map<string, ContentTypeRule>,
  ruleId: number,
  ctId: number
): ContentTypeRule | undefined {
  return ctrMap.get(`${ruleId}-${ctId}`);
}

function buildCTRMap(ctrs: ContentTypeRule[]): Map<string, ContentTypeRule> {
  const map = new Map<string, ContentTypeRule>();
  for (const ctr of ctrs) {
    map.set(`${ctr.rule_id}-${ctr.content_type_id}`, ctr);
  }
  return map;
}

// ─── Components ──────────────────────────────────────────────────────────────

function StatusBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 3,
        background: ok ? '#14311a' : '#2d1a1a',
        color: ok ? '#4ade80' : '#f87171',
        border: `1px solid ${ok ? '#166534' : '#7f1d1d'}`,
      }}
    >
      {text}
    </span>
  );
}

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
        background: checked ? '#2563eb' : '#374151',
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
  const [saving, setSaving] = useState<string | null>(null); // key of what's saving
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // New content type form
  const [newCT, setNewCT] = useState({
    contentTypeKey: '',
    displayName: '',
    passThreshold: '90',
  });
  const [addingCT, setAddingCT] = useState(false);

  // Param editing state: { [ruleId-paramKey]: draftValue }
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>({});

  // Grouped rules by category
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config');
      if (res.status === 403) {
        setError('access_denied');
        return;
      }
      if (!res.ok) throw new Error('Failed to load config');
      const data: ConfigData = await res.json();
      setConfig(data);
      setCTRMap(buildCTRMap(data.contentTypeRules));

      // Pre-populate param drafts
      const drafts: Record<string, string> = {};
      for (const p of data.parameters) {
        drafts[`${p.rule_id}-${p.param_key}`] = p.param_value;
      }
      setParamDrafts(drafts);

      // Expand all categories by default
      const cats = new Set(data.rules.map((r) => r.category));
      setExpandedCategories(cats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleToggle = async (
    rule: Rule,
    ct: ContentType,
    currentEnabled: boolean
  ) => {
    const key = `toggle-${rule.id}-${ct.id}`;
    setSaving(key);

    // Optimistic update
    setCTRMap((prev) => {
      const next = new Map(prev);
      const ctrKey = `${rule.id}-${ct.id}`;
      const existing = next.get(ctrKey);
      if (existing) next.set(ctrKey, { ...existing, is_enabled: !currentEnabled });
      return next;
    });

    try {
      const res = await fetch(`/api/admin/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentTypeId: ct.id,
          isEnabled: !currentEnabled,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(`${rule.display_name} ${!currentEnabled ? 'enabled' : 'disabled'} for ${ct.display_name}`, true);
    } catch {
      // Revert
      setCTRMap((prev) => {
        const next = new Map(prev);
        const ctrKey = `${rule.id}-${ct.id}`;
        const existing = next.get(ctrKey);
        if (existing) next.set(ctrKey, { ...existing, is_enabled: currentEnabled });
        return next;
      });
      showToast('Failed to save', false);
    } finally {
      setSaving(null);
    }
  };

  const handleScoreChange = async (
    rule: Rule,
    ct: ContentType,
    value: string
  ) => {
    const key = `score-${rule.id}-${ct.id}`;
    setSaving(key);
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

      // Update map
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
      showToast(`Score updated for ${rule.display_name}`, true);
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
    const key = `param-${rule.id}-${paramKey}`;
    setSaving(key);
    try {
      const res = await fetch(`/api/admin/parameters/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentTypeId, paramKey, paramValue }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(`Parameter "${paramKey}" updated`, true);
    } catch {
      showToast('Failed to save parameter', false);
    } finally {
      setSaving(null);
    }
  };

  const handleAddContentType = async () => {
    if (!newCT.contentTypeKey || !newCT.displayName) return;
    setAddingCT(true);
    try {
      const res = await fetch('/api/admin/content-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCT),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add content type');
      showToast(`"${newCT.displayName}" content type added`, true);
      setNewCT({ contentTypeKey: '', displayName: '', passThreshold: '90' });
      await loadConfig();
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setAddingCT(false);
    }
  };

  // ── Render guards ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.centeredFull}>
        <div style={styles.spinner} />
        <p style={{ color: '#6b7280', marginTop: 16, fontSize: 14 }}>
          Loading configuration…
        </p>
      </div>
    );
  }

  if (error === 'access_denied') {
    return (
      <div style={styles.centeredFull}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: '#f3f4f6', margin: 0, fontSize: 20 }}>
          Access Denied
        </h2>
        <p style={{ color: '#6b7280', marginTop: 8, fontSize: 14 }}>
          Your account is not authorised to access the admin panel.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centeredFull}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: '#f87171' }}>{error}</p>
        <button onClick={loadConfig} style={styles.btnPrimary}>
          Retry
        </button>
      </div>
    );
  }

  if (!config) return null;

  // Group rules by category
  const categories = Array.from(
    new Set(config.rules.map((r) => r.category))
  ).sort();

  const rulesByCategory = new Map<string, Rule[]>();
  for (const cat of categories) {
    rulesByCategory.set(
      cat,
      config.rules.filter((r) => r.category === cat)
    );
  }

  // Parameters grouped by rule
  const paramsByRule = new Map<number, Parameter[]>();
  for (const p of config.parameters) {
    const arr = paramsByRule.get(p.rule_id) ?? [];
    arr.push(p);
    paramsByRule.set(p.rule_id, arr);
  }

  const rulesWithParams = config.rules.filter((r) =>
    paramsByRule.has(r.id)
  );

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerEyebrow}>Admin Panel</div>
          <h1 style={styles.headerTitle}>Rules Configuration</h1>
        </div>
        <button onClick={loadConfig} style={styles.btnSecondary}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        {[
          { label: 'Rules', value: config.rules.length },
          { label: 'Content Types', value: config.contentTypes.length },
          { label: 'Active Rules', value: config.contentTypeRules.filter((c) => c.is_enabled).length },
          { label: 'Parameters', value: config.parameters.length },
        ].map(({ label, value }) => (
          <div key={label} style={styles.statBox}>
            <span style={styles.statValue}>{value}</span>
            <span style={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Rules Grid */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Rules Matrix</h2>
        <p style={styles.sectionSubtitle}>
          Toggle rules on/off per content type. Override max score (leave blank to use rule default).
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, minWidth: 280, textAlign: 'left' }}>
                  Rule
                </th>
                <th style={{ ...styles.th, width: 72, textAlign: 'center', color: '#6b7280' }}>
                  Default
                </th>
                {config.contentTypes.map((ct) => (
                  <th
                    key={ct.id}
                    style={{ ...styles.th, minWidth: 160, textAlign: 'center' }}
                  >
                    <div>{ct.display_name}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 400, marginTop: 2 }}>
                      pass ≥ {ct.pass_threshold}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const isExpanded = expandedCategories.has(cat);
                const catRules = rulesByCategory.get(cat) ?? [];

                return (
                  <>
                    {/* Category row */}
                    <tr key={`cat-${cat}`}>
                      <td
                        colSpan={2 + config.contentTypes.length}
                        style={styles.categoryRow}
                        onClick={() => {
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat)) next.delete(cat);
                            else next.add(cat);
                            return next;
                          });
                        }}
                      >
                        <span style={{ marginRight: 8 }}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        {cat}
                        <span style={styles.categoryCount}>
                          {catRules.length} rules
                        </span>
                      </td>
                    </tr>

                    {isExpanded &&
                      catRules.map((rule) => (
                        <tr key={rule.id} style={styles.ruleRow}>
                          {/* Rule name */}
                          <td style={styles.td}>
                            <div style={{ fontWeight: 500, fontSize: 13, color: '#e5e7eb' }}>
                              {rule.display_name}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                              {rule.rule_key}
                            </div>
                          </td>

                          {/* Default score */}
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={styles.defaultScore}>
                              {rule.default_max_score}
                            </span>
                          </td>

                          {/* Per content type */}
                          {config.contentTypes.map((ct) => {
                            const ctr = getCTR(ctrMap, rule.id, ct.id);
                            const enabled = ctr?.is_enabled ?? false;
                            const override = ctr?.max_score_override;
                            const scoreVal =
                              override !== null && override !== undefined
                                ? String(override)
                                : '';
                            const savingToggle = saving === `toggle-${rule.id}-${ct.id}`;
                            const savingScore = saving === `score-${rule.id}-${ct.id}`;

                            return (
                              <td
                                key={ct.id}
                                style={{
                                  ...styles.td,
                                  textAlign: 'center',
                                  background: enabled
                                    ? 'transparent'
                                    : 'rgba(0,0,0,0.2)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  <Toggle
                                    checked={enabled}
                                    onChange={() =>
                                      handleToggle(rule, ct, enabled)
                                    }
                                    disabled={savingToggle}
                                  />
                                  {enabled && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <input
                                        type="number"
                                        placeholder={String(rule.default_max_score)}
                                        defaultValue={scoreVal}
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        disabled={savingScore}
                                        onBlur={(e) => {
                                          const v = e.target.value.trim();
                                          if (v !== scoreVal) {
                                            handleScoreChange(rule, ct, v);
                                          }
                                        }}
                                        style={styles.scoreInput}
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Parameters */}
      {rulesWithParams.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Rule Parameters</h2>
          <p style={styles.sectionSubtitle}>
            Tunable thresholds stored in RuleParameters. Changes take effect immediately.
          </p>

          <div style={styles.paramsGrid}>
            {rulesWithParams.map((rule) => {
              const params = paramsByRule.get(rule.id) ?? [];
              return (
                <div key={rule.id} style={styles.paramCard}>
                  <div style={styles.paramCardTitle}>{rule.display_name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
                    {rule.rule_key}
                  </div>
                  {params.map((p) => {
                    const draftKey = `${p.rule_id}-${p.param_key}`;
                    const draft = paramDrafts[draftKey] ?? p.param_value;
                    const isSaving = saving === `param-${p.rule_id}-${p.param_key}`;

                    return (
                      <div key={p.id} style={styles.paramRow}>
                        <label style={styles.paramLabel}>{p.param_key}</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={draft}
                            onChange={(e) =>
                              setParamDrafts((prev) => ({
                                ...prev,
                                [draftKey]: e.target.value,
                              }))
                            }
                            style={styles.paramInput}
                          />
                          <button
                            onClick={() =>
                              handleParamSave(
                                rule,
                                p.param_key,
                                draft,
                                p.content_type_id
                              )
                            }
                            disabled={isSaving || draft === p.param_value}
                            style={{
                              ...styles.btnSave,
                              opacity:
                                isSaving || draft === p.param_value ? 0.4 : 1,
                            }}
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
      )}

      {/* Add Content Type */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Add Content Type</h2>
        <p style={styles.sectionSubtitle}>
          Creates a new ContentTypes row and auto-populates ContentTypeRules for all 31 existing rules (enabled by default).
        </p>

        <div style={styles.addCTForm}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Key</label>
            <input
              placeholder="e.g. controls"
              value={newCT.contentTypeKey}
              onChange={(e) =>
                setNewCT((p) => ({ ...p, contentTypeKey: e.target.value }))
              }
              style={styles.formInput}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Display Name</label>
            <input
              placeholder="e.g. Controls"
              value={newCT.displayName}
              onChange={(e) =>
                setNewCT((p) => ({ ...p, displayName: e.target.value }))
              }
              style={styles.formInput}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Pass Threshold</label>
            <input
              type="number"
              min={0}
              max={100}
              value={newCT.passThreshold}
              onChange={(e) =>
                setNewCT((p) => ({ ...p, passThreshold: e.target.value }))
              }
              style={{ ...styles.formInput, width: 80 }}
            />
          </div>
          <button
            onClick={handleAddContentType}
            disabled={
              addingCT || !newCT.contentTypeKey || !newCT.displayName
            }
            style={{
              ...styles.btnPrimary,
              alignSelf: 'flex-end',
              opacity: addingCT || !newCT.contentTypeKey || !newCT.displayName ? 0.5 : 1,
            }}
          >
            {addingCT ? 'Adding…' : '+ Add Content Type'}
          </button>
        </div>

        {/* Existing content types summary */}
        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {config.contentTypes.map((ct) => (
            <div key={ct.id} style={styles.ctChip}>
              <span style={{ fontWeight: 600 }}>{ct.display_name}</span>
              <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 11 }}>
                {ct.content_type_key} · pass ≥ {ct.pass_threshold}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div
          style={{
            ...styles.toast,
            background: toast.ok ? '#14311a' : '#2d1a1a',
            borderColor: toast.ok ? '#166534' : '#7f1d1d',
            color: toast.ok ? '#4ade80' : '#f87171',
          }}
        >
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0b0e',
    color: '#e5e7eb',
    fontFamily: "'DM Mono', 'Fira Code', 'Cascadia Code', monospace",
    padding: '32px 24px 80px',
    maxWidth: 1400,
    margin: '0 auto',
  },
  centeredFull: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0b0e',
    color: '#e5e7eb',
    fontFamily: "'DM Mono', monospace",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: '1px solid #1f2937',
  },
  headerEyebrow: {
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#2563eb',
    fontWeight: 700,
    marginBottom: 4,
  },
  headerTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: '#f9fafb',
    letterSpacing: '-0.01em',
  },
  statsBar: {
    display: 'flex',
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  statBox: {
    background: '#111318',
    border: '1px solid #1f2937',
    borderRadius: 6,
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 100,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#2563eb',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  section: {
    marginBottom: 48,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f3f4f6',
    margin: '0 0 4px',
    letterSpacing: '-0.01em',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    margin: '0 0 20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    border: '1px solid #1f2937',
    borderRadius: 8,
    overflow: 'hidden',
  },
  th: {
    padding: '10px 14px',
    background: '#111318',
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    borderBottom: '1px solid #1f2937',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #1a1f2b',
    verticalAlign: 'middle',
  },
  categoryRow: {
    background: '#0f1117',
    padding: '8px 14px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#6b7280',
    cursor: 'pointer',
    borderBottom: '1px solid #1a1f2b',
    userSelect: 'none',
  },
  categoryCount: {
    marginLeft: 10,
    fontSize: 10,
    color: '#374151',
    fontWeight: 400,
    letterSpacing: '0.05em',
  },
  ruleRow: {
    background: '#0d1017',
    transition: 'background 0.1s',
  },
  defaultScore: {
    fontSize: 12,
    color: '#4b5563',
    fontVariantNumeric: 'tabular-nums',
  },
  scoreInput: {
    width: 60,
    background: '#1a1f2b',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#e5e7eb',
    fontSize: 12,
    padding: '3px 6px',
    textAlign: 'center',
    fontFamily: 'inherit',
    outline: 'none',
  },
  paramsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  paramCard: {
    background: '#111318',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: '16px 18px',
  },
  paramCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e5e7eb',
    marginBottom: 2,
  },
  paramRow: {
    marginBottom: 10,
  },
  paramLabel: {
    display: 'block',
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  paramInput: {
    flex: 1,
    background: '#1a1f2b',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#e5e7eb',
    fontSize: 13,
    padding: '5px 8px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btnSave: {
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.05em',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  addCTForm: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    background: '#111318',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: '20px 24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  formLabel: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  formInput: {
    background: '#1a1f2b',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#e5e7eb',
    fontSize: 13,
    padding: '7px 10px',
    fontFamily: 'inherit',
    outline: 'none',
    minWidth: 160,
  },
  btnPrimary: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.03em',
    fontFamily: 'inherit',
  },
  btnSecondary: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 5,
    padding: '7px 14px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.03em',
  },
  ctChip: {
    background: '#111318',
    border: '1px solid #1f2937',
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: 12,
    color: '#e5e7eb',
  },
  toast: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    padding: '10px 18px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'DM Mono', monospace",
    zIndex: 999,
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    animation: 'fadeIn 0.15s ease',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #1f2937',
    borderTop: '3px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};