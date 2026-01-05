'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, Settings, History, Play, Plus, Trash2, RefreshCw,
  Trophy, FastForward, RotateCcw, Link as LinkIcon, Unlink, 
  X, ZoomIn, ZoomOut
} from 'lucide-react';

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number; // みなし試合数
  lastPlayedTime: number;
  matchHistory: Record<number, number>; // 対戦した回数
  pairHistory: Record<number, number>;  // ペアを組んだ回数
  fixedPairMemberId: number | null;
}

interface Court {
  id: number;
  match: { p1: number; p2: number; p3: number; p4: number; level?: Level; } | null;
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
  zoomLevel: number;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 4,
    levelStrict: false,
    zoomLevel: 1.0,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);

  // --- 1. データ読み込みと全過去形式からの移行ロジック ---
  useEffect(() => {
    const currentKey = 'doubles-app-data-v17'; // 最新キー
    const savedData = localStorage.getItem(currentKey);
    
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(prev => ({ ...prev, ...(data.config || {}) }));
      setNextMemberId(data.nextMemberId || 1);
    } else {
      // v16からv1まで遡ってデータを探す
      let legacyData = null;
      for (let v = 16; v >= 1; v--) {
        const found = localStorage.getItem(`doubles-app-data-v${v}`);
        if (found) { legacyData = JSON.parse(found); break; }
      }

      if (legacyData) {
        const migratedMembers = (legacyData.members || []).map((m: any) => ({
          id: m.id,
          name: m.name || `${m.id}`,
          level: m.level || 'A',
          isActive: m.isActive !== undefined ? m.isActive : true,
          playCount: m.playCount || 0,
          imputedPlayCount: m.imputedPlayCount || 0,
          lastPlayedTime: m.lastPlayedTime || 0,
          matchHistory: m.matchHistory || {},
          pairHistory: m.pairHistory || {},
          fixedPairMemberId: m.fixedPairMemberId || null,
        }));
        setMembers(migratedMembers);
        setNextMemberId(legacyData.nextMemberId || (migratedMembers.length + 1));
        const cCount = legacyData.config?.courtCount || 4;
        setCourts(Array.from({ length: cCount }, (_, i) => ({ id: i + 1, match: null })));
        if (legacyData.config) setConfig(prev => ({ ...prev, ...legacyData.config }));
      } else {
        setCourts(Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null })));
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v17', JSON.stringify(data));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

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
    if (confirm('全員の試合数と対戦履歴、および履歴画面をリセットします。固定ペア設定は維持されます。')) {
      setMembers(prev => prev.map(m => ({ ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {} })));
      setMatchHistory([]);
    }
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + (m.playCount), 0) / activeMembers.length) : 0;
    const newMember: Member = { id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, playCount: avgPlay, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: null };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const updateFixedPair = (memberId: number, partnerId: number | null) => {
    setMembers(prev => {
      let newMembers = prev.map(m => ({ ...m }));
      const target = newMembers.find(m => m.id === memberId);
      if (!target) return prev;

      if (target.fixedPairMemberId) {
        const oldPartner = newMembers.find(m => m.id === target.fixedPairMemberId);
        if (oldPartner) oldPartner.fixedPairMemberId = null;
      }
      if (partnerId) {
        const newPartner = newMembers.find(m => m.id === partnerId);
        if (newPartner) {
          if (newPartner.fixedPairMemberId) {
            const partnersOldPartner = newMembers.find(m => m.id === newPartner.fixedPairMemberId);
            if (partnersOldPartner) partnersOldPartner.fixedPairMemberId = null;
          }
          newPartner.fixedPairMemberId = memberId;
        }
      }
      target.fixedPairMemberId = partnerId;
      return newMembers;
    });
    setEditingPairMemberId(null);
  };

  const handleLevelChange = (id: number) => {
    setMembers(prev => {
      const target = prev.find(m => m.id === id);
      if (!target) return prev;
      const nextL: Record<Level, Level> = { 'A': 'B', 'B': 'C', 'C': 'A' };
      const newLevel = nextL[target.level];
      return prev.map(m => (m.id === id || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) ? { ...m, level: newLevel } : m);
    });
  };

  const applyMatchToMembers = (p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const playerIds = [p1, p2, p3, p4];
    setMembers(prev => {
      const updated = prev.map(m => {
        if (!playerIds.includes(m.id)) return m;
        const newMatchH = { ...m.matchHistory };
        const newPairH = { ...m.pairHistory };
        let partnerId = 0, opponents: number[] = [];
        if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
        else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
        else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
        else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }
        newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
        opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });
        return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: newMatchH, pairHistory: newPairH };
      });
      const activeMembers = updated.filter(m => m.isActive);
      if (activeMembers.length === 0) return updated;
      const avg = Math.floor(activeMembers.reduce((sum, m) => sum + m.playCount, 0) / activeMembers.length);
      return updated.map(m => {
        if (!m.isActive && m.playCount < avg) {
          const diff = avg - m.playCount;
          return { ...m, playCount: avg, imputedPlayCount: (m.imputedPlayCount || 0) + diff };
        }
        return m;
      });
    });
  };

  // --- 2. 組み合わせロジック（レベル厳密モード修正版） ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    let bestSelection: Member[] = [];
    
    if (config.levelStrict) {
      // 全レベル（A, B, C）をチェック
      const levels: Level[] = ['A', 'B', 'C'];
      const eligibleLevels = levels.filter(l => candidates.filter(m => m.level === l).length >= 4);
      
      if (eligibleLevels.length > 0) {
        // 候補レベルの中から「最も試合数が少ない人が含まれるレベル」を選択
        const chosenLevel = eligibleLevels.sort((la, lb) => {
          const minA = Math.min(...candidates.filter(m => m.level === la).map(m => m.playCount));
          const minB = Math.min(...candidates.filter(m => m.level === lb).map(m => m.playCount));
          return minA - minB;
        })[0];
        
        bestSelection = candidates
          .filter(m => m.level === chosenLevel)
          .sort((a, b) => a.playCount - b.playCount || a.lastPlayedTime - b.lastPlayedTime)
          .slice(0, 4);
      }
    }

    // レベル厳密モードがOFF、または厳密モードで4人揃うレベルがなかった場合
    if (bestSelection.length < 4) {
      bestSelection = candidates
        .sort((a, b) => a.playCount - b.playCount || a.lastPlayedTime - b.lastPlayedTime)
        .slice(0, 4);
    }

    if (bestSelection.length < 4) return null;

    // 未来予測シミュレーション（3パターンからコスト最小を選択）
    const p = bestSelection;
    const combinations = [
      { p1: p[0], p2: p[1], p3: p[2], p4: p[3] },
      { p1: p[0], p2: p[2], p3: p[1], p4: p[3] },
      { p1: p[0], p2: p[3], p3: p[1], p4: p[2] }
    ];

    const bestComb = combinations.map(c => {
      const pairCost = (c.p1.pairHistory[c.p2.id] || 0) + (c.p3.pairHistory[c.p4.id] || 0);
      const matchCost = (c.p1.matchHistory[c.p3.id] || 0) + (c.p1.matchHistory[c.p4.id] || 0) + (c.p2.matchHistory[c.p3.id] || 0) + (c.p2.matchHistory[c.p4.id] || 0);
      let fixedBonus = 0;
      if (c.p1.fixedPairMemberId === c.p2.id) fixedBonus += 1000;
      if (c.p3.fixedPairMemberId === c.p4.id) fixedBonus += 1000;
      return { ...c, totalCost: (pairCost * 5 + matchCost) - fixedBonus };
    }).sort((a, b) => a.totalCost - b.totalCost || Math.random() - 0.5)[0];

    return { p1: bestComb.p1.id, p2: bestComb.p2.id, p3: bestComb.p3.id, p4: bestComb.p4.id, level: config.levelStrict ? bestComb.p1.level : undefined };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('条件に合う待機メンバーが足りません');
    const ids = [match.p1, match.p2, match.p3, match.p4];
    const names = ids.map(id => members.find(m => m.id === id)?.name || '?');
    setMatchHistory(prev => [{ id: Date.now().toString() + courtId, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId, players: names, playerIds: ids, level: match.level }, ...prev]);
    applyMatchToMembers(match.p1, match.p2, match.p3, match.p4);
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const handleBulkAction = () => {
    setCourts(prev => prev.map(c => ({ ...c, match: null })));
    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        for (let i = 0; i < current.length; i++) {
          const m = getMatchForCourt(current, members);
          if (m) {
            const ids = [m.p1, m.p2, m.p3, m.p4];
            const names = ids.map(id => members.find(x => x.id === id)?.name || '?');
            setMatchHistory(ph => [{ id: Date.now().toString() + i, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: m.level }, ...ph]);
            current[i] = { ...current[i], match: m };
            applyMatchToMembers(m.p1, m.p2, m.p3, m.p4);
          }
        }
        return current;
      });
    }, 200);
  };

  const getDynamicFontSize = (name: string = '') => {
    const isAscii = /^[\x20-\x7E]*$/.test(name);
    const len = name.length;
    const effectiveLen = isAscii ? len * 0.6 : len;
    if (effectiveLen <= 2) return 'clamp(1.4rem, 8vw, 3.2rem)';
    if (effectiveLen <= 4) return 'clamp(1.1rem, 7vw, 2.6rem)';
    if (effectiveLen <= 6) return 'clamp(0.9rem, 5vw, 1.8rem)';
    return 'clamp(0.7rem, 4vw, 1.2rem)';
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans">
      <header className="bg-blue-800 text-white px-4 py-3 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> ダブルスメーカー</h1>
        {activeTab === 'dashboard' && (
          <div className="flex items-center gap-2">
            <div className="flex bg-blue-900/50 rounded-lg p-0.5 mr-2">
              <button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, p.zoomLevel - 0.1) }))} className="p-1.5"><ZoomOut size={16}/></button>
              <button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.min(2.0, p.zoomLevel + 0.1) }))} className="p-1.5"><ZoomIn size={16}/></button>
            </div>
            <button onClick={handleBulkAction} className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">一括更新</button>
          </div>
        )}
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 landscape:grid-cols-2 lg:grid-cols-2 gap-3">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ height: `${180 * config.zoomLevel}px` }}>
                <div className="bg-gray-50 px-4 py-1.5 border-b flex justify-between items-center shrink-0">
                  <span className="font-bold text-xs text-gray-500 uppercase">Court {court.id} 
                    {court.match?.level && <span className={`ml-2 px-2 py-0.5 rounded text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.level}</span>}
                  </span>
                </div>
                <div className="flex-1 p-2 h-full flex flex-col">
                  {court.match ? (
                    <div className="flex items-center gap-2 h-full">
                      <div className="flex-1 grid grid-cols-2 gap-2 h-full">
                        <div className="bg-blue-50 rounded-lg flex flex-col justify-center items-center border border-blue-100 px-1 py-1">
                          <div className="w-full text-center font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis mb-1" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p1)?.name) }}>{members.find(m => m.id === court.match?.p1)?.name}</div>
                          <div className="w-full text-center font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p2)?.name) }}>{members.find(m => m.id === court.match?.p2)?.name}</div>
                        </div>
                        <div className="bg-red-50 rounded-lg flex flex-col justify-center items-center border border-red-100 px-1 py-1">
                          <div className="w-full text-center font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis mb-1" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p3)?.name) }}>{members.find(m => m.id === court.match?.p3)?.name}</div>
                          <div className="w-full text-center font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p4)?.name) }}>{members.find(m => m.id === court.match?.p4)?.name}</div>
                        </div>
                      </div>
                      <button onClick={() => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, match: null } : c))} className="bg-gray-800 text-white px-4 h-full rounded-lg font-bold text-sm lg:text-lg shrink-0 shadow-inner">終了</button>
                    </div>
                  ) : (
                    <button onClick={() => generateNextMatch(court.id)} className="w-full h-full border-2 border-dashed border-gray-300 text-gray-400 font-bold text-xl rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors"><Play size={28} /> 割当</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2"><h2 className="font-bold text-xl text-gray-700">名簿 ({members.filter(m => m.isActive).length}/{members.length})</h2><button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button></div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {members.map(m => (
                <div key={m.id} className={`p-4 flex items-center gap-4 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <button onClick={() => handleLevelChange(m.id)} className={`text-xs font-bold rounded-md px-3 py-1 text-white ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>レベル{m.level}</button>
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>{m.fixedPairMemberId ? <><LinkIcon size={12} />{members.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}</button>
                      <span className="text-xs text-gray-400 font-bold tracking-wider">試合数: {m.playCount}{m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 transition-all ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 px-2"><Trash2 size={24} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingPairMemberId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold text-lg">ペアを選択 (同レベルのみ)</h3><button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button></div>
              <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
                <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b flex items-center gap-2"><Unlink size={16} /> ペアを解消</button>
                {members.filter(m => m.id !== editingPairMemberId && m.isActive && m.level === members.find(x => x.id === editingPairMemberId)?.level).map(candidate => (
                  <button key={candidate.id} onClick={() => updateFixedPair(editingPairMemberId, candidate.id)} className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b flex items-center gap-2 ${members.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}><LinkIcon size={16} className="text-gray-400" />{candidate.name}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto mt-2">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px]"><tr><th className="p-4">時刻</th><th className="p-4">対戦</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-xs">{h.timestamp}</td><td className="p-4 font-bold">{h.level && <span className={`mr-2 px-1.5 rounded text-white ${h.level === 'A' ? 'bg-blue-600' : h.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{h.level}</span>}{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal">vs</span> {h.players[2]}, {h.players[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto mt-2">
            <div><label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-widest">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label><input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button></div>
            <div className="space-y-4"><button onClick={resetPlayCountsOnly} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border border-gray-200"><RotateCcw size={20} /> 試合数と履歴をリセット</button><button onClick={() => {if(confirm('名簿を含め全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100">データを完全消去</button></div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around pb-safe z-30 shadow-lg">
        {[ { id: 'dashboard', icon: Play, label: '試合' }, { id: 'members', icon: Users, label: '名簿' }, { id: 'history', icon: History, label: '履歴' }, { id: 'settings', icon: Settings, label: '設定' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-3 px-8 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-300'}`}><tab.icon size={26} /><span className="text-[10px] font-bold mt-1.5">{tab.label}</span></button>
        ))}
      </nav>
    </div>
  );
}
