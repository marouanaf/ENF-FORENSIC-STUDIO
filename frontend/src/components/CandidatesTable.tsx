"use client";

import React from "react";
import { ListOrdered, Clock, Globe2 } from "lucide-react";
import { MatchCandidate } from "../lib/types";

interface CandidatesTableProps {
  candidates: MatchCandidate[];
  selectedRank: number;
  onSelectRank: (rank: number) => void;
}

export const CandidatesTable: React.FC<CandidatesTableProps> = ({
  candidates,
  selectedRank,
  onSelectRank,
}) => {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Top 5 Independent Historical Candidate Matches
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Ranked by Pearson r (≥300s window separation)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
              <th className="py-2.5 px-3">Rank</th>
              <th className="py-2.5 px-3">Africa/Casablanca Time</th>
              <th className="py-2.5 px-3">Universal Time (UTC)</th>
              <th className="py-2.5 px-3 text-right">Pearson r</th>
              <th className="py-2.5 px-3 text-right">RMSE (mHz)</th>
              <th className="py-2.5 px-3 text-right">MSE (Hz²)</th>
              <th className="py-2.5 px-3 text-right">Z-Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {candidates.map((cand) => {
              const isFirst = cand.rank === 1;
              const isSelected = cand.rank === selectedRank;

              return (
                <tr
                  key={cand.rank}
                  onClick={() => onSelectRank(cand.rank)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-emerald-950/40 text-emerald-200"
                      : "hover:bg-slate-800/50 text-slate-300"
                  }`}
                >
                  <td className="py-2.5 px-3 font-bold flex items-center gap-1.5">
                    {isFirst ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                        ★ #1
                      </span>
                    ) : (
                      <span className="text-slate-500">#{cand.rank}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-300">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {cand.casablanca_time || cand.start_timestamp_utc}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {cand.start_timestamp_utc}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                    {cand.pearson_r.toFixed(5)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-cyan-300">
                    {cand.rmse_mhz.toFixed(2)} mHz
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {cand.mse.toExponential(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-amber-400 font-semibold">
                    +{cand.relative_z_score.toFixed(1)} σ
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
