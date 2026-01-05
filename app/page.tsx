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
  ZoomOut
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

  // データ読み込みと移行ロジック
  useEffect(() => {
    const savedDataV15 = localStorage.getItem('doubles-app-data-v15');
    
    if (savedDataV15) {
      const data = JSON.parse(savedDataV15);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(prev => ({ ...prev, ...(data.config || {}) }));
      setNextMemberId(data.nextMemberId || 1);
    } else {
      let legacyData = null;
      const legacyKeys = [
        'doubles-app-data-v14',
        'doubles-app-data-v13',
        'doubles-app-data-v12',
        'doubles-app-data-v11',
        'doubles-app-data-v10',
        'doubles-app-data-v9',
        'doubles-app-data-v8',
        'doubles-app-data',
        'badminton-doubles-manager'
      ];

      for (const key of legacyKeys) {
        const found = localStorage.getItem(key);
        if (found) {
          try {
            legacyData = JSON.parse(found);
            break;
          } catch (e) {
            continue;
          }
        }
      }

      if (legacyData) {
        try {
          const rawMembers = legacyData.members || legacyData.players || [];
          const migratedMembers = rawMembers.map((m: any) => ({
            id: m.id,
            name: m.name || `選手${m.id}`,
            level: (m.level === 'A' || m.level === 'B' || m.level === 'C') ? m.level : 'A',
            isActive: m.isActive !== undefined ? m.isActive : true,
            playCount: m.playCount || 0,
            imputedPlayCount: m.imputedPlayCount || 0,
            lastPlayedTime: m.lastPlayedTime || 0,
            matchHistory: m.matchHistory || {},
            pairHistory: m.pairHistory || {},
            fixedPairMemberId: m.fixedPairMemberId || null
          }));

          setMembers(migratedMembers);
          
          const courtCount = legacyData.config?.courtCount || legacyData.courtCount || 4;
          setConfig(prev => ({ 
            ...prev, 
            courtCount: courtCount, 
            levelStrict: legacyData.config?.levelStrict || legacyData.levelStrict || false 
          }));
          
          const maxId = migratedMembers.length > 0 ? Math.max(...migratedMembers.map((m: any) => m.id)) : 0;
          setNextMemberId((legacyData.nextMemberId || maxId) + 1);
          
          initializeCourts(courtCount);
          setMatchHistory([]);
        } catch (e) {
          console.error("Migration failed", e);
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
    localStorage.setItem('doubles-app-data-v15', JSON.stringify(data));
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
      const newLevel = toggleLevel(target.level);
      return prev.map(m => {
        if (m.id === id || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) {
          return { ...m, level: newLevel };
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
        
        let partnerId = 0;
        let opponents: number[] = [];
        if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
        else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
        else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
        else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }

        newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
        opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });

        return { 
          ...m, 
          playCount: m.playCount + 1, 
          lastPlayedTime: now, 
          matchHistory: newMatchH,
          pairHistory: newPairH
        };
      });

      const activeMembers = updatedMembers.filter(m => m.isActive);
      if (activeMembers.length === 0) return updatedMembers;
      
      const totalPlays = activeMembers.reduce((sum, m) => sum + m.playCount, 0);
      const avgPlays = Math.floor(totalPlays / activeMembers.length);

      return updatedMembers.map(m => {
        if (!m.isActive && m.playCount < avgPlays) {
          const diff = avgPlays - m.playCount;
          return {
            ...m,
            playCount: avgPlays,
            imputedPlayCount: m.imputedPlayCount + diff
          };
        }
        return m;
      });
    });
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    type Unit = { type: 'pair', members: Member[], avgPlay: number, lastTime: number } | { type: 'single', members: Member[], avgPlay: number, lastTime: number };
    const units: Unit[] = [];
    const processedIds = new Set<number>();

    candidates.forEach(m => {
      if (processedIds.has(m.id)) return;
      if (m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId)) {
        const partner = candidates.find(c => c.id === m.fixedPairMemberId)!;
        processedIds.add(m.id);
        processedIds.add(partner.id);
        units.push({
          type: 'pair',
          members: [m, partner],
          avgPlay: (m.playCount + partner.playCount) / 2,
          lastTime: Math.max(m.lastPlayedTime, partner.lastPlayedTime)
        });
      } else {
        processedIds.add(m.id);
        units.push({
          type: 'single',
          members: [m],
          avgPlay: m.playCount,
          lastTime: m.lastPlayedTime
        });
      }
    });

    const sortedUnits = units.sort((a, b) => {
      if (a.avgPlay !== b.avgPlay) return a.avgPlay - b.avgPlay;
      if (Math.abs(a.lastTime - b.lastTime) > 1000) return a.lastTime - b.lastTime;
      return Math.random() - 0.5;
    });

    let bestSelection: Member[] = [];
    if (config.levelStrict) {
      const byLevel = { A: [] as Member[], B: [] as Member[], C: [] as Member[] };
      sortedUnits.forEach(u => u.members.forEach(m => byLevel[m.level].push(m)));
      
      const priorityLevels: Level[] = [];
      for (const unit of sortedUnits) {
        const level = unit.members[0].level;
        if (!priorityLevels.includes(level)) {
          priorityLevels.push(level);
        }
      }

      for (const l of priorityLevels) {
        if (byLevel[l].length >= 4) {
          bestSelection = byLevel[l].slice(0, 4);
          break;
        }
      }
    }

    if (bestSelection.length < 4) {
      let currentCount = 0;
      for (const unit of sortedUnits) {
        if (currentCount + unit.members.length <= 4) {
          bestSelection = [...bestSelection, ...unit.members];
          currentCount += unit.members.length;
        }
        if (currentCount === 4) break;
      }
    }

    if (bestSelection.length < 4) return null;

    const p = bestSelection;
    const combinations = [
      { p1: p[0], p2: p[1], p3: p[2], p4: p[3] },
      { p1: p[0], p2: p[2], p3: p[1], p4: p[3] },
      { p1: p[0], p2: p[3], p3: p[1], p4: p[2] }
    ];

    const bestComb = combinations.map(c => {
      const pairCost = (c.p1.pairHistory[c.p2.id] || 0) + (c.p3.pairHistory[c.p4.id] || 0);
      const matchCost = (c.p1.matchHistory[c.p3.id] || 0) + (c.p1.matchHistory[c.p4.id] || 0) + 
                        (c.p2.matchHistory[c.p3.id] || 0) + (c.p2.matchHistory[c.p4.id] || 0);
      
      let fixedBonus = 0;
      if (c.p1.fixedPairMemberId === c.p2.id) fixedBonus += 1000;
      if (c.p3.fixedPairMemberId === c.p4.id) fixedBonus += 1000;

      return { ...c, totalCost: (pairCost * 5 + matchCost) - fixedBonus };
    }).sort((a, b) => a.totalCost - b.totalCost || Math.random() - 0.5)[0];

    const matchLevel = config.levelStrict ? bestComb.p1.level : undefined;
    return { p1: bestComb.p1.id, p2: bestComb.p2.id, p3: bestComb.p3.id, p4: bestComb.p4.id, level: matchLevel };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('待機メンバーが足りません（条件に合うメンバーがいません）');
    
    const ids = [match.p1, match.p2, match.p3, match.p4];
    const names = ids.map(id => members.find(m => m.id === id)?.name || '?');
    setMatchHistory(prev => [{
      id: Date.now().toString() + courtId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      courtId, players: names, playerIds: ids, level: match.level
    }, ...prev]);

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
              setMatchHistory(prevH => [{
                id: Date.now().toString() + current[i].id,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                courtId: current[i].id, players: names, playerIds: ids, level: match.level
              }, ...prevH]);
              current[i] = { ...current[i], match };
              
              const now = Date.now();
              tempMembers = tempMembers.map(m => {
                if (!ids.includes(m.id)) return m;
                const newMatchH = { ...m.matchHistory };
                const newPairH = { ...m.pairHistory };
                let p1=match.p1, p2=match.p2, p3=match.p3, p4=match.p4;
                let partnerId = 0; let opponents: number[] = [];
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

  const changeZoom = (delta: number) => {
    setConfig(prev => ({
      ...prev,
      zoomLevel: Math.max(0.5, Math.min(2.0, prev.zoomLevel + delta))
    }));
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
    const isAscii = /^[\x20-\x7E]*$/.test(name);
    const len = name.length;
    const effectiveLen = isAscii ? len * 0.6 : len;

    if (effectiveLen <= 2) return 'clamp(1.4rem, 9vw, 3.5rem)';
    if (effectiveLen <= 4) return 'clamp(1.1rem, 7vw, 2.8rem)';
    if (effectiveLen <= 6) return 'clamp(0.9rem, 5vw, 2rem)';
    if (effectiveLen <= 8) return 'clamp(0.8rem, 4.5vw, 1.6rem)';
    return 'clamp(0.7rem, 4vw, 1.3rem)';
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans overflow-x-hidden">
      <header className="bg-blue-800 text-white px-4 py-3 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> ダブルスメーカー</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <div className="flex items-center bg-blue-900/50 rounded-lg p-0.5 mr-2">
              <button onClick={() => changeZoom(-0.1)} className="p-1.5 hover:bg-blue-800 rounded"><ZoomOut size={16}/></button>
              <button onClick={() => changeZoom(0.1)} className="p-1.5 hover:bg-blue-800 rounded"><ZoomIn size={16}/></button>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <button onClick={handleBulkAction} className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">
              一括更新
            </button>
          )}
        </div>
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 landscape:grid-cols-2 gap-3">
            {courts.map(court => (
              <div 
                key={court.id} 
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                style={{ 
                  height: `calc((100vw > 100vh ? 40vh : 22vh) * ${config.zoomLevel})`,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* ヘッダー部分は高さを固定(shrink-0) */}
                <div className="bg-gray-50 px-4 py-1.5 border-b flex justify-between items-center shrink-0 h-[32px]">
                  <span className="font-bold text-xs text-gray-500 uppercase tracking-widest">Court {court.id} {getLevelBadge(court.match?.level)}</span>
                </div>

                {/* メインエリア：ここを h-full にして親の残りを強制的に埋める */}
                <div className="h-full flex flex-col p-3 overflow-hidden">
                  {court.match ? (
                    <div className="h-full flex items-center gap-2">
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
                      <button onClick={() => finishMatch(court.id)} className="bg-gray-800 text-white px-5 h-full rounded-lg font-bold text-sm lg:text-lg shrink-0 flex items-center justify-center shadow-inner">終了</button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => generateNextMatch(court.id)} 
                      className="w-full h-full border-2 border-dashed border-gray-300 text-gray-400 font-bold text-xl rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors active:scale-[0.99]"
                    >
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
              <h2 className="font-bold text-xl text-gray-700">名簿 ({members.filter(m => m.isActive).length}/{members.length})</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {members.map(m => (
                <div key={m.id} className={`p-4 flex items-center gap-4 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <button 
                        onClick={() => handleLevelChange(m.id)}
                        className={`text-xs font-bold rounded-md px-3 py-1 text-white transition-colors ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}
                      >
                        レベル{m.level}
                      </button>
                      
                      <button 
                        onClick={() => setEditingPairMemberId(m.id)}
                        className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}
                      >
                        {m.fixedPairMemberId ? (
                          <>
                            <LinkIcon size={12} />
                            {members.find(x => x.id === m.fixedPairMemberId)?.name}
                          </>
                        ) : (
                          <>
                            <Unlink size={12} />
                            ペアなし
                          </>
                        )}
                      </button>

                      <span className="text-xs text-gray-400 font-bold tracking-wider">
                        試合数: {m.playCount}
                        {m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 transition-all ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>
                    {m.isActive ? '参加' : '休み'}
                  </button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 transition-colors px-2"><Trash2 size={24} /></button>
                </div>
              ))}

              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b">
                      <h3 className="font-bold text-lg">ペアを選択 (同レベルのみ)</h3>
                      <button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button 
                        onClick={() => updateFixedPair(editingPairMemberId, null)}
                        className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b border-gray-100 flex items-center gap-2"
                      >
                        <Unlink size={16} /> ペアを解消（なし）
                      </button>
                      {members
                        .filter(m => m.id !== editingPairMemberId && m.isActive)
                        .filter(m => !m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId)
                        .filter(m => m.level === members.find(x => x.id === editingPairMemberId)?.level)
                        .map(candidate => (
                          <button
                            key={candidate.id}
                            onClick={() => updateFixedPair(editingPairMemberId, candidate.id)}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b border-gray-100 flex items-center gap-2 ${members.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                          >
                            <LinkIcon size={16} className="text-gray-400" />
                            {candidate.name}
                          </button>
                        ))}
                      {members.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) && m.level === members.find(x => x.id === editingPairMemberId)?.level).length === 0 && (
                        <div className="px-4 py-3 text-gray-400 text-sm text-center">選択可能なメンバーがいません</div>
                      )}
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
