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
  CheckCircle,
  AlertCircle,
  FastForward
} from 'lucide-react';

// --- 型定義 ---

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
    level?: Level; // レベル厳格モード時に保持
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
  initialRandom: boolean;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 4,
    levelStrict: false,
    initialRandom: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem('doubles-app-data-v2');
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(data.config || { courtCount: 4, levelStrict: false, initialRandom: false });
      setNextMemberId(data.nextMemberId || 1);
    } else {
      initializeCourts(4);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v2', JSON.stringify(data));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

  const initializeCourts = (count: number) => {
    const newCourts = Array.from({ length: count }, (_, i) => ({ id: i + 1, match: null }));
    setCourts(newCourts);
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

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const initialPlayCount = activeMembers.length > 0 
      ? Math.floor(activeMembers.reduce((sum, m) => sum + m.playCount, 0) / activeMembers.length) 
      : 0;

    const newMember: Member = {
      id: nextMemberId,
      name: `メンバー ${nextMemberId}`,
      level: 'A',
      isActive: true,
      playCount: initialPlayCount,
      matchHistory: {}
    };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const generateMatchForCourt = (courtId: number, currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => {
      if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id));
    });

    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5).sort((a, b) => a.playCount - b.playCount);

    let selected: Member[] = [];
    let matchLevel: Level | undefined = undefined;

    if (config.levelStrict) {
      for (const level of ['A', 'B', 'C'] as Level[]) {
        const sameLevel = shuffled.filter(m => m.level === level);
        if (sameLevel.length >= 4) {
          selected = sameLevel.slice(0, 4);
          matchLevel = level;
          break;
        }
      }
      if (selected.length < 4) return null;
    } else {
      selected = shuffled.slice(0, 4);
    }

    const p = selected;
    const getC = (m1: Member, m2: Member) => m1.matchHistory[m2.id] || 0;
    const costA = getC(p[0], p[1]) + getC(p[2], p[3]);
    const costB = getC(p[0], p[2]) + getC(p[1], p[3]);
    const costC = getC(p[0], p[3]) + getC(p[1], p[2]);

    let order = [0, 1, 2, 3];
    if (costB <= costA && costB <= costC) order = [0, 2, 1, 3];
    else if (costC <= costA && costC <= costB) order = [0, 3, 1, 2];

    return {
      p1: p[order[0]].id, p2: p[order[1]].id,
      p3: p[order[2]].id, p4: p[order[3]].id,
      level: matchLevel
    };
  };

  const handleSingleGenerate = (courtId: number) => {
    const match = generateMatchForCourt(courtId, courts, members);
    if (!match) {
      alert('条件に合う待機メンバーが足りません');
      return;
    }
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const finishMatch = (courtId: number) => {
    setCourts(prevCourts => {
      const court = prevCourts.find(c => c.id === courtId);
      if (!court || !court.match) return prevCourts;

      const ids = [court.match.p1, court.match.p2, court.match.p3, court.match.p4];
      const playerNames = ids.map(id => members.find(m => m.id === id)?.name || '?');

      setMatchHistory(prev => [{
        id: Date.now().toString() + courtId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        courtId,
        players: playerNames,
        playerIds: ids,
        level: court.match?.level
      }, ...prev]);

      setMembers(prevM => prevM.map(m => {
        if (!ids.includes(m.id)) return m;
        const newHistory = { ...m.matchHistory };
        ids.forEach(oid => { if (m.id !== oid) newHistory[oid] = (newHistory[oid] || 0) + 1; });
        return { ...m, playCount: m.playCount + 1, matchHistory: newHistory };
      }));

      return prevCourts.map(c => c.id === courtId ? { ...c, match: null } : c);
    });
  };

  const handleBulkAction = () => {
    // 1. 全ての終了ボタンを押す（稼働中のコートをすべて終了）
    courts.forEach(c => { if (c.match) finishMatch(c.id); });
    
    // 2. 順次、空いたコートに割り当て（少し遅延させないとState更新が間に合わないため、直接計算用の変数を回す）
    setTimeout(() => {
      setCourts(currentCourts => {
        let updatedCourts = [...currentCourts];
        let tempMembers = [...members]; // プレイ回数などの更新はfinishMatchで行われるが、反映待ちのため

        updatedCourts = updatedCourts.map(c => {
          if (c.match) return c;
          const match = generateMatchForCourt(c.id, updatedCourts, tempMembers);
          return match ? { ...c, match } : c;
        });
        return updatedCourts;
      });
    }, 100);
  };

  const getLevelColor = (l?: Level) => {
    if (l === 'A') return 'bg-blue-500';
    if (l === 'B') return 'bg-yellow-500';
    if (l === 'C') return 'bg-red-500';
    return 'bg-gray-400';
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24 font-sans text-sm">
      <header className="bg-slate-800 text-white p-3 shadow-md sticky top-0 z-30 flex justify-between items-center">
        <h1 className="font-bold flex items-center gap-2"><Trophy size={18} /> ダブルス割</h1>
        {activeTab === 'dashboard' && (
          <button onClick={handleBulkAction} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg transition-transform active:scale-95">
            <FastForward size={14} /> 全コート一括更新
          </button>
        )}
      </header>

      <main className="p-2 max-w-4xl mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-2 gap-2">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                <div className="bg-gray-100 p-1.5 flex justify-between items-center border-b">
                  <span className="font-bold text-xs">Court {court.id}</span>
                  {court.match?.level && <span className={`${getLevelColor(court.match.level)} text-white px-1.5 rounded-full text-[10px] font-black`}>{court.match.level}</span>}
                </div>
                <div className="p-2 flex-1 flex flex-col justify-center min-h-[110px]">
                  {court.match ? (
                    <div className="space-y-1">
                      <div className="grid grid-cols-2 gap-1 text-center">
                        <div className="bg-blue-50 py-1 rounded text-[11px] truncate px-0.5">{members.find(m => m.id === court.match?.p1)?.name}</div>
                        <div className="bg-blue-50 py-1 rounded text-[11px] truncate px-0.5">{members.find(m => m.id === court.match?.p2)?.name}</div>
                      </div>
                      <div className="text-[10px] text-gray-400 text-center font-bold">vs</div>
                      <div className="grid grid-cols-2 gap-1 text-center">
                        <div className="bg-red-50 py-1 rounded text-[11px] truncate px-0.5">{members.find(m => m.id === court.match?.p3)?.name}</div>
                        <div className="bg-red-50 py-1 rounded text-[11px] truncate px-0.5">{members.find(m => m.id === court.match?.p4)?.name}</div>
                      </div>
                      <button onClick={() => finishMatch(court.id)} className="w-full mt-2 bg-gray-700 text-white py-1 rounded text-[10px] font-bold">終了</button>
                    </div>
                  ) : (
                    <button onClick={() => handleSingleGenerate(court.id)} className="border-2 border-dashed border-gray-200 text-gray-400 py-4 rounded flex flex-col items-center gap-1 hover:bg-gray-50">
                      <Plus size={20} />
                      <span className="text-[10px]">自動割付</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <h2 className="font-bold">メンバー ({members.length})</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-3 py-1 rounded text-xs flex items-center gap-1"><Plus size={14} />追加</button>
            </div>
            <div className="bg-white rounded shadow divide-y">
              {members.map(member => (
                <div key={member.id} className={`p-2 flex items-center gap-2 ${!member.isActive ? 'bg-gray-50 opacity-50' : ''}`}>
                  <span className="text-[10px] text-gray-400 w-4 font-mono">{member.id}</span>
                  <input 
                    className="flex-1 font-bold bg-transparent outline-none border-b border-transparent focus:border-blue-300" 
                    value={member.name} 
                    onChange={e => setMembers(prev => prev.map(m => m.id === member.id ? {...m, name: e.target.value} : m))}
                  />
                  <select 
                    value={member.level} 
                    className="text-xs border rounded p-0.5"
                    onChange={e => setMembers(prev => prev.map(m => m.id === member.id ? {...m, level: e.target.value as Level} : m))}
                  >
                    <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                  </select>
                  <button 
                    onClick={() => setMembers(prev => prev.map(m => m.id === member.id ? {...m, isActive: !m.isActive} : m))}
                    className={`text-[10px] px-2 py-1 rounded border font-bold ${member.isActive ? 'border-blue-500 text-blue-600' : 'bg-gray-200'}`}
                  >
                    {member.isActive ? '参' : '休'}
                  </button>
                  <button onClick={() => setMembers(prev => prev.filter(m => m.id !== member.id))} className="text-gray-300"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            <h2 className="font-bold px-1">履歴</h2>
            <div className="bg-white rounded shadow overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-100">
                  <tr><th className="p-2 w-16">時刻</th><th className="p-2 w-10">C</th><th className="p-2">対戦</th></tr>
                </thead>
                <tbody className="divide-y">
                  {matchHistory.map(h => (
                    <tr key={h.id}>
                      <td className="p-2 text-gray-400">{h.timestamp}</td>
                      <td className="p-2 text-center font-bold">{h.courtId}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {h.level && <span className={`${getLevelColor(h.level)} text-white text-[9px] px-1 rounded font-black`}>{h.level}</span>}
                          {h.players[0]} & {h.players[1]} <span className="text-gray-300">vs</span> {h.players[2]} & {h.players[3]}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4 p-2">
            <div className="bg-white p-4 rounded shadow space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2">コート数: {config.courtCount}</label>
                <input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <span>レベル厳格モード (A/B/C固定)</span>
                <button onClick={() => setConfig(prev => ({...prev, levelStrict: !prev.levelStrict}))} className={`w-10 h-5 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config.levelStrict ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <button onClick={() => {if(confirm('リセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-2 border border-red-500 text-red-500 rounded text-xs">全データを削除</button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-1 pb-safe z-40">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center p-2 rounded ${activeTab === t.id ? 'text-blue-600' : 'text-gray-400'}`}>
            <t.icon size={20} />
            <span className="text-[9px] font-bold">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
