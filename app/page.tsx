'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  History, 
  Play, 
  Plus, 
  Trash2, 
  RefreshCw,
  Trophy,
  FastForward,
  RotateCcw
} from 'lucide-react';

// --- 型定義 ---
type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  matchHistory: Record<number, number>; // 同時プレイ回数（ペアまたは対戦相手）
}

interface Court {
  id: number;
  match: {
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    level?: Level;
  } | null;
}

interface MatchRecord {
  id: string;
  timestamp: string;
  courtId: number;
  players: string[];
  playerIds: number[];
  level?: Level;
}

interface AppConfig {
  courtCount: number;
  levelStrict: boolean;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 3,
    levelStrict: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem('doubles-app-data-v6');
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(data.config || { courtCount: 3, levelStrict: false });
      setNextMemberId(data.nextMemberId || 1);
    } else {
      initializeCourts(3);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v6', JSON.stringify(data));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

  const initializeCourts = (count: number) => {
    setCourts(Array.from({ length: count }, (_, i) => ({ id: i + 1, match: null })));
  };

  const handleCourtCountChange = (count: number) => {
    setConfig(prev => ({ ...prev, courtCount: count }));
    setCourts(prev => {
      if (count > prev.length) {
        const added = Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i + 1, match: null }));
        return [...prev, ...added];
      }
      return prev.slice(0, count);
    });
  };

  const resetPlayCountsOnly = () => {
    if (confirm('全員の試合数と対戦履歴（ペア相性）をリセットします。名簿は維持されます。よろしいですか？')) {
      setMembers(prev => prev.map(m => ({
        ...m,
        playCount: 0,
        matchHistory: {}
      })));
      alert('試合数をリセットしました。');
    }
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const newMember: Member = { id: nextMemberId, name: `メンバー ${nextMemberId}`, level: 'A', isActive: true, playCount: avgPlay, matchHistory: {} };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });

    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    // 1. 試合数(少) 2. 同数なら完全ランダム
    const sortedCandidates = [...candidates].sort((a, b) => {
      if (a.playCount !== b.playCount) return a.playCount - b.playCount;
      return Math.random() - 0.5;
    });

    let selected: Member[] = [];
    let matchLevel: Level | undefined = undefined;

    if (config.levelStrict) {
      for (const base of sortedCandidates) {
        const sameLevel = candidates.filter(m => m.level === base.level);
        if (sameLevel.length >= 4) {
          selected = [...sameLevel].sort((a, b) => a.playCount - b.playCount || Math.random() - 0.5).slice(0, 4);
          matchLevel = base.level;
          break;
        }
      }
    } else {
      selected = sortedCandidates.slice(0, 4);
    }

    if (selected.length < 4) return null;

    // ペア組み最適化（過去に組んだ/対戦した回数が少ない組み合わせを優先）
    const p = selected;
    const getC = (m1: Member, m2: Member) => m1.matchHistory[m2.id] || 0;
    
    // コスト計算: 直近の試合履歴に重みをつける
    const costs = [
      { order: [0, 1, 2, 3], c: getC(p[0], p[1]) + getC(p[2], p[3]) }, // ペア: (0,1) & (2,3)
      { order: [0, 2, 1, 3], c: getC(p[0], p[2]) + getC(p[1], p[3]) }, // ペア: (0,2) & (1,3)
      { order: [0, 3, 1, 2], c: getC(p[0], p[3]) + getC(p[1], p[2]) }  // ペア: (0,3) & (1,2)
    ].sort((a, b) => a.c - b.c || Math.random() - 0.5);

    const o = costs[0].order;
    return { p1: p[o[0]].id, p2: p[o[1]].id, p3: p[o[2]].id, p4: p[o[3]].id, level: matchLevel };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('待機メンバーが足りません');
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const finishMatch = (courtId: number) => {
    setCourts(prevCourts => {
      const court = prevCourts.find(c => c.id === courtId);
      if (!court || !court.match) return prevCourts;

      const ids = [court.match.p1, court.match.p2, court.match.p3, court.match.p4];
      const names = ids.map(id => members.find(m => m.id === id)?.name || '?');

      setMatchHistory(prev => [{
        id: Date.now().toString() + courtId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        courtId, players: names, playerIds: ids, level: court.match?.level
      }, ...prev]);

      setMembers(prevM => prevM.map(m => {
        if (!ids.includes(m.id)) return m;
        const newH = { ...m.matchHistory };
        ids.forEach(oid => { if (m.id !== oid) newH[oid] = (newH[oid] || 0) + 1; });
        return { ...m, playCount: m.playCount + 1, matchHistory: newH };
      }));

      return prevCourts.map(c => c.id === courtId ? { ...c, match: null } : c);
    });
  };

  const handleBulkAction = () => {
    const activeIds = courts.filter(c => c.match).map(c => c.id);
    activeIds.forEach(id => finishMatch(id));

    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        for (let i = 0; i < current.length; i++) {
          if (!current[i].match) {
            const match = getMatchForCourt(current, members);
            if (match) current[i] = { ...current[i], match };
          }
        }
        return current;
      });
    }, 200);
  };

  const getLevelBadge = (l?: Level) => {
    if (!l) return null;
    const c = { A: 'bg-blue-600', B: 'bg-yellow-500', C: 'bg-red-500' };
    return <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold text-white ${c[l]}`}>{l}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-sans">
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> ダブルスメーカー</h1>
        {activeTab === 'dashboard' && (
          <button onClick={handleBulkAction} className="bg-white text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 shadow active:scale-95 transition-transform">
            <FastForward size={14} /> 一括更新
          </button>
        )}
      </header>

      <main className="p-4 max-w-3xl mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid gap-3 grid-cols-2">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col min-h-[150px]">
                <div className="bg-gray-100 p-2 border-b flex justify-between items-center">
                  <span className="font-bold text-[11px] text-gray-500">コート {court.id} {getLevelBadge(court.match?.level)}</span>
                </div>
                <div className="p-3 flex-1 flex flex-col justify-center">
                  {court.match ? (
                    <div className="space-y-1.5">
                      <div className="bg-blue-50 p-1.5 rounded text-center text-[11px] font-bold text-blue-800 leading-tight">
                        <div className="truncate">{members.find(m => m.id === court.match?.p1)?.name}</div>
                        <div className="truncate">{members.find(m => m.id === court.match?.p2)?.name}</div>
                      </div>
                      <div className="text-center text-[9px] text-gray-400 font-black italic">VS</div>
                      <div className="bg-red-50 p-1.5 rounded text-center text-[11px] font-bold text-red-800 leading-tight">
                        <div className="truncate">{members.find(m => m.id === court.match?.p3)?.name}</div>
                        <div className="truncate">{members.find(m => m.id === court.match?.p4)?.name}</div>
                      </div>
                      <button onClick={() => finishMatch(court.id)} className="w-full mt-1 bg-gray-800 text-white py-1.5 rounded text-[10px] font-bold">終了</button>
                    </div>
                  ) : (
                    <button onClick={() => generateNextMatch(court.id)} className="bg-blue-600 text-white px-5 py-2 rounded-full text-[11px] font-bold shadow flex items-center gap-1 mx-auto">
                      <Play size={12} /> 割当
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-gray-700">名簿 ({members.length})</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1 font-bold shadow"><Plus size={14} /> 追加</button>
            </div>
            <div className="bg-white rounded-lg shadow divide-y">
              {members.map(m => (
                <div key={m.id} className={`p-3 flex items-center gap-3 ${!m.isActive ? 'bg-gray-50 opacity-50' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full bg-transparent font-bold text-sm outline-none focus:border-b border-blue-400" />
                    <div className="flex items-center gap-3 mt-1">
                      <select value={m.level} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, level: e.target.value as Level } : x))} className="text-[10px] bg-gray-100 rounded p-1 font-bold border-none">
                        <option value="A">レベルA</option><option value="B">レベルB</option><option value="C">レベルC</option>
                      </select>
                      <span className="text-[10px] text-gray-400 font-bold">試合数: {m.playCount}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`text-[10px] px-2 py-1 rounded font-bold border ${m.isActive ? 'border-blue-500 text-blue-600' : 'border-gray-300'}`}>
                    {m.isActive ? '参加' : '休み'}
                  </button>
                  <button onClick={() => {if(confirm('削除しますか？')) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-300"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-700 px-1 text-lg">履歴</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden text-[11px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-500">
                  <tr><th className="p-3 font-bold w-16">時刻</th><th className="p-3 font-bold">対戦</th></tr>
                </thead>
                <tbody className="divide-y">
                  {matchHistory.map(h => (
                    <tr key={h.id}>
                      <td className="p-3 text-gray-400 font-mono">{h.timestamp}</td>
                      <td className="p-3 font-medium flex items-center flex-wrap gap-1">
                        {getLevelBadge(h.level)}
                        {h.players[0]}, {h.players[1]} <span className="text-gray-300 px-1">vs</span> {h.players[2]}, {h.players[3]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-lg shadow p-5 space-y-6">
            <div>
              <label className="block text-xs font-black text-gray-500 mb-3 uppercase tracking-wider">コート数: {config.courtCount}</label>
              <input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>
            <div className="flex items-center justify-between py-3 border-y border-gray-100">
              <span className="text-sm font-bold text-gray-700">レベル厳格モード</span>
              <button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-12 h-6 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${config.levelStrict ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            <div className="space-y-3 pt-2">
              <button onClick={resetPlayCountsOnly} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                <RotateCcw size={16} /> 試合数と相性をリセット
              </button>
              <button onClick={() => {if(confirm('名簿を含む全てのデータを消去して初期化しますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-3 border-2 border-red-50 text-red-500 rounded-xl font-bold text-xs hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                <RefreshCw size={16} /> アプリを完全リセット
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around p-2 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center p-2 transition-colors ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-300'}`}>
            <tab.icon size={22} />
            <span className="text-[10px] font-black mt-1">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
