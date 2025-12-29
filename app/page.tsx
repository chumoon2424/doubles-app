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
  initialRandom: boolean;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 2,
    levelStrict: false,
    initialRandom: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem('doubles-app-data-v4');
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(data.config || { courtCount: 2, levelStrict: false, initialRandom: false });
      setNextMemberId(data.nextMemberId || 1);
    } else {
      initializeCourts(2);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v4', JSON.stringify(data));
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

  // --- 試合割付ロジック核心 ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => {
      if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id));
    });

    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    // 試合数でソート（昇順：少ない人ほど前）
    const sortedCandidates = [...candidates].sort((a, b) => {
        if(a.playCount !== b.playCount) return a.playCount - b.playCount;
        return a.id - b.id; // 同じならID順で固定（ランダム性は後で入れる）
    });

    let selectedPlayers: Member[] = [];
    let matchLevel: Level | undefined = undefined;

    if (config.levelStrict) {
      // 厳格モード：一番「待ち」が長い人（sortedCandidates[0]）を基準に、その人のレベルで組めるか探す
      // もし組めないなら、次に待ちが長い人を基準に...というループ
      for (const baseMember of sortedCandidates) {
        const sameLevel = candidates.filter(m => m.level === baseMember.level);
        if (sameLevel.length >= 4) {
          // そのレベルの中で、試合数が少ない順に4人選ぶ
          selectedPlayers = [...sameLevel].sort((a,b) => a.playCount - b.playCount).slice(0, 4);
          matchLevel = baseMember.level;
          break; // 最優先の「待ち人」が含まれるレベルが見つかれば確定
        }
      }
    } else {
      // 通常モード：単に試合数が少ない4人
      selectedPlayers = sortedCandidates.slice(0, 4);
    }

    if (selectedPlayers.length < 4) return null;

    // ペアリング最適化（過去の対戦履歴コスト計算）
    const p = selectedPlayers;
    const getCount = (m1: Member, m2: Member) => m1.matchHistory[m2.id] || 0;
    
    // 3パターンのペアリングコスト
    const costs = [
        { order: [0, 1, 2, 3], cost: getCount(p[0], p[1]) + getCount(p[2], p[3]) },
        { order: [0, 2, 1, 3], cost: getCount(p[0], p[2]) + getCount(p[1], p[3]) },
        { order: [0, 3, 1, 2], cost: getCount(p[0], p[3]) + getCount(p[1], p[2]) }
    ];
    // コストが最小のものを採用（同値ならランダムに選ばれるようシャッフル）
    costs.sort((a, b) => a.cost - b.cost || Math.random() - 0.5);
    const finalOrder = costs[0].order;

    return {
      p1: p[finalOrder[0]].id, p2: p[finalOrder[1]].id,
      p3: p[finalOrder[2]].id, p4: p[finalOrder[3]].id,
      level: matchLevel
    };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) {
      alert('条件に合う待機メンバーが足りません。');
      return;
    }
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const finishMatch = (courtId: number) => {
    setCourts(prevCourts => {
      const court = prevCourts.find(c => c.id === courtId);
      if (!court || !court.match) return prevCourts;

      const { p1, p2, p3, p4, level } = court.match;
      const playerIds = [p1, p2, p3, p4];
      const playerNames = playerIds.map(id => members.find(m => m.id === id)?.name || '不明');

      // 履歴追加
      setMatchHistory(prev => [{
        id: Date.now().toString() + courtId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        courtId, players: playerNames, playerIds, level
      }, ...prev]);

      // メンバーデータ更新
      setMembers(prevM => prevM.map(m => {
        if (!playerIds.includes(m.id)) return m;
        const newHistory = { ...m.matchHistory };
        playerIds.forEach(oid => { if (m.id !== oid) newHistory[oid] = (newHistory[oid] || 0) + 1; });
        return { ...m, playCount: m.playCount + 1, matchHistory: newHistory };
      }));

      return prevCourts.map(c => c.id === courtId ? { ...c, match: null } : c);
    });
  };

  const handleBulkAction = () => {
    // 1. 全稼働コート終了
    const activeCourts = courts.filter(c => c.match);
    activeCourts.forEach(c => finishMatch(c.id));

    // 2. 順次割付
    setTimeout(() => {
      setCourts(prevCourts => {
        let currentCourts = [...prevCourts];
        for (let i = 0; i < currentCourts.length; i++) {
          if (!currentCourts[i].match) {
            const match = getMatchForCourt(currentCourts, members);
            if (match) currentCourts[i] = { ...currentCourts[i], match };
          }
        }
        return currentCourts;
      });
    }, 100);
  };

  const getLevelBadge = (level?: Level) => {
    if (!level) return null;
    const colors = { A: 'bg-blue-600', B: 'bg-yellow-500', C: 'bg-red-500' };
    return <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold text-white ${colors[level]}`}>{level}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-sans">
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> ダブルスメーカー</h1>
        {activeTab === 'dashboard' && (
          <button onClick={handleBulkAction} className="bg-white text-blue-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow active:scale-95 transition-transform">
            <FastForward size={14} /> 一括更新
          </button>
        )}
      </header>

      <main className="p-4 max-w-3xl mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              {courts.map(court => (
                <div key={court.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden min-h-[160px] flex flex-col">
                  <div className="bg-gray-100 p-2 border-b flex justify-between items-center">
                    <span className="font-bold text-xs text-gray-600">コート {court.id} {getLevelBadge(court.match?.level)}</span>
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-center">
                    {court.match ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-1 bg-blue-50 p-1.5 rounded text-center text-[11px] font-medium text-blue-800">
                          <div className="truncate">{members.find(m => m.id === court.match?.p1)?.name}</div>
                          <div className="truncate">{members.find(m => m.id === court.match?.p2)?.name}</div>
                        </div>
                        <div className="text-center text-[9px] text-gray-400 font-bold italic">VS</div>
                        <div className="grid grid-cols-1 gap-1 bg-red-50 p-1.5 rounded text-center text-[11px] font-medium text-red-800">
                          <div className="truncate">{members.find(m => m.id === court.match?.p3)?.name}</div>
                          <div className="truncate">{members.find(m => m.id === court.match?.p4)?.name}</div>
                        </div>
                        <button onClick={() => finishMatch(court.id)} className="w-full mt-1 bg-gray-800 text-white py-1.5 rounded text-xs font-bold">終了</button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <button onClick={() => generateNextMatch(court.id)} className="bg-blue-600 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1 mx-auto hover:bg-blue-700">
                          <Play size={14} /> 割当
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">メンバー管理 ({members.length}名)</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-3 py-1.5 rounded shadow text-xs flex items-center gap-1"><Plus size={16} /> 追加</button>
            </div>
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {members.map(member => (
                <div key={member.id} className={`p-3 flex items-center gap-3 ${!member.isActive ? 'bg-gray-50 opacity-60' : ''}`}>
                  <div className="flex-1">
                    <input value={member.name} onChange={e => setMembers(prev => prev.map(m => m.id === member.id ? { ...m, name: e.target.value } : m))} className="w-full border-b border-transparent focus:border-blue-500 outline-none bg-transparent font-medium" />
                    <div className="flex items-center gap-2 mt-1">
                      <select value={member.level} onChange={e => setMembers(prev => prev.map(m => m.id === member.id ? { ...m, level: e.target.value as Level } : m))} className="text-[10px] bg-gray-100 rounded p-1 font-bold">
                        <option value="A">Aレベル</option><option value="B">Bレベル</option><option value="C">Cレベル</option>
                      </select>
                      <span className="text-[10px] text-gray-500 font-bold">試合数: {member.playCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setMembers(prev => prev.map(m => m.id === member.id ? { ...m, isActive: !m.isActive } : m))} className={`text-[10px] px-2 py-1 rounded font-bold border transition-colors ${member.isActive ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-400'}`}>
                      {member.isActive ? '参加中' : '休憩'}
                    </button>
                    <button onClick={() => {if(confirm('削除しますか？')) setMembers(prev => prev.filter(m => m.id !== member.id))}} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">履歴</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 text-gray-600 font-medium">
                  <tr><th className="p-3 w-16">時刻</th><th className="p-3">対戦内容</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matchHistory.map(record => (
                    <tr key={record.id}>
                      <td className="p-3 text-gray-400 font-mono">{record.timestamp}</td>
                      <td className="p-3">
                        <div className="flex items-center flex-wrap gap-1 text-[11px]">
                          {getLevelBadge(record.level)}
                          <span className="font-medium text-gray-700">{record.players[0]}, {record.players[1]} <span className="text-gray-300 mx-1">vs</span> {record.players[2]}, {record.players[3]}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {matchHistory.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-gray-400">履歴がありません</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold">設定</h2>
            <div className="bg-white rounded-lg shadow p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">コート数: <span className="text-blue-600 font-bold">{config.courtCount}</span></label>
                <input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full" />
              </div>
              <div className="flex items-center justify-between py-2 border-t">
                <div className="text-sm font-medium">レベル厳格モード (A/B/C固定)</div>
                <button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-12 h-6 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${config.levelStrict ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <div className="pt-4 border-t">
                <button onClick={() => {if(confirm('全てのデータをリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-2.5 border border-red-500 text-red-500 rounded font-bold text-xs hover:bg-red-50 transition-colors flex items-center justify-center gap-1">
                  <RefreshCw size={14} /> データ一括リセット
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 pb-safe z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center p-2 transition-colors ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <tab.icon size={22} />
            <span className="text-[10px] font-bold mt-1">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
