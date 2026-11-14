"use client";

import React from "react";
import { BarChart3, Trophy, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { YearComparisonItem } from "../lib/types";

interface YearComparisonChartProps {
  yearComparison: YearComparisonItem[];
  selectedDbId?: string;
  onSelectYearDb?: (databaseId: string) => void;
}

export const YearComparisonChart: React.FC<YearComparisonChartProps> = ({
  yearComparison,
  selectedDbId,
  onSelectYearDb,
}) => {
  if (!yearComparison || yearComparison.length <= 1) return null;

  const winner = yearComparison.find((y) => y.is_winner) || yearComparison[0];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Multi-Year Historical Grid Correlation Sweep
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
            <Trophy className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            <span>
              Top Match: Year {winner.year} (r = {winner.peak_r.toFixed(4)}
              {winner.diff_r !== undefined ? `, Δf: r = ${winner.diff_r.toFixed(3)}` : ""}
              {`, RMSE = ${winner.rmse_mhz.toFixed(1)} mHz`})
            </span>
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Cross-correlation was evaluated across {yearComparison.length} historical grid datasets simultaneously.
        Notice how the authentic dataset stands out with high Pearson correlation and coherent micro-wiggles, while non-matching years remain at the stochastic noise floor.
      </p>

      {/* Year Leaderboard Grid */}
      <div className="space-y-2">
        {yearComparison.map((item) => {
          const isWinner = item.is_winner;
          const isSelected = selectedDbId === item.database_id;
          const barWidth = Math.max(8, Math.min(100, Math.round(Math.max(0, item.peak_r) * 100)));

          return (
            <div
              key={item.database_id}
              onClick={() => onSelectYearDb && onSelectYearDb(item.database_id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isWinner
                  ? "bg-emerald-950/40 border-emerald-500/70 shadow-md shadow-emerald-950/40"
                  : isSelected
                  ? "bg-cyan-950/40 border-cyan-500/70"
                  : "bg-slate-950 border-slate-800/80 hover:border-slate-700"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      isWinner
                        ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/50"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    Year {item.year}
                  </span>
                  {isWinner ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>{item.verdict || "AUTHENTICATED MATCH"}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-500">
                      {item.verdict === "SPURIOUS CORRELATION (WRONG YEAR/GRID)"
                        ? "Coincidental Slope / Rejected"
                        : "Background Noise Floor"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-slate-400 text-[11px] flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-emerald-400" />
                    {item.matched_gmt || item.matched_utc}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-black ${
                        isWinner ? "text-emerald-400 text-sm" : "text-slate-400"
                      }`}
                    >
                      r = {item.peak_r.toFixed(4)}
                    </span>
                    {item.diff_r !== undefined && (
                      <span className="text-[10px] text-cyan-400 font-mono">
                        (Δf: {item.diff_r.toFixed(3)})
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      RMSE: {item.rmse_mhz.toFixed(1)}mHz
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar showing correlation magnitude */}
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/60">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    isWinner
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : item.peak_r >= 0.70
                      ? "bg-amber-600/70"
                      : "bg-slate-700"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
