import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import type { ColumnInfo } from './api/schema';

type ModalMode = 'create' | 'edit';

export default function Home() {
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const lsKey = (t: string) => `crm_hidden_cols_${t}`;

  const saveHiddenCols = (t: string, hidden: Set<string>) => {
    if (hidden.size === 0) localStorage.removeItem(lsKey(t));
    else localStorage.setItem(lsKey(t), JSON.stringify([...hidden]));
  };

  const loadHiddenCols = (t: string): Set<string> => {
    try {
      const raw = localStorage.getItem(lsKey(t));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  };

  const setAndSaveHiddenColumns = (t: string, hidden: Set<string>) => {
    setHiddenColumns(hidden);
    saveHiddenCols(t, hidden);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTables = async () => {
      const res = await fetch('/api/tables');
      const json = await res.json();
      const names: string[] = json.tables ?? [];
      setTables(names);
      if (names.length > 0) setTable(names[0]);
    };
    fetchTables();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    };
    if (colPickerOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [colPickerOpen]);

  const toggleColumn = (col: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      saveHiddenCols(table, next);
      return next;
    });
  };

  const loadTable = async (targetTable?: string) => {
    const t = targetTable ?? table;
    if (!t) return;
    setError(null);
    setLoading(true);
    setRows([]);
    setPrimaryKeys([]);
    setColumns([]);
    setHiddenColumns(loadHiddenCols(t));
    try {
      const [dataRes, schemaRes] = await Promise.all([
        fetch(`/api/data?table=${encodeURIComponent(t)}`),
        fetch(`/api/schema?table=${encodeURIComponent(t)}`),
      ]);
      const dataJson = await dataRes.json();
      const schemaJson = await schemaRes.json();

      if (dataJson.error) setError(dataJson.error);
      else setRows(dataJson.data ?? []);

      if (!schemaJson.error) {
        setPrimaryKeys(schemaJson.primaryKeys ?? []);
        setColumns(schemaJson.columns ?? []);
      }
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  // Derive headers: prefer column order from schema, fall back to first row keys
  const headers =
    columns.length > 0
      ? columns.map((c) => c.name)
      : rows.length > 0
      ? Object.keys(rows[0])
      : [];

  const visibleHeaders = headers.filter((h) => !hiddenColumns.has(h));

  const emptyForm = () => {
    const empty: Record<string, string> = {};
    headers.forEach((h) => { empty[h] = ''; });
    return empty;
  };

  const openCreateModal = () => {
    setFormData(emptyForm());
    setFormError(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEditModal = (row: any) => {
    const data: Record<string, string> = {};
    headers.forEach((h) => { data[h] = row[h] != null ? String(row[h]) : ''; });
    setFormData(data);
    setFormError(null);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleDelete = async (row: any) => {
    if (!confirm('確定要刪除這筆資料嗎？')) return;
    const pkValues: Record<string, unknown> = {};
    primaryKeys.forEach((pk) => { pkValues[pk] = row[pk]; });
    try {
      const res = await fetch(`/api/data?table=${encodeURIComponent(table)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkValues }),
      });
      const json = await res.json();
      if (json.error) alert(`刪除失敗：${json.error}`);
      else await loadTable();
    } catch (err: any) {
      alert(`刪除失敗：${err.message}`);
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        const res = await fetch(`/api/data?table=${encodeURIComponent(table)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const json = await res.json();
        if (json.error) { setFormError(json.error); return; }
      } else {
        const pkValues: Record<string, unknown> = {};
        primaryKeys.forEach((pk) => { pkValues[pk] = formData[pk]; });
        const res = await fetch(`/api/data?table=${encodeURIComponent(table)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pkValues, row: formData }),
        });
        const json = await res.json();
        if (json.error) { setFormError(json.error); return; }
      }
      setModalOpen(false);
      await loadTable();
    } catch (err: any) {
      setFormError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const hasPK = primaryKeys.length > 0;
  const schemaLoaded = columns.length > 0;

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Head>
        <title>Supabase Viewer</title>
      </Head>

      <h1>Supabase 表格檢視</h1>

      <div style={{ marginTop: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label>選擇表格：</label>
        <select
          value={table}
          onChange={(e) => setTable(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 14 }}
        >
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button onClick={() => loadTable()} disabled={loading || !table}>
          {loading ? '載入中...' : '載入'}
        </button>
        {schemaLoaded && (
          <>
            <div ref={colPickerRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setColPickerOpen((o) => !o)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  fontSize: 14,
                }}
              >
                欄位顯示 {hiddenColumns.size > 0 ? `（隱藏 ${hiddenColumns.size}）` : ''}
              </button>
              {colPickerOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '110%',
                    left: 0,
                    zIndex: 100,
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    padding: '10px 14px',
                    minWidth: 180,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                    <button
                      onClick={() => setAndSaveHiddenColumns(table, new Set())}
                      style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#2563eb', padding: 0, fontSize: 12 }}
                    >
                      全部顯示
                    </button>
                    <button
                      onClick={() => setAndSaveHiddenColumns(table, new Set(headers))}
                      style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#6b7280', padding: 0, fontSize: 12 }}
                    >
                      全部隱藏
                    </button>
                  </div>
                  {headers.map((h) => (
                    <label
                      key={h}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(h)}
                        onChange={() => toggleColumn(h)}
                      />
                      {h}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={openCreateModal}
              style={{
                marginLeft: 8,
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '5px 14px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              + 新增資料
            </button>
          </>
        )}
      </div>

      {schemaLoaded && !hasPK && (
        <div style={{ color: '#b45309', marginBottom: 8, fontSize: 13 }}>
          ⚠️ 此表格找不到主鍵欄位，無法執行編輯或刪除。
        </div>
      )}

      {error && (
        <div style={{ color: 'crimson', marginBottom: 12 }}>錯誤：{error}</div>
      )}

      {rows.length === 0 && !loading ? (
        <div style={{ color: '#6b7280' }}>請選擇表格後按「載入」。</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <thead>
              <tr>
                {visibleHeaders.map((h) => (
                  <th
                    key={h}
                    style={{ border: '1px solid #ddd', padding: '8px 10px', textAlign: 'left', background: '#f3f4f6', whiteSpace: 'nowrap' }}
                  >
                    {h}
                  </th>
                ))}
                {hasPK && (
                  <th style={{ border: '1px solid #ddd', padding: '8px 10px', background: '#f3f4f6', whiteSpace: 'nowrap' }}>
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                  {visibleHeaders.map((h) => (
                    <td key={h} style={{ border: '1px solid #eee', padding: '8px 10px' }}>
                      {String(r[h] ?? '')}
                    </td>
                  ))}
                  {hasPK && (
                    <td style={{ border: '1px solid #eee', padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => openEditModal(r)}
                        style={{
                          marginRight: 6,
                          padding: '3px 10px',
                          cursor: 'pointer',
                          border: '1px solid #3b82f6',
                          borderRadius: 3,
                          background: 'white',
                          color: '#2563eb',
                          fontSize: 13,
                        }}
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        style={{
                          padding: '3px 10px',
                          cursor: 'pointer',
                          border: '1px solid #ef4444',
                          borderRadius: 3,
                          background: 'white',
                          color: '#dc2626',
                          fontSize: 13,
                        }}
                      >
                        刪除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
            共 {rows.length} 筆（最大 200）
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div
            style={{
              background: 'white', borderRadius: 8, padding: 28, width: 500,
              maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 18 }}>
              {modalMode === 'create' ? '新增資料' : '編輯資料'}
            </h2>

            {formError && (
              <div style={{ color: 'crimson', marginBottom: 14, fontSize: 13 }}>
                錯誤：{formError}
              </div>
            )}

            {headers.map((h) => {
              const isPK = primaryKeys.includes(h);
              const isReadOnly = isPK && modalMode === 'edit';
              return (
                <div key={h} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#374151', fontWeight: 500 }}>
                    {h}
                    {isPK && (
                      <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                        主鍵{modalMode === 'create' ? '（留空則自動產生）' : '（不可修改）'}
                      </span>
                    )}
                  </label>
                  <input
                    value={formData[h] ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [h]: e.target.value }))
                    }
                    readOnly={isReadOnly}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      background: isReadOnly ? '#f3f4f6' : 'white',
                      color: isReadOnly ? '#6b7280' : 'inherit',
                    }}
                  />
                </div>
              );
            })}

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                style={{
                  padding: '7px 18px', cursor: 'pointer',
                  border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14,
                }}
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: '7px 18px', cursor: 'pointer',
                  background: submitting ? '#93c5fd' : '#2563eb',
                  color: 'white', border: 'none', borderRadius: 4, fontSize: 14,
                }}
              >
                {submitting ? '處理中...' : modalMode === 'create' ? '新增' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
