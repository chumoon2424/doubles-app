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

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  matchHistory: Record<number, number>;
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
    courtCount: 4,
    levelStrict: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem('doubles-app-data-v8');
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(data.config || { courtCount: 4, levelStrict: false });
      setNextMemberId(data.nextMemberId || 1);
    } else {
      initializeCourts(4);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v8', JSON.stringify(data));
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
    if (confirm('全員の試合数と対戦履歴をリセットします。')) {
      setMembers(prev => prev.map(m => ({ ...m, playCount: 0, matchHistory: {} })));
    }
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const newMember: Member = { id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, playCount: avgPlay, matchHistory: {} };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const applyMatchToMembers = (playerIds: number[]) => {
    setMembers(prevM => prevM.map(m => {
      if (!playerIds.includes(m.id)) return m;
      const newH = { ...m.matchHistory };
      playerIds.forEach(oid => { if (m.id !== oid) newH[oid] = (newH[oid] || 0) + 1; });
      return { ...m, playCount: m.playCount + 1, matchHistory: newH };
    }));
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

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

    const p = selected;
    const getC = (m1: Member, m2: Member) => m1.matchHistory[m2.id] || 0;
    const costs = [
      { order: [0, 1, 2, 3], c: getC(p[0], p[1]) + getC(p[2], p[3]) },
      { order: [0, 2, 1, 3], c: getC(p[0], p[2]) + getC(p[1], p[3]) },
      { order: [0, 3, 1, 2], c: getC(p[0], p[3]) + getC(p[1], p[2]) }
    ].sort((a, b) => a.c - b.c || Math.random() - 0.5);

    const o = costs[0].order;
    return { p1: p[o[0]].id, p2: p[o[1]].id, p3: p[o[2]].id, p4: p[o[3]].id, level: matchLevel };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('待機メンバーが足りません');
    applyMatchToMembers([match.p1, match.p2, match.p3, match.p4]);
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

      return prevCourts.map(c => c.id === courtId ? { ...c, match: null } : c);
    });
  };

  const handleBulkAction = () => {
    courts.filter(c => c.match).forEach(c => finishMatch(c.id));
    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        for (let i = 0; i < current.length; i++) {
          if (!current[i].match) {
            const match = getMatchForCourt(current, members);
            if (match) {
              current[i] = { ...current[i], match };
              applyMatchToMembers([match.p1, match.p2, match.p3, match.p4]);
            }
          }
        }
        return current;
      });
    }, 200);
  };

  const getLevelBadge = (l?: Level) => {
    if (!l) return null;
    const c = { A: 'bg-blue-600', B: 'bg-yellow-500', C: 'bg-red-500' };
    return <span className={`ml-2 px-2 py-0.5 rounded text-[10px] text-white ${c[l]}`}>{l}</span>;
  };

  const toggleLevel = (currentLevel: Level): Level => {
    if (currentLevel === 'A') return 'B';
    if (currentLevel === 'B') return 'C';
    return 'A';
  };

  const getDynamicFontSize = (name: string = '') => {
    const len = name.length;
    if (len <= 2) return 'clamp(1.5rem, 10vw, 3.8rem)';
    if (len <= 4) return 'clamp(1.2rem, 8vw, 3.2rem)';
    if (len <= 6) return 'clamp(1rem, 6vw, 2.4rem)';
    return 'clamp(0.8rem, 5vw, 1.8rem)';
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans overflow-x-hidden">
      <header className="bg-blue-800 text-white px-4 py-3 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> ダブルス割</h1>
        {activeTab === 'dashboard' && (
          <button onClick={handleBulkAction} className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">
            一括更新
          </button>
        )}
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[160px]">
                <div className="bg-gray-50 px-4 py-1.5 border-b flex justify-between items-center shrink-0">
                  <span className="font-bold text-xs text-gray-500 uppercase tracking-widest">Court {court.id} {getLevelBadge(court.match?.level)}</span>
                </div>
                <div className="flex-1 p-3 flex flex-col justify-center">
                  {court.match ? (
                    <div className="flex items-center gap-2 h-full">
                      <div className="flex-1 grid grid-cols-2 gap-2 h-full">
                        <div className="bg-blue-50 rounded-lg flex flex-col justify-center items-center border border-blue-100 px-2 overflow-hidden py-1">
                          <div className="w-full text-center leading-tight mb-1 font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p1)?.name) }}>
                            {members.find(m => m.id === court.match?.p1)?.name}
                          </div>
                          <div className="w-full text-center leading-tight font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p2)?.name) }}>
                            {members.find(m => m.id === court.match?.p2)?.name}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg flex flex-col justify-center items-center border border-red-100 px-2 overflow-hidden py-1">
                          <div className="w-full text-center leading-tight mb-1 font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p3)?.name) }}>
                            {members.find(m => m.id === court.match?.p3)?.name}
                          </div>
                          <div className="w-full text-center leading-tight font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p4)?.name) }}>
                            {members.find(m => m.id === court.match?.p4)?.name}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => finishMatch(court.id)} className="bg-gray-800 text-white px-5 h-full min-h-[80px] rounded-lg font-bold text-sm lg:text-lg shrink-0 flex items-center shadow-inner">終了</button>
                    </div>
                  ) : (
                    <button onClick={() => generateNextMatch(court.id)} className="w-full min-h-[100px] border-2 border-dashed border-gray-300 text-gray-400 font-bold text-xl rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors">
                      <Play size={28} /> 割当
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2">
              <h2 className="font-bold text-xl text-gray-700">名簿 ({members.length})</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden">
              {members.map(m => (
                <div key={m.id} className={`p-4 flex items-center gap-4 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-4 mt-1">
                      <button 
                        onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, level: toggleLevel(m.level) } : x))}
                        className={`text-xs font-bold rounded-md px-3 py-1 text-white transition-colors ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}
                      >
                        レベル{m.level}
                      </button>
                      <span className="text-xs text-gray-400 font-bold tracking-wider">試合数: {m.playCount}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 transition-all ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>
                    {m.isActive ? '参加中' : '休み'}
                  </button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 transition-colors px-2"><Trash2 size={24} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400">
                <tr><th className="p-4 text-xs font-bold uppercase tracking-widest">時刻</th><th className="p-4 text-xs font-bold uppercase tracking-widest">対戦</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}>
                    <td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td>
                    <td className="p-4 font-bold text-base">
                      {getLevelBadge(h.level)} {h.players[0]}, {h.players[1]} <span className="text-gray-300 px-1 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-[0.2em]">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label>
              <input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50">
              <span className="font-bold text-lg text-gray-700">レベル厳格モード</span>
              <button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} />
              </button>
            </div>
            <div className="space-y-4">
              <button onClick={resetPlayCountsOnly} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border border-gray-200 active:bg-gray-100 transition-colors">
                <RotateCcw size={20} /> 試合数と履歴をリセット
              </button>
              <button onClick={() => {if(confirm('名簿を含め全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100 active:bg-red-100 transition-colors">
                データを完全消去
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around pb-safe z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === tab.id ? 'text-blue-600 scale-110' : 'text-gray-300'}`}>
            <tab.icon size={26} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-bold mt-1.5">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
