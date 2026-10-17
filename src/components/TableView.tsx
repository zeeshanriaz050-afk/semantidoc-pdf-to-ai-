import React, { useState } from 'react';
import { Table as TableIcon, Download, Copy, Check } from 'lucide-react';
import { ExtractedTable } from '../types';

interface TableViewProps {
  tables: ExtractedTable[];
}

export const TableView: React.FC<TableViewProps> = ({ tables }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!tables || tables.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 text-slate-400">
        <TableIcon className="w-8 h-8 mx-auto mb-2 text-slate-600" />
        <p className="text-sm">No structured tables detected in this document.</p>
      </div>
    );
  }

  const exportCSV = (tbl: ExtractedTable) => {
    const csvContent = [
      tbl.columns.join(','),
      ...tbl.rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tbl.tableTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyTableJSON = (tbl: ExtractedTable, idx: number) => {
    navigator.clipboard.writeText(JSON.stringify(tbl, null, 2));
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {tables.map((tbl, idx) => (
        <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-indigo-400" />
              <h4 className="text-sm font-semibold text-white">{tbl.tableTitle || `Table ${idx + 1}`}</h4>
              <span className="text-xs text-slate-400">({tbl.rows.length} rows, {tbl.columns.length} cols)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyTableJSON(tbl, idx)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Copy as JSON"
              >
                {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === idx ? 'Copied' : 'JSON'}</span>
              </button>
              <button
                onClick={() => exportCSV(tbl)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 transition-colors"
                title="Download CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/40 text-slate-300 border-b border-slate-800">
                <tr>
                  {tbl.columns.map((col, cIdx) => (
                    <th key={cIdx} className="p-3 font-semibold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {tbl.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="p-3 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};
