'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, Settings, History, Play, Plus, Trash2, Trophy, RotateCcw,
  Link as LinkIcon, Unlink, X, ZoomIn, ZoomOut, Type, CheckCircle2
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
  fontScale: number;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({ courtCount: 4, levelStrict: false, zoomLevel: 1.0, fontScale: 1.0 });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);

  // データ読み込み（全バージョン引き継ぎ対応）
  useEffect(() => {
    const currentKey = 'doubles-app-data-v17';
    const savedData = localStorage.getItem(currentKey);
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(prev => ({ ...prev, ...(data.config || {}) }));
      setNextMemberId(data.nextMemberId || 1);
    } else {
      for (let v = 16; v >= 1; v--) {
        const old = localStorage.getItem(`doubles-app-data-v${v}`);
        if (old) {
          try {
            const d = JSON.parse(old);
            const mms = (d.members || []).map((m: any) => ({
              id: m.id, name: m.name || `${m.id}`, level: m.level || 'A', isActive: m.isActive ?? true,
              playCount: m.playCount || 0, imputedPlayCount: m.imputedPlayCount || 0, lastPlayedTime: m.lastPlayedTime || 0,
              matchHistory: m.matchHistory || {}, pairHistory: m.pairHistory || {}, fixedPairMemberId: m.fixedPairMemberId || null
            }));
            setMembers(mms);
            if (d.config) setConfig(prev => ({ ...prev, courtCount: d.config.courtCount || 4, levelStrict: d.config.levelStrict || false }));
            setNextMemberId(d.nextMemberId || (mms.length + 1));
            setCourts(Array.from({ length: d.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
            break;
          } catch (e) { console.error(e); }
        }
      }
      if (courts.length === 0) setCourts(Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null })));
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem('doubles-app-data-v17', JSON.stringify({ members, courts, matchHistory, config, nextMemberId }));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

  // --- 組み合わせロジック (v15 最終版完全復元) ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    // 優先度順に並べる (試合数 -> 待ち時間)
    const sortedCandidates = [...candidates].sort((a, b) => {
      if (a.playCount !== b.playCount) return a.playCount - b.playCount;
      return a.lastPlayedTime - b.lastPlayedTime;
    });

    let selected: Member[] = [];

    if (config.levelStrict) {
      // 厳格モード: 待機最優先の人のレベルに合わせる
      const top = sortedCandidates[0];
      const targetLevel = top.level;
      const sameLevel = sortedCandidates.filter(c => c.level === targetLevel);
      if (sameLevel.length < 4) return null; // 4人未満なら組まない
      selected = sameLevel.slice(0, 4);
    } else {
      // 通常モード: 単純に優先度が高い4人
      selected = sortedCandidates.slice(0, 4);
    }

    if (selected.length < 4) return null;

    // 未来予測・組み合わせ最適化 (3パターンのコスト計算)
    const p = selected;
    const combinations = [
      { t1: [p[0], p[1]], t2: [p[2], p[3]] },
      { t1: [p[0], p[2]], t2: [p[1], p[3]] },
      { t1: [p[0], p[3]], t2: [p[1], p[2]] }
    ];

    const scored = combinations.map(combo => {
      const [a, b] = combo.t1;
      const [c, d] = combo.t2;
      
      // 固定ペアがある場合のボーナス
      let fixedBonus = 0;
      if (a.fixedPairMemberId === b.id) fixedBonus -= 100;
      if (c.fixedPairMemberId === d.id) fixedBonus -= 100;

      // ペア履歴(重み3) + 対戦履歴(重み1)
      const pairCost = (a.pairHistory[b.id] || 0) + (c.pairHistory[d.id] || 0);
      const matchCost = (a.matchHistory[c.id] || 0) + (a.matchHistory[d.id] || 0) + 
                        (b.matchHistory[c.id] || 0) + (b.matchHistory[d.id] || 0);
      
      return { combo, score: (pairCost * 3) + matchCost + fixedBonus };
    });

    // 最もスコアが低い（履歴が重ならない）組み合わせを採用
    const best = scored.sort((a, b) => a.score - b.score)[0].combo;
    
    return { 
      p1: best.t1[0].id, p2: best.t1[1].id, 
      p3: best.t2[0].id, p4: best.t2[1].id, 
      level: config.levelStrict ? best.t1[0].level : undefined 
    };
  };

  const applyMatch = (m1: number, m2: number, m3: number, m4: number) => {
    const now = Date.now();
    setMembers(prev => prev.map(m => {
      if (![m1, m2, m3, m4].includes(m.id)) return m;
      const nmh = { ...m.matchHistory };
      const nph = { ...m.pairHistory };
      let partner = 0, opps: number[] = [];
      if (m.id === m1) { partner = m2; opps = [m3, m4]; }
      else if (m.id === m2) { partner = m1; opps = [m3, m4]; }
      else if (m.id === m3) { partner = m4; opps = [m1, m2]; }
      else if (m.id === m4) { partner = m3; opps = [m1, m2]; }
      nph[partner] = (nph[partner] || 0) + 1;
      opps.forEach(o => nmh[o] = (nmh[o] || 0) + 1);
      return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: nmh, pairHistory: nph };
    }));
  };

  const generateNextMatch = (courtId: number) => {
    const m = getMatchForCourt(courts, members);
    if (!m) return alert('条件に合うメンバーが足りません。');
    const names = [m.p1, m.p2, m.p3, m.p4].map(id => members.find(x => x.id === id)?.name || '?');
    setMatchHistory(prev => [{ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId, players: names, playerIds: [m.p1, m.p2, m.p3, m.p4], level: m.level }, ...prev]);
    applyMatch(m.p1, m.p2, m.p3, m.p4);
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match: m } : c));
  };

  const handleBulkAction = () => {
    setCourts(prev => prev.map(c => ({ ...c, match: null })));
    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        let tempMembers = [...members];
        for (let i = 0; i < current.length; i++) {
          const m = getMatchForCourt(current, tempMembers);
          if (m) {
            const ids = [m.p1, m.p2, m.p3, m.p4];
            const names = ids.map(id => tempMembers.find(x => x.id === id)?.name || '?');
            setMatchHistory(ph => [{ id: Date.now().toString() + i, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: m.level }, ...ph]);
            current[i] = { ...current[i], match: m };
            applyMatch(m.p1, m.p2, m.p3, m.p4);
            // tempMembersも更新して連続して組まれないようにする
            tempMembers = tempMembers.map(tm => ids.includes(tm.id) ? { ...tm, playCount: tm.playCount + 1 } : tm);
          }
        }
        return current;
      });
    }, 100);
  };

  const unifiedBaseSize = (() => {
    const active = members.filter(m => m.isActive).map(m => m.name);
    if (active.length === 0) return '2.2rem';
    const maxL = Math.max(...active.map(n => /^[\x20-\x7E]*$/.test(n) ? n.length * 0.6 : n.length));
    return `${Math.max(0.8, Math.min(3.0, 2.5 * (3.5 / (maxL + 1.5))))}rem`;
  })();

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans overflow-x-hidden">
      <header className="bg-blue-800 text-white px-4 py-2 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-lg font-bold flex items-center gap-2"><Trophy size={18} /> ダブルスメーカー</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              <div className="flex items-center bg-blue-900/50 rounded-lg p-0.5">
                <Type size={14} className="mx-1 opacity-70"/>
                <button onClick={() => setConfig(p => ({ ...p, fontScale: Math.max(0.5, p.fontScale - 0.1) }))} className="w-7 h-7 flex items-center justify-center hover:bg-blue-700 rounded font-bold">-</button>
                <button onClick={() => setConfig(p => ({ ...p, fontScale: Math.min(2.0, p.fontScale + 0.1) }))} className="w-7 h-7 flex items-center justify-center hover:bg-blue-700 rounded font-bold">+</button>
              </div>
              <div className="flex items-center bg-blue-900/50 rounded-lg p-0.5">
                <button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, p.zoomLevel - 0.1) }))} className="p-1.5 hover:bg-blue-700 rounded"><ZoomOut size={16}/></button>
                <button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.min(2.0, p.zoomLevel + 0.1) }))} className="p-1.5 hover:bg-blue-700 rounded"><ZoomIn size={16}/></button>
              </div>
              <button onClick={handleBulkAction} className="bg-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md ml-1">一括更新</button>
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
                  {court.match && <button onClick={() => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, match: null } : c))} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-0.5 rounded text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12} /> 終了</button>}
                </div>
                <div className="flex-1 relative p-1">
                  {court.match ? (
                    <div className="flex h-full w-full gap-1">
                      <div className="flex-1 flex flex-col bg-blue-50/50 rounded-l overflow-hidden">
                        <div className="flex-1 flex items-center justify-center border-b border-blue-100/50 p-1"><div className="font-black text-blue-900 text-center break-words w-full leading-tight" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p1)?.name}</div></div>
                        <div className="flex-1 flex items-center justify-center p-1"><div className="font-black text-blue-900 text-center break-words w-full leading-tight" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p2)?.name}</div></div>
                      </div>
                      <div className="w-6 flex items-center justify-center relative"><div className="absolute inset-y-2 left-1/2 w-px bg-gray-200 -translate-x-1/2"></div><div className="bg-white z-10 rounded-full px-1 py-0.5 text-[9px] font-bold text-gray-400 border border-gray-200 shadow-sm">VS</div></div>
                      <div className="flex-1 flex flex-col bg-red-50/50 rounded-r overflow-hidden">
                        <div className="flex-1 flex items-center justify-center border-b border-red-100/50 p-1"><div className="font-black text-red-900 text-center break-words w-full leading-tight" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p3)?.name}</div></div>
                        <div className="flex-1 flex items-center justify-center p-1"><div className="font-black text-red-900 text-center break-words w-full leading-tight" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p4)?.name}</div></div>
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

        {/* --- 名簿、履歴、設定タブ (共通) --- */}
        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2"><h2 className="font-bold text-xl text-gray-700">名簿 ({members.filter(m => m.isActive).length}/{members.length})</h2><button onClick={() => {
              const newM: Member = { id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: null };
              setMembers([...members, newM]); setNextMemberId(n => n + 1);
            }} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button></div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden">
              {members.map(m => (
                <div key={m.id} className={`p-4 flex items-center gap-4 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1">
                      <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, level: x.level === 'A' ? 'B' : x.level === 'B' ? 'C' : 'A' } : x))} className={`text-xs font-bold rounded px-3 py-1 text-white ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>レベル{m.level}</button>
                      <button onClick={() => setEditingPairMemberId(m.id)} className="text-xs font-bold px-2 py-1 rounded border border-gray-300 text-gray-500 flex items-center gap-1">{m.fixedPairMemberId ? <><LinkIcon size={12}/>ペアあり</> : <><Unlink size={12}/>設定</>}</button>
                      <span className="text-xs text-gray-400">試合数: {m.playCount}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 ${m.isActive ? 'border-blue-600 text-blue-600' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => setMembers(prev => prev.filter(x => x.id !== m.id))} className="text-gray-200 hover:text-red-500"><Trash2 size={24} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingPairMemberId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold">ペア設定</h3><button onClick={() => setEditingPairMemberId(null)}><X/></button></div>
              <div className="p-2 space-y-1">
                <button onClick={() => {
                  setMembers(prev => prev.map(m => {
                    if (m.id === editingPairMemberId) return { ...m, fixedPairMemberId: null };
                    if (m.fixedPairMemberId === editingPairMemberId) return { ...m, fixedPairMemberId: null };
                    return m;
                  }));
                  setEditingPairMemberId(null);
                }} className="w-full text-left p-3 hover:bg-red-50 text-red-600 font-bold border-b">ペアを解消</button>
                {members.filter(m => m.id !== editingPairMemberId && m.isActive).map(m => (
                  <button key={m.id} onClick={() => {
                    setMembers(prev => prev.map(x => {
                      if (x.id === editingPairMemberId) return { ...x, fixedPairMemberId: m.id };
                      if (x.id === m.id) return { ...x, fixedPairMemberId: editingPairMemberId };
                      if (x.fixedPairMemberId === editingPairMemberId || x.fixedPairMemberId === m.id) return { ...x, fixedPairMemberId: null };
                      return x;
                    }));
                    setEditingPairMemberId(null);
                  }} className="w-full text-left p-3 hover:bg-blue-50 border-b">{m.name}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400"><tr><th className="p-4 text-xs font-bold uppercase">時刻</th><th className="p-4 text-xs font-bold uppercase">対戦</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm">{h.timestamp}</td><td className="p-4 font-bold text-base">{h.level && <span className="bg-gray-400 text-white px-1 rounded text-[10px] mr-2">{h.level}</span>}{h.players[0]}, {h.players[1]} <span className="text-gray-300 italic">vs</span> {h.players[2]}, {h.players[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div><label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-widest">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label><input type="range" min="1" max="8" value={config.courtCount} onChange={e => setCourts(Array.from({ length: parseInt(e.target.value) }, (_, i) => ({ id: i + 1, match: null })))} className="w-full accent-blue-600" /></div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><button onClick={() => setConfig(p => ({ ...p, levelStrict: !p.levelStrict }))} className={`w-14 h-7 rounded-full transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'} relative`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button></div>
            <button onClick={() => { if(confirm('全て消去しますか？')) { localStorage.clear(); location.reload(); } }} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100">データを完全消去</button>
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
