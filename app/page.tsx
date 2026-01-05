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
  RotateCcw,
  Link as LinkIcon,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
  Type,
  CheckCircle2
} from 'lucide-react';

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number;
  lastPlayedTime: number;
  matchHistory: Record<number, number>;
  pairHistory: Record<number, number>;
  fixedPairMemberId: number | null;
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
  zoomLevel: number;
  fontScale: number;
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
    fontScale: 1.0,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);

  // --- 1. データ読み込み（全過去バージョン v1〜v16 からの移行対応） ---
  useEffect(() => {
    const currentKey = 'doubles-app-data-v17';
    const savedDataV17 = localStorage.getItem(currentKey);
    
    if (savedDataV17) {
      const data = JSON.parse(savedDataV17);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(prev => ({ ...prev, ...(data.config || {}) }));
      setNextMemberId(data.nextMemberId || 1);
    } else {
      // 古いキーを遡って探す
      let oldDataRaw = null;
      for (let v = 16; v >= 1; v--) {
        const found = localStorage.getItem(`doubles-app-data-v${v}`);
        if (found) {
          oldDataRaw = found;
          break;
        }
      }

      if (oldDataRaw) {
        try {
          const oldData = JSON.parse(oldDataRaw);
          const migratedMembers = (oldData.members || []).map((m: any) => ({
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
          if (oldData.config) {
            setConfig(prev => ({ 
              ...prev, 
              courtCount: oldData.config.courtCount || 4, 
              levelStrict: oldData.config.levelStrict || false,
              zoomLevel: oldData.config.zoomLevel || 1.0,
              fontScale: oldData.config.fontScale || 1.0
            }));
          }
          setNextMemberId(oldData.nextMemberId || (migratedMembers.length + 1));
          setCourts(Array.from({ length: oldData.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
        } catch (e) {
          initializeCourts(4);
        }
      } else {
        initializeCourts(4);
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v17', JSON.stringify(data));
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
    if (confirm('全員の試合数と対戦履歴、および履歴画面をリセットします。固定ペア設定は維持されます。')) {
      setMembers(prev => prev.map(m => ({ 
        ...m, 
        playCount: 0,
        imputedPlayCount: 0,
        lastPlayedTime: 0, 
        matchHistory: {},
        pairHistory: {} 
      })));
      setMatchHistory([]);
    }
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const newMember: Member = { 
      id: nextMemberId, 
      name: `${nextMemberId}`, 
      level: 'A', 
      isActive: true, 
      playCount: avgPlay, 
      imputedPlayCount: avgPlay,
      lastPlayedTime: 0, 
      matchHistory: {},
      pairHistory: {},
      fixedPairMemberId: null
    };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const updateFixedPair = (memberId: number, partnerId: number | null) => {
    setMembers(prev => {
      let newMembers = [...prev];
      const target = newMembers.find(m => m.id === memberId);
      if (!target) return prev;
      if (target.fixedPairMemberId) {
        const oldPartner = newMembers.find(m => m.id === target.fixedPairMemberId);
        if (oldPartner) oldPartner.fixedPairMemberId = null;
      }
      if (partnerId) {
        const newPartner = newMembers.find(m => m.id === partnerId);
        if (newPartner && newPartner.fixedPairMemberId) {
          const partnersOldPartner = newMembers.find(m => m.id === newPartner.fixedPairMemberId);
          if (partnersOldPartner) partnersOldPartner.fixedPairMemberId = null;
        }
        if (newPartner) newPartner.fixedPairMemberId = memberId;
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
      const newLevel = (l: Level): Level => l === 'A' ? 'B' : l === 'B' ? 'C' : 'A';
      const targetLevel = newLevel(target.level);
      return prev.map(m => {
        if (m.id === id || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) {
          return { ...m, level: targetLevel };
        }
        return m;
      });
    });
  };

  const applyMatchToMembers = (p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const playerIds = [p1, p2, p3, p4];
    
    setMembers(prev => {
      const updatedMembers = prev.map(m => {
        if (!playerIds.includes(m.id)) return m;
        const newMatchH = { ...m.matchHistory };
        const newPairH = { ...m.pairHistory };
        let partnerId = 0; let opponents: number[] = [];
        if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
        else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
        else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
        else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }
        newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
        opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });
        return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: newMatchH, pairHistory: newPairH };
      });

      const activeMembers = updatedMembers.filter(m => m.isActive);
      if (activeMembers.length === 0) return updatedMembers;
      const totalPlays = activeMembers.reduce((sum, m) => sum + m.playCount, 0);
      const avgPlays = Math.floor(totalPlays / activeMembers.length);

      return updatedMembers.map(m => {
        if (!m.isActive && m.playCount < avgPlays) {
          const diff = avgPlays - m.playCount;
          return { ...m, playCount: avgPlays, imputedPlayCount: m.imputedPlayCount + diff };
        }
        return m;
      });
    });
  };

  // --- 2. 組み合わせロジック（v15相当の高度な計算 + レベル厳格モード修正） ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    type Unit = { type: 'pair', members: Member[], avgPlay: number, lastTime: number, level: Level } | { type: 'single', members: Member[], avgPlay: number, lastTime: number, level: Level };
    const units: Unit[] = [];
    const processedIds = new Set<number>();

    candidates.forEach(m => {
      if (processedIds.has(m.id)) return;
      if (m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId)) {
        const partner = candidates.find(c => c.id === m.fixedPairMemberId)!;
        processedIds.add(m.id); processedIds.add(partner.id);
        units.push({ type: 'pair', members: [m, partner], avgPlay: (m.playCount + partner.playCount) / 2, lastTime: Math.max(m.lastPlayedTime, partner.lastPlayedTime), level: m.level });
      } else {
        processedIds.add(m.id);
        units.push({ type: 'single', members: [m], avgPlay: m.playCount, lastTime: m.lastPlayedTime, level: m.level });
      }
    });

    const sortedUnits = units.sort((a, b) => {
      if (a.avgPlay !== b.avgPlay) return a.avgPlay - b.avgPlay;
      return a.lastTime - b.lastTime || Math.random() - 0.5;
    });

    let selectedMembers: Member[] = [];
    if (config.levelStrict) {
      // レベル厳格モード：優先度が一番高い人のレベルに合わせて4人集める
      for (const baseUnit of sortedUnits) {
        const targetLevel = baseUnit.level;
        const sameLevelUnits = sortedUnits.filter(u => u.level === targetLevel);
        const total = sameLevelUnits.reduce((sum, u) => sum + u.members.length, 0);
        if (total >= 4) {
          let count = 0;
          for (const u of sameLevelUnits) {
            if (count + u.members.length <= 4) { selectedMembers.push(...u.members); count += u.members.length; }
            if (count === 4) break;
          }
          break;
        }
      }
    } else {
      let count = 0;
      for (const u of sortedUnits) {
        if (count + u.members.length <= 4) { selectedMembers.push(...u.members); count += u.members.length; }
        if (count === 4) break;
      }
    }

    if (selectedMembers.length < 4) return null;

    const p = selectedMembers;
    const fixedPairs = units.filter(u => u.type === 'pair' && selectedMembers.includes(u.members[0]));
    let p1, p2, p3, p4;

    if (fixedPairs.length >= 1) {
      // 固定ペアを維持してチーム分け
      const pair1 = fixedPairs[0].members;
      const others = selectedMembers.filter(m => !pair1.includes(m));
      p1 = pair1[0]; p2 = pair1[1];
      if (fixedPairs.length >= 2) {
        const pair2 = fixedPairs[1].members;
        p3 = pair2[0]; p4 = pair2[1];
      } else {
        p3 = others[0]; p4 = others[1];
      }
    } else {
      // 全員バラバラ：過去の重複が最小になる組み合わせ（コスト計算）
      const combinations = [
        { p1: p[0], p2: p[1], p3: p[2], p4: p[3] },
        { p1: p[0], p2: p[2], p3: p[1], p4: p[3] },
        { p1: p[0], p2: p[3], p3: p[1], p4: p[2] }
      ];
      const best = combinations.sort((a, b) => {
        const costA = (a.p1.pairHistory[a.p2.id]||0)*3 + (a.p3.pairHistory[a.p4.id]||0)*3 +
                      (a.p1.matchHistory[a.p3.id]||0) + (a.p1.matchHistory[a.p4.id]||0) +
                      (a.p2.matchHistory[a.p3.id]||0) + (a.p2.matchHistory[a.p4.id]||0);
        const costB = (b.p1.pairHistory[b.p2.id]||0)*3 + (b.p3.pairHistory[b.p4.id]||0)*3 +
                      (b.p1.matchHistory[b.p3.id]||0) + (b.p1.matchHistory[b.p4.id]||0) +
                      (b.p2.matchHistory[b.p3.id]||0) + (b.p2.matchHistory[b.p4.id]||0);
        return costA - costB || Math.random() - 0.5;
      })[0];
      p1 = best.p1; p2 = best.p2; p3 = best.p3; p4 = best.p4;
    }

    return { p1: p1.id, p2: p2.id, p3: p3.id, p4: p4.id, level: config.levelStrict ? p1.level : undefined };
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

  const finishMatch = (courtId: number) => {
    setCourts(prevCourts => prevCourts.map(c => c.id === courtId ? { ...c, match: null } : c));
  };

  const handleBulkAction = () => {
    setCourts(prev => prev.map(c => ({ ...c, match: null })));
    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        let tempMembers = JSON.parse(JSON.stringify(members)) as Member[];
        for (let i = 0; i < current.length; i++) {
          if (!current[i].match) {
            const match = getMatchForCourt(current, tempMembers);
            if (match) {
              const ids = [match.p1, match.p2, match.p3, match.p4];
              const names = ids.map(id => tempMembers.find(m => m.id === id)?.name || '?');
              setMatchHistory(prevH => [{ id: Date.now().toString() + current[i].id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: match.level }, ...prevH]);
              current[i] = { ...current[i], match };
              const now = Date.now();
              tempMembers = tempMembers.map(m => {
                if (!ids.includes(m.id)) return m;
                const newMatchH = { ...m.matchHistory }, newPairH = { ...m.pairHistory };
                let p1=match.p1, p2=match.p2, p3=match.p3, p4=match.p4, partnerId=0, opponents: number[]=[];
                if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
                else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
                else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
                else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }
                newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
                opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });
                return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: newMatchH, pairHistory: newPairH };
              });
              applyMatchToMembers(match.p1, match.p2, match.p3, match.p4);
            }
          }
        }
        return current;
      });
    }, 200);
  };

  const calculateUnifiedBaseFontSize = () => {
    const activeNames = members.filter(m => m.isActive).map(m => m.name);
    if (activeNames.length === 0) return '2rem';
    const maxLen = Math.max(...activeNames.map(name => {
      const isAscii = /^[\x20-\x7E]*$/.test(name);
      return isAscii ? name.length * 0.6 : name.length;
    }));
    let base = 2.5;
    if (maxLen > 2) base = 2.5 * (3.5 / (maxLen + 1.5));
    return `${Math.max(0.8, Math.min(3.5, base))}rem`;
  };

  const unifiedBaseSize = calculateUnifiedBaseFontSize();

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans overflow-x-hidden">
      <header className="bg-blue-800 text-white px-4 py-2 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-lg font-bold flex items-center gap-2"><Trophy size={18} /> ダブルスメーカー</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              <div className="flex items-center bg-blue-900/50 rounded-lg p-0.5">
                <Type size={14} className="mx-1 opacity-70"/><button onClick={() => setConfig(prev => ({ ...prev, fontScale: Math.max(0.5, prev.fontScale - 0.1) }))} className="w-7 h-7 flex items-center justify-center hover:bg-blue-700 rounded font-bold">-</button>
                <button onClick={() => setConfig(prev => ({ ...prev, fontScale: Math.min(2.0, prev.fontScale + 0.1) }))} className="w-7 h-7 flex items-center justify-center hover:bg-blue-700 rounded font-bold">+</button>
              </div>
              <div className="flex items-center bg-blue-900/50 rounded-lg p-0.5">
                <button onClick={() => setConfig(prev => ({ ...prev, zoomLevel: Math.max(0.5, prev.zoomLevel - 0.1) }))} className="p-1.5 hover:bg-blue-700 rounded"><ZoomOut size={16}/></button>
                <button onClick={() => setConfig(prev => ({ ...prev, zoomLevel: Math.min(2.0, prev.zoomLevel + 0.1) }))} className="p-1.5 hover:bg-blue-700 rounded"><ZoomIn size={16}/></button>
              </div>
              <button onClick={handleBulkAction} className="bg-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform ml-1">一括更新</button>
            </>
          )}
        </div>
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 landscape:grid-cols-2 lg:grid-cols-2 gap-2">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ height: `${200 * config.zoomLevel}px` }}>
                <div className="bg-gray-100 px-3 py-1 border-b flex justify-between items-center h-8 shrink-0">
                  <span className="font-bold text-sm text-gray-600 uppercase tracking-widest">Court {court.id} {court.match?.level && <span className={`ml-2 px-2 py-0.5 rounded text-[10px] text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.level}</span>}</span>
                  {court.match && <button onClick={() => finishMatch(court.id)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-0.5 rounded text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12} /> 終了</button>}
                </div>
                <div className="flex-1 relative p-1">
                  {court.match ? (
                    // --- 3. 試合画面レイアウト（左:青、右:赤の縦並び） ---
                    <div className="flex h-full w-full gap-1">
                      <div className="flex-1 flex flex-col bg-blue-50/50 rounded-l overflow-hidden">
                        <div className="flex-1 flex items-center justify-center border-b border-blue-100/50 p-1"><div className="font-black text-blue-900 leading-none text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p1)?.name}</div></div>
                        <div className="flex-1 flex items-center justify-center p-1"><div className="font-black text-blue-900 leading-none text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p2)?.name}</div></div>
                      </div>
                      <div className="w-6 flex items-center justify-center relative"><div className="absolute inset-y-2 left-1/2 w-px bg-gray-200 -translate-x-1/2"></div><div className="bg-white z-10 rounded-full px-1 py-0.5 text-[9px] font-bold text-gray-400 border border-gray-200 shadow-sm">VS</div></div>
                      <div className="flex-1 flex flex-col bg-red-50/50 rounded-r overflow-hidden">
                        <div className="flex-1 flex items-center justify-center border-b border-red-100/50 p-1"><div className="font-black text-red-900 leading-none text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p3)?.name}</div></div>
                        <div className="flex-1 flex items-center justify-center p-1"><div className="font-black text-red-900 leading-none text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p4)?.name}</div></div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => generateNextMatch(court.id)} className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors group rounded-lg border-2 border-dashed border-gray-200"><Play size={36} /><span className="font-bold text-sm">試合を組む</span></button>
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
                  <div className="flex-1"><input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <button onClick={() => handleLevelChange(m.id)} className={`text-xs font-bold rounded-md px-3 py-1 text-white ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>レベル{m.level}</button>
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>{m.fixedPairMemberId ? <><LinkIcon size={12} />{members.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}</button>
                      <span className="text-xs text-gray-400 font-bold">試合数: {m.playCount}{m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 transition-colors px-2"><Trash2 size={24} /></button>
                </div>
              ))}
              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold text-lg">ペアを選択</h3><button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button></div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b border-gray-100 flex items-center gap-2"><Unlink size={16} /> ペアなしに戻す</button>
                      {members.filter(m => m.id !== editingPairMemberId && m.isActive && m.level === members.find(x => x.id === editingPairMemberId)?.level).map(candidate => (
                        <button key={candidate.id} onClick={() => updateFixedPair(editingPairMemberId, candidate.id)} className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b border-gray-100 flex items-center gap-2 ${members.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}><LinkIcon size={16} />{candidate.name}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400"><tr><th className="p-4 text-xs font-bold uppercase">時刻</th><th className="p-4 text-xs font-bold uppercase">対戦</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm">{h.timestamp}</td><td className="p-4 font-bold text-base">{h.level && <span className={`mr-2 px-2 py-0.5 rounded text-[10px] text-white ${h.level === 'A' ? 'bg-blue-600' : h.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{h.level}</span>}{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div><label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-widest">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label><input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button></div>
            <div className="space-y-4"><button onClick={resetPlayCountsOnly} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border border-gray-200"><RotateCcw size={20} /> 試合数と履歴をリセット</button><button onClick={() => {if(confirm('全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100">データを完全消去</button></div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around pb-safe z-30 shadow-lg">
        {[ { id: 'dashboard', icon: Play, label: '試合' }, { id: 'members', icon: Users, label: '名簿' }, { id: 'history', icon: History, label: '履歴' }, { id: 'settings', icon: Settings, label: '設定' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-300'}`}><tab.icon size={26} /><span className="text-[10px] font-bold mt-1.5">{tab.label}</span></button>
        ))}
      </nav>
    </div>
  );
}
