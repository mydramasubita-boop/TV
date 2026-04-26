import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Clock, Film, Tv, Monitor, Clapperboard, Search, Play, ChevronLeft, Volume2, VolumeX, SkipBack, SkipForward, Trash2, RefreshCw } from 'lucide-react';
import {
  createGroup, joinGroup, pushToGroup, subscribeToGroup,
  getSavedGroupName, getSavedGroupPin, disconnectGroup
} from './firebase';
import type { SyncData } from './firebase';
import { checkForUpdate } from './updater';

const lockOrientation = () => {
  const ori = screen.orientation as any;
  if (ori?.lock) ori.lock('landscape').catch(() => {});
};

interface Episodio { titolo_episodio: string; url_video: string; }
interface VideoData { is_serie: boolean; url_video?: string; episodi?: Episodio[]; }
interface Project {
  id_progetto: string; url_poster_verticale: string; titolo: string;
  generi: string[]; attori: string[]; descrizione: string;
  macro_categoria: string; sub_categoria: string; video_data: VideoData;
}
interface HistoryItem { projectId: string; episodeIndex: number; timestamp: number; }

const rKey = (id: string, ep: number) => `mdl_r_${id}_${ep}`;
const C = { primary: '#FF1493', secondary: '#8B008B' };

const HeartIcon = ({ filled, size=16 }: { filled:boolean; size?:number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? 'white' : 'none'} stroke="white"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const MyDramaApp = () => {
  const [loading, setLoading]           = useState(true);
  const [showApp, setShowApp]           = useState(false);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [currentPage, setCurrentPage]   = useState('home');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [favorites, setFavorites]       = useState<string[]>([]);
  const [history, setHistory]           = useState<HistoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [playing, setPlaying]           = useState<Project | null>(null);
  const [playingProject, setPlayingProject] = useState<Project | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [muted, setMuted]               = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playerReady, setPlayerReady]   = useState(false);
  const [isPlaying, setIsPlaying]       = useState(true);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [focusZone, setFocusZone]       = useState<string>('menu');
  const [focusedCard, setFocusedCard]   = useState(0);
  const [focusedMenu, setFocusedMenu]   = useState(0);
  const [focusedSubcat, setFocusedSubcat] = useState(0);
  const [dZone, setDZone] = useState<'back'|'genres'|'actors'|'buttons'|'episodes'>('back');
  const [dIdx, setDIdx]   = useState(0);
  const [playerFocus, setPlayerFocus] = useState<'none'|'back'|'playpause'|'mute'|'prev'|'next'|'seekback'|'seekfwd'|'episodelist'>('none');
  const [showEpisodePanel, setShowEpisodePanel] = useState(false);
  const [epPanelIdx, setEpPanelIdx] = useState(0);
  const [showExitMsg, setShowExitMsg] = useState(false);
  const backCountRef = useRef(0);

  // Sync gruppo+PIN
  const [groupName, setGroupName] = useState<string | null>(getSavedGroupName);
  const [groupPin, setGroupPin]   = useState<string | null>(getSavedGroupPin);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncView, setSyncView]   = useState<'main'|'create'|'join'>('main');
  const [syncGroupInput, setSyncGroupInput] = useState('');
  const [syncPinInput, setSyncPinInput]     = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle'|'loading'|'ok'|'error'>('idle');
  const [syncError, setSyncError]   = useState('');
  const [syncFocus, setSyncFocus]   = useState<'main_create'|'main_join'|'input_group'|'input_pin'|'btn_action'|'btn_back'|'btn_send'|'btn_disconnect'|'btn_close'>('main_create');

  const [updateInfo, setUpdateInfo] = useState<{version:string; downloadUrl:string}|null>(null);
  const [updateStatus, setUpdateStatus] = useState<string>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);

  const syncUnsub    = useRef<(()=>void)|null>(null);
  const isSyncing    = useRef(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const videoRef      = useRef<HTMLVideoElement|null>(null);
  const preloaderRef  = useRef<HTMLVideoElement|null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const enterStart    = useRef<number|null>(null);
  const searchRef     = useRef<HTMLInputElement|null>(null);
  const resumeTimer   = useRef<ReturnType<typeof setInterval>|null>(null);
  const gridRef       = useRef<HTMLDivElement|null>(null);
  const scrollRef     = useRef<HTMLDivElement|null>(null);

  const menuItems = [
    { id:'home',      label:'Home',               Icon:Home },
    { id:'history',   label:'Continua a guardare', Icon:Clock },
    { id:'favorites', label:'Preferiti',           Icon:Film },
    { id:'film',      label:'Film',                Icon:Film },
    { id:'drama',     label:'Drama',               Icon:Tv },
    { id:'mini',      label:'Mini e Web Drama',    Icon:Monitor },
    { id:'altro',     label:'Altro',               Icon:Clapperboard },
    { id:'search',    label:'Cerca',               Icon:Search },
    { id:'sync',      label:'Sync',                Icon:RefreshCw },
  ];

  const IconMap: Record<string,React.ElementType> = {
    home:Home, history:Clock, favorites:Film, film:Film, sync:RefreshCw,
    drama:Tv, mini:Monitor, altro:Clapperboard, search:Search
  };

  const pagesWithSub = ['film','drama','mini','altro'];
  const hasSub = pagesWithSub.includes(currentPage);
  const getSubCats = (): string[] => ({
    film:  ['Cina','Corea','Giappone','Hong Kong','Taiwan','Thailandia'],
    drama: ['Cina','Corea','Giappone','Hong Kong','Taiwan','Thailandia'],
    mini:  ['Cina','Corea','Giappone','Hong Kong','Taiwan','Thailandia'],
    altro: ['Cortometraggi','Teaser Trailer','Pubblicità'],
  } as Record<string,string[]>)[currentPage] ?? [];
  const subOpts = () => ['Tutte', ...getSubCats()];

  const getRealCols = useCallback((): number => {
    if (gridRef.current) {
      const cols = window.getComputedStyle(gridRef.current)
        .getPropertyValue('grid-template-columns').trim().split(/\s+/).filter(Boolean).length;
      if (cols > 0) return cols;
    }
    return Math.max(1, Math.floor((window.innerWidth - 64) / 185));
  }, []);

  const goToSearch = (query: string) => {
    setCurrentPage('search'); setSelectedCategory(null); setSearchQuery(query);
    setFocusedCard(0); setFocusedSubcat(0);
  };
  const goToPage = (page: string) => {
    setCurrentPage(page); setSelectedCategory(null); setSearchQuery('');
    setFocusedCard(0); setFocusedSubcat(0);
  };

  // Ricerca: stringa intera su tutto
  const getFilteredProjects = useCallback((): Project[] => {
    let f = projects;
    if (currentPage==='home') return projects.slice(0, 20);
    if (currentPage==='favorites') f=f.filter(p=>favorites.includes(p.id_progetto));
    else if (currentPage==='history') f=history.map(h=>projects.find(p=>p.id_progetto===h.projectId)).filter((p):p is Project=>!!p);
    else if (currentPage==='film')  f=f.filter(p=>p.macro_categoria==='film');
    else if (currentPage==='drama') f=f.filter(p=>p.macro_categoria==='drama');
    else if (currentPage==='mini')  f=f.filter(p=>p.macro_categoria==='mini-e-web-drama');
    else if (currentPage==='altro') f=f.filter(p=>p.macro_categoria==='altro');
    if (selectedCategory) f=f.filter(p=>p.sub_categoria.toLowerCase()===selectedCategory.toLowerCase());
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      f = f.filter(p => (
        p.titolo.toLowerCase().includes(q) ||
        p.descrizione.toLowerCase().includes(q) ||
        p.generi.some(g => g.toLowerCase().includes(q)) ||
        p.attori.some(a => a.toLowerCase().includes(q)) ||
        p.macro_categoria.toLowerCase().includes(q) ||
        p.sub_categoria.toLowerCase().includes(q)
      ));
    }
    return f;
  }, [projects, currentPage, favorites, history, selectedCategory, searchQuery]);

  // Sync helpers
  const getLocalSyncData = (): SyncData => {
    const positions: Record<string, number> = {};
    for (let i=0; i<localStorage.length; i++) {
      const k=localStorage.key(i);
      if (k?.startsWith('mdl_r_')) { const v=localStorage.getItem(k); if(v) positions[k]=parseInt(v); }
    }
    return { favorites, history, positions, lastUpdated: Date.now() };
  };

  const applyRemoteData = useCallback((data: SyncData) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    const mergedFav = [...new Set([...favorites, ...(data.favorites||[])])];
    setFavorites(mergedFav); localStorage.setItem('mdl_fav', JSON.stringify(mergedFav));
    const allHist = [...history, ...(data.history||[])];
    const histMap = new Map<string, HistoryItem>();
    allHist.forEach(h => { const ex=histMap.get(h.projectId); if(!ex||h.timestamp>ex.timestamp) histMap.set(h.projectId,h); });
    const mergedHist = Array.from(histMap.values()).sort((a,b)=>b.timestamp-a.timestamp).slice(0,50);
    setHistory(mergedHist); localStorage.setItem('mdl_hist', JSON.stringify(mergedHist));
    Object.entries(data.positions||{}).forEach(([k,v]) => {
      const local=parseInt(localStorage.getItem(k)||'0');
      if (v>local) localStorage.setItem(k,String(v));
    });
    isSyncing.current = false;
  }, [favorites, history]);

  const pushSync = useCallback((favs: string[], hist: HistoryItem[]) => {
    const gn = getSavedGroupName(); if (!gn) return;
    const positions: Record<string,number> = {};
    for (let i=0; i<localStorage.length; i++) {
      const k=localStorage.key(i);
      if (k?.startsWith('mdl_r_')) { const v=localStorage.getItem(k); if(v) positions[k]=parseInt(v); }
    }
    pushToGroup(gn, { favorites: favs, history: hist, positions, lastUpdated: Date.now() });
  }, []);

  const startGroupListener = useCallback((gn: string) => {
    if (syncUnsub.current) syncUnsub.current();
    syncUnsub.current = subscribeToGroup(gn, applyRemoteData);
  }, [applyRemoteData]);

  useEffect(() => {
    if (playing) {
      resumeTimer.current = setInterval(() => {
        if (videoRef.current && !videoRef.current.paused)
          localStorage.setItem(rKey(playing.id_progetto, currentEpisode), String(Math.floor(videoRef.current.currentTime)));
      }, 5000);
    }
    return () => { if (resumeTimer.current) clearInterval(resumeTimer.current); };
  }, [playing, currentEpisode]);

  useEffect(() => {
    lockOrientation();
    window.addEventListener('load', lockOrientation);
    return () => window.removeEventListener('load', lockOrientation);
  }, []);

  useEffect(() => {
    const dummy = document.createElement('button');
    dummy.style.cssText = 'position:fixed;opacity:0;width:1px;height:1px;top:0;left:0;pointer-events:none;';
    dummy.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dummy); dummy.focus();
    const refocus = () => dummy.focus();
    window.addEventListener('focus', refocus);
    return () => { window.removeEventListener('focus', refocus); document.body.removeChild(dummy); };
  }, []);

  useEffect(() => {
    window.history.pushState({ mdl: true }, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState({ mdl: true }, '', window.location.href);
      window.dispatchEvent(new CustomEvent('firetv-back'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    loadProjects(); loadFavorites(); loadHistory();
    const gn = getSavedGroupName();
    if (gn) startGroupListener(gn);
    setTimeout(() => setShowApp(true), 300);
    checkForUpdate().then(result => {
      if (result.hasUpdate && result.version && result.downloadUrl)
        setUpdateInfo({ version: result.version, downloadUrl: result.downloadUrl });
    });
    return () => { if (syncUnsub.current) syncUnsub.current(); };
  }, []);

  useEffect(() => {
    if (focusZone === 'search_input') searchRef.current?.focus();
    else searchRef.current?.blur();
  }, [focusZone]);

  useEffect(() => {
    if (focusZone !== 'content' || selectedProject) return;
    setTimeout(() => {
      const el = document.querySelector(`[data-ci="${focusedCard}"]`);
      const sc = scrollRef.current;
      if (!el || !sc) return;
      const hH=95, sH=hasSub?56:0, top=hH+sH+10;
      const r = el.getBoundingClientRect();
      if (r.top < top) sc.scrollBy({ top: r.top - top, behavior:'smooth' });
      else if (r.bottom > window.innerHeight - 44) sc.scrollBy({ top: r.bottom - window.innerHeight + 44, behavior:'smooth' });
    }, 50);
  }, [focusedCard, focusZone, selectedProject, hasSub]);

  useEffect(() => {
    if (focusZone==='menu') scrollRef.current?.scrollTo({ top:0, behavior:'smooth' });
  }, [focusZone]);

  useEffect(() => {
    if (!selectedProject) return;
    setTimeout(() => {
      const sel: Record<string,string> = {
        back:'[data-db="true"]', genres:`[data-dg="${dIdx}"]`,
        actors:`[data-da="${dIdx}"]`, buttons:`[data-dbt="${dIdx}"]`, episodes:`[data-de="${dIdx}"]`,
      };
      document.querySelector(sel[dZone])?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }, 50);
  }, [dZone, dIdx, selectedProject]);

  useEffect(() => {
    if (!videoRef.current || !playing) return;
    const v = videoRef.current;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      const left = v.duration - v.currentTime;
      if (left<=20&&left>0&&playing.video_data.episodi&&currentEpisode<playing.video_data.episodi.length-1)
        setShowNextButton(true);
    };
    const onMeta = () => setDuration(v.duration);
    v.addEventListener('timeupdate', onTime); v.addEventListener('loadedmetadata', onMeta);
    return () => { v.removeEventListener('timeupdate',onTime); v.removeEventListener('loadedmetadata',onMeta); };
  }, [playing, currentEpisode]);

  useEffect(() => {
    if (playing && showControls) {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [showControls, playing]);

  // ── TASTIERA ─────────────────────────────────────────────────────────
  useEffect(() => {
    const isBack = (e: KeyboardEvent) =>
      e.keyCode===8 || e.keyCode===27 || e.key==='GoBack' || e.keyCode===10009 || e.keyCode===461;

    const doExit = () => {
      backCountRef.current += 1;
      if (backCountRef.current >= 2) {
        try { (window as any).Android?.exitApp?.(); } catch(_) {}
        try { (window as any).Capacitor?.Plugins?.App?.exitApp?.(); } catch(_) {}
        backCountRef.current = 0; return;
      }
      setShowExitMsg(true);
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
      backTimerRef.current = setTimeout(() => { backCountRef.current=0; setShowExitMsg(false); }, 2500);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      // Lascia digitare negli input quando sono focused
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        if (e.keyCode === 38 || e.keyCode === 40) {
          // frecce su/giù: consenti navigazione tra campi
          e.preventDefault();
          if (focusZone === 'sync') {
            if (e.keyCode === 38) {
              if (syncView === 'join') { if(syncFocus==='input_pin')setSyncFocus('input_group');else if(syncFocus==='btn_action')setSyncFocus(syncView==='join'?'input_pin':'input_group');else if(syncFocus==='btn_back')setSyncFocus('btn_action'); }
              else { if(syncFocus==='btn_action')setSyncFocus('input_group');else if(syncFocus==='btn_back')setSyncFocus('btn_action'); }
            } else {
              if (syncView === 'join') { if(syncFocus==='input_group')setSyncFocus('input_pin');else if(syncFocus==='input_pin')setSyncFocus('btn_action');else if(syncFocus==='btn_action')setSyncFocus('btn_back'); }
              else { if(syncFocus==='input_group')setSyncFocus('btn_action');else if(syncFocus==='btn_action')setSyncFocus('btn_back'); }
            }
          }
        }
        // Tutti gli altri tasti (lettere, numeri, backspace) passano all'input
        if (e.keyCode !== 27 && e.keyCode !== 10009 && e.keyCode !== 461) return;
      }

      // ── PLAYER ──────────────────────────────────────────────────────
      if (playing) {
        e.preventDefault();
        setShowControls(true);
        const hasPrev = currentEpisode > 0;
        const hasNext = !!(playing.video_data.episodi && currentEpisode < playing.video_data.episodi.length-1);
        const doBack = () => {
          if (videoRef.current) localStorage.setItem(rKey(playing.id_progetto,currentEpisode), String(Math.floor(videoRef.current.currentTime)));
          setPlaying(null); setShowNextButton(false); setIsPlaying(true); setPlayerReady(false); setPlayerFocus('none');
          setSelectedProject(playingProject); setDZone('back'); setDIdx(0);
        };
        if (isBack(e)) { if (showEpisodePanel) { setShowEpisodePanel(false); return; } doBack(); return; }
        if (e.keyCode===179||e.keyCode===85||e.keyCode===126) { if(videoRef.current){if(videoRef.current.paused){videoRef.current.play();setIsPlaying(true);}else{videoRef.current.pause();setIsPlaying(false);}} return; }
        if (e.keyCode===19) { if(videoRef.current){videoRef.current.pause();setIsPlaying(false);} return; }
        if (e.keyCode===130) { if(videoRef.current){videoRef.current.play();setIsPlaying(true);} return; }
        if (e.keyCode===178||e.keyCode===86) { doBack(); return; }
        if (e.keyCode===176||e.keyCode===87) { if(hasNext){nextEpisode();} return; }
        if (e.keyCode===177||e.keyCode===88) { if(hasPrev){prevEpisode();} return; }
        if (e.keyCode===228||e.keyCode===229||e.keyCode===90) { if(videoRef.current) videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10); return; }
        if (e.keyCode===227||e.keyCode===166||e.keyCode===89) { if(videoRef.current) videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10); return; }
        if (e.keyCode===165||e.keyCode===403||e.keyCode===404) {
          if (playing.video_data.is_serie && playing.video_data.episodi) { setShowEpisodePanel(p=>!p); setEpPanelIdx(currentEpisode); } return;
        }
        if (showEpisodePanel && playing.video_data.episodi) {
          const tot = playing.video_data.episodi.length;
          if (e.keyCode===38) { setEpPanelIdx(p=>Math.max(0,p-1)); return; }
          if (e.keyCode===40) { setEpPanelIdx(p=>Math.min(tot-1,p+1)); return; }
          if (e.keyCode===13) { playVideo(playing, epPanelIdx); setShowEpisodePanel(false); return; }
          if (e.keyCode===37||e.keyCode===39) { setShowEpisodePanel(false); return; }
          return;
        }
        if (e.keyCode===38) { if(playerFocus==='none'||playerFocus==='playpause'||playerFocus==='seekback'||playerFocus==='seekfwd'){setPlayerFocus(playing.video_data.is_serie?'episodelist':'back');}else if(playerFocus==='prev'||playerFocus==='next')setPlayerFocus('playpause'); return; }
        if (e.keyCode===40) { if(playerFocus==='back'||playerFocus==='episodelist'||playerFocus==='mute')setPlayerFocus('playpause');else if(playerFocus==='playpause'||playerFocus==='seekback'||playerFocus==='seekfwd'){if(hasNext)setPlayerFocus('next');else if(hasPrev)setPlayerFocus('prev');} return; }
        if (e.keyCode===37) { if(playerFocus==='mute')setPlayerFocus('episodelist');else if(playerFocus==='episodelist')setPlayerFocus('back');else if(playerFocus==='seekfwd')setPlayerFocus('playpause');else if(playerFocus==='playpause')setPlayerFocus('seekback');else if(playerFocus==='next'&&hasPrev)setPlayerFocus('prev');else if(playerFocus==='none'){if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10);} return; }
        if (e.keyCode===39) { if(playerFocus==='back')setPlayerFocus('episodelist');else if(playerFocus==='episodelist')setPlayerFocus('mute');else if(playerFocus==='seekback')setPlayerFocus('playpause');else if(playerFocus==='playpause')setPlayerFocus('seekfwd');else if(playerFocus==='prev'&&hasNext)setPlayerFocus('next');else if(playerFocus==='none'){if(videoRef.current)videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10);} return; }
        if (e.keyCode===13) {
          if(playerFocus==='back'){doBack();}
          else if(playerFocus==='episodelist'){if(playing.video_data.is_serie&&playing.video_data.episodi){setShowEpisodePanel(p=>!p);setEpPanelIdx(currentEpisode);}}
          else if(playerFocus==='playpause'){if(videoRef.current){if(videoRef.current.paused){videoRef.current.play();setIsPlaying(true);}else{videoRef.current.pause();setIsPlaying(false);}}}
          else if(playerFocus==='mute'){setMuted(m=>{if(videoRef.current)videoRef.current.muted=!m;return !m;});}
          else if(playerFocus==='seekback'){if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10);}
          else if(playerFocus==='seekfwd'){if(videoRef.current)videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10);}
          else if(playerFocus==='prev'){prevEpisode();setPlayerFocus('none');}
          else if(playerFocus==='next'){nextEpisode();setPlayerFocus('none');}
          else{if(videoRef.current){if(videoRef.current.paused){videoRef.current.play();setIsPlaying(true);}else{videoRef.current.pause();setIsPlaying(false);}}}
          return;
        }
        return;
      }

      // ── DETTAGLIO ───────────────────────────────────────────────────
      if (selectedProject) {
        if (isBack(e)) { e.preventDefault(); setSelectedProject(null); setDZone('back'); setDIdx(0); setFocusZone('content'); return; }
        const gc=selectedProject.generi.length, ac=selectedProject.attori.length;
        const hb=!selectedProject.video_data.is_serie?2:1;
        const ec=selectedProject.video_data.episodi?.length??0;
        if (e.keyCode===38) { e.preventDefault(); if(dZone==='episodes'){if(dIdx===0){setDZone('buttons');setDIdx(0);}else setDIdx(p=>p-1);}else if(dZone==='buttons'){setDZone('actors');setDIdx(0);}else if(dZone==='actors'){setDZone('genres');setDIdx(0);}else if(dZone==='genres'){setDZone('back');setDIdx(0);} }
        else if (e.keyCode===40) { e.preventDefault(); if(dZone==='back'){setDZone('genres');setDIdx(0);}else if(dZone==='genres'){setDZone('actors');setDIdx(0);}else if(dZone==='actors'){setDZone('buttons');setDIdx(0);}else if(dZone==='buttons'&&ec>0){setDZone('episodes');setDIdx(0);}else if(dZone==='episodes')setDIdx(p=>Math.min(ec-1,p+1)); }
        else if (e.keyCode===37) { e.preventDefault(); if(dZone==='genres')setDIdx(p=>Math.max(0,p-1));else if(dZone==='actors')setDIdx(p=>Math.max(0,p-1));else if(dZone==='buttons')setDIdx(p=>Math.max(0,p-1)); }
        else if (e.keyCode===39) { e.preventDefault(); if(dZone==='genres')setDIdx(p=>Math.min(gc-1,p+1));else if(dZone==='actors')setDIdx(p=>Math.min(ac-1,p+1));else if(dZone==='buttons')setDIdx(p=>Math.min(hb-1,p+1)); }
        else if (e.keyCode===13) { e.preventDefault();
          if(dZone==='back'){setSelectedProject(null);setDZone('back');setDIdx(0);setFocusZone('content');}
          else if(dZone==='genres'){goToSearch(selectedProject.generi[dIdx]);setSelectedProject(null);setDZone('back');setDIdx(0);setFocusZone('content');}
          else if(dZone==='actors'){goToSearch(selectedProject.attori[dIdx]);setSelectedProject(null);setDZone('back');setDIdx(0);setFocusZone('content');}
          else if(dZone==='buttons'){if(dIdx===0)toggleFavorite(selectedProject.id_progetto);else if(dIdx===1&&!selectedProject.video_data.is_serie)playVideo(selectedProject);}
          else if(dZone==='episodes'){playVideo(selectedProject,dIdx);}
        }
        return;
      }

      // ── SEARCH INPUT ────────────────────────────────────────────────
      if (focusZone==='search_input') {
        if (e.keyCode===38) { e.preventDefault(); setFocusZone('menu'); return; }
        if (e.keyCode===40) { e.preventDefault(); setFocusZone('content'); setFocusedCard(0); return; }
        if (isBack(e) && searchQuery.length===0) { e.preventDefault(); setFocusZone('menu'); return; }
        return;
      }

      // ── MODALE SYNC ─────────────────────────────────────────────────
      if (focusZone === 'sync') {
        e.preventDefault();
        if (isBack(e)) { setShowSyncModal(false); setSyncView('main'); setSyncGroupInput(''); setSyncPinInput(''); setSyncStatus('idle'); setSyncError(''); setFocusZone('menu'); return; }

        if (groupName) {
          // Vista connesso
          if (e.keyCode===38) { setSyncFocus(p=>p==='btn_disconnect'?'btn_send':p==='btn_close'?'btn_disconnect':'btn_send'); return; }
          if (e.keyCode===40) { setSyncFocus(p=>p==='btn_send'?'btn_disconnect':p==='btn_disconnect'?'btn_close':'btn_close'); return; }
          if (e.keyCode===13) {
            if (syncFocus==='btn_send') { pushToGroup(groupName, getLocalSyncData()); setSyncStatus('ok'); setTimeout(()=>setSyncStatus('idle'),1500); }
            else if (syncFocus==='btn_disconnect') { disconnectGroup(); setGroupName(null); setGroupPin(null); setShowSyncModal(false); setFocusZone('menu'); }
            else { setShowSyncModal(false); setFocusZone('menu'); }
            return;
          }
          return;
        }

        if (syncView==='main') {
          if (e.keyCode===38) { setSyncFocus(p=>p==='main_join'?'main_create':'main_create'); return; }
          if (e.keyCode===40) { setSyncFocus(p=>p==='main_create'?'main_join':'main_join'); return; }
          if (e.keyCode===13) { if(syncFocus==='main_create'){setSyncView('create');setSyncFocus('input_group');}else{setSyncView('join');setSyncFocus('input_group');} return; }
          return;
        }

        if (syncView==='create'||syncView==='join') {
          if (e.keyCode===38) {
            if (syncView==='join') { if(syncFocus==='input_pin')setSyncFocus('input_group');else if(syncFocus==='btn_action')setSyncFocus(syncView==='join'?'input_pin':'input_group');else if(syncFocus==='btn_back')setSyncFocus('btn_action'); }
            else { if(syncFocus==='btn_action')setSyncFocus('input_group');else if(syncFocus==='btn_back')setSyncFocus('btn_action'); }
            return;
          }
          if (e.keyCode===40) {
            if (syncView==='join') { if(syncFocus==='input_group')setSyncFocus('input_pin');else if(syncFocus==='input_pin')setSyncFocus('btn_action');else if(syncFocus==='btn_action')setSyncFocus('btn_back'); }
            else { if(syncFocus==='input_group')setSyncFocus('btn_action');else if(syncFocus==='btn_action')setSyncFocus('btn_back'); }
            return;
          }
          if (e.keyCode===13) {
            if (syncFocus==='btn_back') { setSyncView('main'); setSyncGroupInput(''); setSyncPinInput(''); setSyncError(''); setSyncFocus('main_create'); return; }
            if (syncFocus==='input_group'||syncFocus==='input_pin') return; // lascia digitare
            if (syncFocus==='btn_action') { handleSyncAction(); return; }
          }
          return;
        }
        return;
      }

      // ── NAVIGAZIONE PRINCIPALE ──────────────────────────────────────
      if (isBack(e)) {
        e.preventDefault();
        if (focusZone==='history_delete') { setFocusZone('content'); return; }
        if (focusZone==='history_clear') { setFocusZone('menu'); return; }
        doExit(); return;
      }

      const fp=getFilteredProjects(), tot=fp.length, opts=subOpts(), cols=getRealCols();

      if (e.keyCode===13) {
        e.preventDefault();
        if (focusZone==='menu') { const item=menuItems[focusedMenu]; if(item){if(item.id==='sync'){setShowSyncModal(true);setSyncFocus(groupName?'btn_send':'main_create');setSyncView('main');setFocusZone('sync');}else{goToPage(item.id);}} return; }
        if (focusZone==='subcategory') { const ch=opts[focusedSubcat]; setSelectedCategory(ch==='Tutte'?null:ch); setFocusedCard(0); return; }
        if (focusZone==='history_clear') { clearHistory(); setFocusZone('menu'); return; }
        if (focusZone==='history_delete') { const proj=getFilteredProjects()[focusedCard]; if(proj){removeFromHistory(proj.id_progetto);setFocusZone('content');} return; }
        if (focusZone==='content' && !enterStart.current) { enterStart.current=Date.now(); }
        return;
      }
      if (e.keyCode===38) {
        e.preventDefault();
        if (focusZone==='history_delete') setFocusZone('content');
        else if (focusZone==='history_clear') setFocusZone('menu');
        else if (focusZone==='content') { if(focusedCard<cols){if(currentPage==='history'&&history.length>0)setFocusZone('history_clear');else setFocusZone(hasSub?'subcategory':currentPage==='search'?'search_input':'menu');}else setFocusedCard(p=>Math.max(0,p-cols)); }
        else if (focusZone==='subcategory') setFocusZone('menu');
        else if (focusZone==='search_input') setFocusZone('menu');
      } else if (e.keyCode===40) {
        e.preventDefault();
        if (focusZone==='menu') { if(currentPage==='search')setFocusZone('search_input');else if(currentPage==='history'&&history.length>0)setFocusZone('history_clear');else if(hasSub){setFocusZone('subcategory');setFocusedSubcat(0);}else{setFocusZone('content');setFocusedCard(0);} }
        else if (focusZone==='history_clear') { setFocusZone('content'); setFocusedCard(0); }
        else if (focusZone==='subcategory') { setFocusZone('content'); setFocusedCard(0); }
        else if (focusZone==='search_input') { setFocusZone('content'); setFocusedCard(0); }
        else if (focusZone==='content') { if(currentPage==='history')setFocusZone('history_delete');else setFocusedCard(p=>Math.min(tot-1,p+cols)); }
      } else if (e.keyCode===37) {
        e.preventDefault();
        if (focusZone==='menu') setFocusedMenu(p=>Math.max(0,p-1));
        else if (focusZone==='subcategory') setFocusedSubcat(p=>Math.max(0,p-1));
        else if (focusZone==='content') setFocusedCard(p=>Math.max(0,p-1));
      } else if (e.keyCode===39) {
        e.preventDefault();
        if (focusZone==='menu') setFocusedMenu(p=>Math.min(menuItems.length-1,p+1));
        else if (focusZone==='subcategory') setFocusedSubcat(p=>Math.min(opts.length-1,p+1));
        else if (focusZone==='content') setFocusedCard(p=>Math.min(tot-1,p+1));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (playing || selectedProject) return;
      if (e.keyCode===13 && enterStart.current && focusZone==='content') {
        const dur=Date.now()-enterStart.current; enterStart.current=null;
        const proj=getFilteredProjects()[focusedCard]; if(!proj) return;
        if (dur>=2000) toggleFavorite(proj.id_progetto);
        else if (currentPage==='history') { const lastEp=history.find(h=>h.projectId===proj.id_progetto); playVideo(proj,lastEp?.episodeIndex||0); }
        else { setSelectedProject(proj); setDZone('back'); setDIdx(0); }
      }
    };

    const handleBackButton = () => {
      const fakeEvent = new KeyboardEvent('keydown', { keyCode: 10009, key: 'GoBack', bubbles: true });
      handleKeyDown(fakeEvent);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('firetv-back', handleBackButton);
    window.addEventListener('backbutton', handleBackButton);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('firetv-back', handleBackButton);
      window.removeEventListener('backbutton', handleBackButton);
    };
  }, [loading, playing, playingProject, selectedProject, focusedMenu, focusedCard, focusedSubcat,
      currentPage, focusZone, dZone, dIdx, duration, history, hasSub, selectedCategory,
      playerFocus, getRealCols, showEpisodePanel, epPanelIdx, syncFocus, syncGroupInput, syncPinInput,
      syncStatus, groupName, syncView, favorites]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const handleSyncAction = async () => {
    if (syncView==='create') {
      if (syncGroupInput.trim().length < 3) { setSyncError('Nome troppo corto (min. 3 caratteri)'); return; }
      setSyncStatus('loading'); setSyncError('');
      const result = await createGroup(syncGroupInput.trim());
      if (result.success && result.pin) {
        const gn = syncGroupInput.trim().toLowerCase().replace(/ /g,'_');
        setGroupName(gn); setGroupPin(result.pin);
        startGroupListener(gn);
        pushToGroup(gn, getLocalSyncData());
        setSyncStatus('ok');
        alert(`✅ Gruppo creato!\nNome: ${syncGroupInput.trim()}\nPIN: ${result.pin}\n\nSalva questi dati!`);
        setTimeout(() => { setSyncStatus('idle'); setShowSyncModal(false); setSyncView('main'); setSyncGroupInput(''); setFocusZone('menu'); }, 500);
      } else { setSyncError(result.error||'Errore'); setSyncStatus('idle'); }
    } else {
      if (syncGroupInput.trim().length < 3 || syncPinInput.length !== 6) { setSyncError('Inserisci nome e PIN a 6 cifre'); return; }
      setSyncStatus('loading'); setSyncError('');
      const result = await joinGroup(syncGroupInput.trim(), syncPinInput);
      if (result.success) {
        const gn = syncGroupInput.trim().toLowerCase().replace(/ /g,'_');
        setGroupName(gn); setGroupPin(syncPinInput);
        if (result.data) applyRemoteData(result.data);
        startGroupListener(gn);
        pushToGroup(gn, getLocalSyncData());
        setSyncStatus('ok');
        setTimeout(() => { setSyncStatus('idle'); setShowSyncModal(false); setSyncView('main'); setSyncGroupInput(''); setSyncPinInput(''); setFocusZone('menu'); }, 1500);
      } else { setSyncError(result.error||'Errore'); setSyncStatus('idle'); }
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause(); else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const pos=(e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.offsetWidth;
    if (videoRef.current) videoRef.current.currentTime=pos*duration;
  };
  const fmt = (s:number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const loadProjects = async () => { try { const r=await fetch('https://raw.githubusercontent.com/mydramasubita-boop/listaprogettimydramafansub/refs/heads/main/metadati_fansub_test.json'); setProjects(await r.json()); } catch {} };
  const loadFavorites = () => { try { const s=localStorage.getItem('mdl_fav'); if(s) setFavorites(JSON.parse(s)); } catch {} };
  const loadHistory   = () => { try { const s=localStorage.getItem('mdl_hist'); if(s) setHistory(JSON.parse(s)); } catch {} };

  const downloadAndInstall = async (downloadUrl: string) => {
    setUpdateStatus('downloading'); setDownloadProgress(0);
    try {
      const response = await fetch(downloadUrl, { cache: 'no-cache' });
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength) : 0;
      const reader = response.body!.getReader();
      const chunks: BlobPart[] = []; let received = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        chunks.push(value); received += value.length;
        if (total) setDownloadProgress(Math.round(received/total*100));
      }
      setDownloadProgress(100);
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const reader2 = new FileReader();
      reader2.onload = () => { const base64=(reader2.result as string).split(',')[1]; (window as any).AndroidInterface?.installApk?.(base64); setUpdateStatus('done'); };
      reader2.readAsDataURL(blob);
    } catch(e) { console.error('Download failed:', e); setUpdateStatus('idle'); }
  };

  const toggleFavorite = (id:string) => {
    const n=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];
    setFavorites(n); localStorage.setItem('mdl_fav',JSON.stringify(n)); pushSync(n,history);
  };
  const addToHistory = (project:Project, ep=0) => {
    const n=[{projectId:project.id_progetto,episodeIndex:ep,timestamp:Date.now()},
             ...history.filter(h=>h.projectId!==project.id_progetto)].slice(0,20);
    setHistory(n); localStorage.setItem('mdl_hist',JSON.stringify(n)); pushSync(favorites,n);
  };
  const clearHistory = () => { setHistory([]); localStorage.setItem('mdl_hist','[]'); pushSync(favorites,[]); };
  const removeFromHistory = (id:string) => {
    const n=history.filter(h=>h.projectId!==id);
    setHistory(n); localStorage.setItem('mdl_hist',JSON.stringify(n)); pushSync(favorites,n);
  };
  const playVideo = (project:Project, ep=0) => {
    setPlayingProject(project); setPlaying(project); setCurrentEpisode(ep);
    addToHistory(project,ep); setShowNextButton(false); setPlayerReady(false); setIsPlaying(true); setPlayerFocus('none');
    setTimeout(() => {
      lockOrientation();
      document.documentElement.requestFullscreen?.().catch(()=>{});
      const saved=localStorage.getItem(rKey(project.id_progetto,ep));
      if (videoRef.current&&saved&&parseInt(saved)>5) videoRef.current.currentTime=parseInt(saved);
    }, 300);
  };
  const nextEpisode = () => {
    if (!playing?.video_data.episodi||currentEpisode>=playing.video_data.episodi.length-1) return;
    const n=currentEpisode+1; setCurrentEpisode(n); setShowNextButton(false); addToHistory(playing,n); setPlayerReady(false);
    setTimeout(()=>{const s=localStorage.getItem(rKey(playing.id_progetto,n));if(videoRef.current&&s&&parseInt(s)>5)videoRef.current.currentTime=parseInt(s);},300);
  };
  const prevEpisode = () => {
    if (!playing||currentEpisode<=0) return;
    const n=currentEpisode-1; setCurrentEpisode(n); setShowNextButton(false); addToHistory(playing,n); setPlayerReady(false);
  };

  // ── PRELOADER ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{position:'fixed',inset:0,background:'#000',overflow:'hidden'}}>
      <div id="pc" style={{position:'absolute',inset:0,background:'#000',zIndex:10,transition:'opacity 0.2s'}}/>
      <video ref={preloaderRef} autoPlay muted playsInline
        style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',background:'#000'}}
        onCanPlay={()=>{const c=document.getElementById('pc');if(c){c.style.opacity='0';setTimeout(()=>{if(c)c.style.display='none';},200);}}}
        onTimeUpdate={(e)=>{const v=e.target as HTMLVideoElement;const l=v.duration-v.currentTime;if(l<=0.75&&l>0)v.style.opacity=String(l/0.75);}}
        onEnded={()=>setLoading(false)} onError={()=>setLoading(false)}>
        <source src="/preloader.mp4" type="video/mp4"/>
      </video>
    </div>
  );

  // ── PLAYER ──────────────────────────────────────────────────────────
  if (playing) {
    const url = playing.video_data.is_serie ? playing.video_data.episodi![currentEpisode].url_video : playing.video_data.url_video;
    const bk = playerFocus==='back';
    return (
      <div style={{width:'100%',height:'100vh',background:'#000',position:'relative'}}
        onMouseMove={()=>setShowControls(true)} onClick={()=>setShowControls(true)}>
        {!playerReady&&(<div style={{position:'absolute',inset:0,background:'#000',zIndex:20,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:'56px',height:'56px',border:'4px solid rgba(255,255,255,.15)',borderTopColor:C.primary,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></div>)}
        <video ref={videoRef} src={url} autoPlay muted={muted}
          style={{width:'100%',height:'100%',objectFit:'contain',opacity:playerReady?1:0,transition:'opacity 0.4s'}}
          onCanPlay={()=>setPlayerReady(true)} onClick={togglePlayPause}/>
        <div style={{position:'absolute',inset:0,background:showControls?'linear-gradient(to bottom,rgba(0,0,0,.75) 0%,transparent 25%,transparent 75%,rgba(0,0,0,.75) 100%)':'transparent',pointerEvents:showControls?'auto':'none',transition:'all 0.3s',opacity:showControls?1:0}}>
          <div style={{position:'absolute',top:'26px',left:'34px',right:'34px',display:'flex',justifyContent:'space-between',alignItems:'center',pointerEvents:'all'}}>
            <button onClick={()=>{if(videoRef.current)localStorage.setItem(rKey(playing.id_progetto,currentEpisode),String(Math.floor(videoRef.current.currentTime)));setPlaying(null);setShowNextButton(false);setIsPlaying(true);setPlayerReady(false);setPlayerFocus('none');setSelectedProject(playingProject);setDZone('back');setDIdx(0);}}
              style={{padding:'13px 26px',background:bk?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.88)',border:`2px solid ${bk?'#fff':C.primary}`,borderRadius:'12px',color:'white',display:'flex',alignItems:'center',gap:'10px',fontSize:'17px',cursor:'pointer',fontWeight:'bold',outline:'none',boxShadow:bk?`0 0 18px ${C.primary}`:'none',transform:bk?'scale(1.06)':'scale(1)',transition:'all 0.2s'}}>
              <ChevronLeft size={20}/> Indietro
            </button>
            {playing.video_data.is_serie&&playing.video_data.episodi&&(
              <button onClick={()=>{setShowEpisodePanel(p=>!p);setEpPanelIdx(currentEpisode);}}
                style={{background:showEpisodePanel||playerFocus==='episodelist'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.85)',padding:'12px 22px',borderRadius:'12px',fontSize:'16px',fontWeight:'bold',color:'white',border:`2px solid ${showEpisodePanel||playerFocus==='episodelist'?'#fff':C.primary}`,cursor:'pointer',outline:'none',display:'flex',alignItems:'center',gap:'10px',boxShadow:playerFocus==='episodelist'?`0 0 18px ${C.primary}`:'none',transform:playerFocus==='episodelist'?'scale(1.06)':'scale(1)',transition:'all 0.2s'}}>
                {playing.video_data.episodi[currentEpisode].titolo_episodio}<span style={{fontSize:'12px',opacity:.8}}>▶ Lista ep.</span>
              </button>
            )}
            <button onClick={()=>{setMuted(!muted);if(videoRef.current)videoRef.current.muted=!muted;}}
              style={{padding:'13px',background:playerFocus==='mute'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.88)',border:`2px solid ${playerFocus==='mute'?'#fff':C.primary}`,borderRadius:'12px',color:'white',cursor:'pointer',outline:'none',boxShadow:playerFocus==='mute'?`0 0 18px ${C.primary}`:'none',transform:playerFocus==='mute'?'scale(1.06)':'scale(1)',transition:'all 0.2s'}}>
              {muted?<VolumeX size={20}/>:<Volume2 size={20}/>}
            </button>
          </div>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',pointerEvents:'all',display:'flex',alignItems:'center',gap:'20px'}}>
            <button onClick={()=>{if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10);setShowControls(true);}}
              style={{width:'52px',height:'52px',background:playerFocus==='seekback'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.6)',border:`2px solid ${playerFocus==='seekback'?'#fff':C.primary}`,borderRadius:'50%',color:'white',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',outline:'none',boxShadow:playerFocus==='seekback'?`0 0 16px ${C.primary}`:'none',transform:playerFocus==='seekback'?'scale(1.1)':'scale(1)',transition:'all 0.2s',gap:'1px'}}>
              <SkipBack size={18} fill="white"/><span style={{fontSize:'9px',fontWeight:'bold'}}>-10s</span>
            </button>
            <button onClick={togglePlayPause}
              style={{width:'72px',height:'72px',background:playerFocus==='playpause'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.6)',border:`3px solid ${playerFocus==='playpause'?'#fff':C.primary}`,borderRadius:'50%',color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',outline:'none',boxShadow:playerFocus==='playpause'?`0 0 22px ${C.primary}`:'none',transform:playerFocus==='playpause'?'scale(1.1)':'scale(1)',transition:'all 0.2s'}}>
              {isPlaying?<div style={{display:'flex',gap:'5px'}}><div style={{width:'6px',height:'28px',background:'white',borderRadius:'2px'}}/><div style={{width:'6px',height:'28px',background:'white',borderRadius:'2px'}}/></div>:<Play size={32} fill="white" style={{marginLeft:'3px'}}/>}
            </button>
            <button onClick={()=>{if(videoRef.current)videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10);setShowControls(true);}}
              style={{width:'52px',height:'52px',background:playerFocus==='seekfwd'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.6)',border:`2px solid ${playerFocus==='seekfwd'?'#fff':C.primary}`,borderRadius:'50%',color:'white',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',outline:'none',boxShadow:playerFocus==='seekfwd'?`0 0 16px ${C.primary}`:'none',transform:playerFocus==='seekfwd'?'scale(1.1)':'scale(1)',transition:'all 0.2s',gap:'1px'}}>
              <SkipForward size={18} fill="white"/><span style={{fontSize:'9px',fontWeight:'bold'}}>+10s</span>
            </button>
          </div>
          <div style={{position:'absolute',bottom:'26px',left:'34px',right:'34px',pointerEvents:'all'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
              <span style={{fontSize:'14px',fontWeight:'bold',minWidth:'50px'}}>{fmt(currentTime)}</span>
              <div onClick={handleSeek} style={{flex:1,height:'6px',background:'rgba(255,255,255,.25)',borderRadius:'3px',cursor:'pointer',position:'relative'}}>
                <div style={{width:`${duration?(currentTime/duration*100):0}%`,height:'100%',background:`linear-gradient(90deg,${C.primary},${C.secondary})`,borderRadius:'3px',position:'relative'}}>
                  <div style={{position:'absolute',right:'-5px',top:'50%',transform:'translateY(-50%)',width:'13px',height:'13px',background:'white',borderRadius:'50%'}}/>
                </div>
              </div>
              <span style={{fontSize:'14px',fontWeight:'bold',minWidth:'50px'}}>{fmt(duration)}</span>
            </div>
            {playing.video_data.is_serie&&playing.video_data.episodi&&(
              <div style={{display:'flex',gap:'12px',justifyContent:'center'}}>
                {currentEpisode>0&&<button onClick={prevEpisode} style={{padding:'13px 24px',background:playerFocus==='prev'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.88)',border:`2px solid ${playerFocus==='prev'?'#fff':C.primary}`,borderRadius:'12px',color:'white',display:'flex',alignItems:'center',gap:'9px',fontSize:'14px',cursor:'pointer',fontWeight:'bold',outline:'none',boxShadow:playerFocus==='prev'?`0 0 18px ${C.primary}`:'none',transform:playerFocus==='prev'?'scale(1.06)':'scale(1)',transition:'all 0.2s'}}><SkipBack size={16}/> Precedente</button>}
                {currentEpisode<playing.video_data.episodi.length-1&&<button onClick={nextEpisode} style={{padding:'13px 24px',background:playerFocus==='next'?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(0,0,0,.88)',border:`2px solid ${playerFocus==='next'?'#fff':C.primary}`,borderRadius:'12px',color:'white',display:'flex',alignItems:'center',gap:'9px',fontSize:'14px',cursor:'pointer',fontWeight:'bold',outline:'none',boxShadow:playerFocus==='next'?`0 0 18px ${C.primary}`:'none',transform:playerFocus==='next'?'scale(1.06)':'scale(1)',transition:'all 0.2s'}}>Successivo <SkipForward size={16}/></button>}
              </div>
            )}
          </div>
        </div>
        {showNextButton&&playing.video_data.episodi&&currentEpisode<playing.video_data.episodi.length-1&&(
          <div style={{position:'absolute',bottom:'120px',right:'34px'}}>
            <button onClick={nextEpisode} style={{padding:'16px 32px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,border:'none',borderRadius:'12px',color:'white',display:'flex',alignItems:'center',gap:'10px',fontSize:'16px',cursor:'pointer',fontWeight:'bold',animation:'pulse 1.5s infinite',boxShadow:`0 0 26px ${C.primary}`,outline:'none'}}>
              Ep. successivo <SkipForward size={18}/>
            </button>
          </div>
        )}
        <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-panel{display:none!important;}video{outline:none;background:#000;}button{outline:none!important;}`}</style>
        {showEpisodePanel&&playing.video_data.is_serie&&playing.video_data.episodi&&(
          <div style={{position:'absolute',top:0,right:0,bottom:0,width:'320px',background:'rgba(0,0,0,.96)',borderLeft:`3px solid ${C.primary}`,zIndex:50,overflowY:'auto',animation:'slideIn 0.25s ease-out',padding:'16px 0'}}>
            <div style={{padding:'12px 18px',borderBottom:`2px solid rgba(255,255,255,.1)`,marginBottom:'8px'}}><p style={{fontSize:'13px',opacity:.7,margin:0}}>Tasto INFO/●/verde per chiudere</p></div>
            {playing.video_data.episodi.map((ep,i)=>{
              const isCur=i===currentEpisode, isFoc=i===epPanelIdx;
              return (<button key={i} onClick={()=>{playVideo(playing,i);setShowEpisodePanel(false);}}
                style={{width:'100%',padding:'12px 18px',background:isFoc?`linear-gradient(135deg,${C.primary},${C.secondary})`:isCur?'rgba(255,20,147,.2)':'transparent',border:'none',borderLeft:isCur?`4px solid ${C.primary}`:'4px solid transparent',color:'white',textAlign:'left',cursor:'pointer',fontSize:'13px',fontWeight:isCur?'bold':'normal',display:'flex',alignItems:'center',gap:'10px',transition:'all 0.15s',outline:'none'}}>
                <div style={{width:'24px',height:'24px',background:isCur?C.primary:'rgba(255,255,255,.15)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'11px',fontWeight:'bold'}}>{isCur?<Play size={11} fill="white"/>:i+1}</div>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ep.titolo_episodio}</span>
              </button>);
            })}
          </div>
        )}
      </div>
    );
  }

  // ── DETTAGLIO ───────────────────────────────────────────────────────
  if (selectedProject) {
    const isFav=favorites.includes(selectedProject.id_progetto);
    return (
      <div style={{width:'100%',minHeight:'100vh',background:`url(https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/background.png)`,backgroundSize:'cover',backgroundPosition:'center',backgroundAttachment:'fixed',color:'white',position:'fixed',inset:0,zIndex:200,overflowY:'auto'}}>
        <style>{`button{outline:none!important;}`}</style>
        <div style={{position:'relative',zIndex:2,padding:'28px 44px'}}>
          <button data-db="true" onClick={()=>{setSelectedProject(null);setDZone('back');setDIdx(0);setFocusZone('content');}}
            style={{padding:'10px 20px',background:'rgba(0,0,0,.95)',border:`3px solid ${dZone==='back'?'#fff':C.primary}`,borderRadius:'12px',color:'white',display:'flex',alignItems:'center',gap:'10px',fontSize:'15px',cursor:'pointer',marginBottom:'20px',fontWeight:'bold',boxShadow:dZone==='back'?`0 0 20px ${C.primary}`:'none',transform:dZone==='back'?'scale(1.05)':'scale(1)',transition:'all 0.25s'}}>
            <ChevronLeft size={19}/> Indietro
          </button>
          <div style={{display:'flex',gap:'28px',marginBottom:'22px',alignItems:'flex-start'}}>
            <img src={selectedProject.url_poster_verticale} alt={selectedProject.titolo} style={{width:'180px',height:'270px',objectFit:'cover',borderRadius:'13px',boxShadow:`0 14px 46px rgba(255,20,147,.5)`,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <h1 style={{fontSize:'clamp(16px,2.4vw,28px)',marginBottom:'10px',lineHeight:'1.2',textShadow:'0 4px 20px rgba(0,0,0,.9)'}}>{selectedProject.titolo}</h1>
              <div style={{display:'flex',gap:'6px',marginBottom:'12px',flexWrap:'wrap'}}>
                {selectedProject.generi.map((g,i)=>(
                  <button key={i} data-dg={i} onClick={()=>{goToSearch(g);setSelectedProject(null);setDZone('back');setDIdx(0);setFocusZone('content');}}
                    style={{padding:'5px 12px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,borderRadius:'13px',fontSize:'12px',cursor:'pointer',fontWeight:'bold',color:'white',border:`2px solid ${dZone==='genres'&&dIdx===i?'#fff':'transparent'}`,boxShadow:dZone==='genres'&&dIdx===i?`0 0 13px ${C.primary}`:'none',transform:dZone==='genres'&&dIdx===i?'scale(1.08)':'scale(1)',transition:'all 0.22s',outline:'none'}}>{g}</button>
                ))}
              </div>
              <p style={{fontSize:'clamp(11px,1.2vw,14px)',lineHeight:'1.65',marginBottom:'14px',textShadow:'0 2px 8px rgba(0,0,0,.9)'}}>{selectedProject.descrizione}</p>
              <div style={{marginBottom:'12px'}}>
                <h3 style={{fontSize:'14px',marginBottom:'7px',opacity:.9}}>Cast:</h3>
                <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                  {selectedProject.attori.map((a,i)=>(
                    <button key={i} data-da={i} onClick={()=>{goToSearch(a);setSelectedProject(null);setDZone('back');setDIdx(0);setFocusZone('content');}}
                      style={{padding:'5px 11px',background:'rgba(255,20,147,.9)',borderRadius:'7px',fontSize:'12px',cursor:'pointer',fontWeight:'bold',color:'white',border:`2px solid ${dZone==='actors'&&dIdx===i?'#fff':'transparent'}`,boxShadow:dZone==='actors'&&dIdx===i?`0 0 13px ${C.primary}`:'none',transform:dZone==='actors'&&dIdx===i?'scale(1.08)':'scale(1)',transition:'all 0.22s',outline:'none'}}>{a}</button>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',gap:'10px',marginTop:'12px',flexWrap:'wrap'}}>
                <button data-dbt={0} onClick={()=>toggleFavorite(selectedProject.id_progetto)}
                  style={{padding:'10px 20px',background:dZone==='buttons'&&dIdx===0?`linear-gradient(135deg,${C.primary},${C.secondary})`:isFav?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(255,255,255,.15)',border:`2px solid ${dZone==='buttons'&&dIdx===0?'#fff':C.primary}`,borderRadius:'11px',color:'white',display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'bold',boxShadow:dZone==='buttons'&&dIdx===0?`0 0 15px ${C.primary}`:'none',transform:dZone==='buttons'&&dIdx===0?'scale(1.05)':'scale(1)',transition:'all 0.22s',outline:'none'}}>
                  <HeartIcon filled={isFav} size={15}/>{isFav?'Rimuovi':'Aggiungi'}
                </button>
                {!selectedProject.video_data.is_serie&&(
                  <button data-dbt={1} onClick={()=>playVideo(selectedProject)}
                    style={{padding:'10px 26px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,border:dZone==='buttons'&&dIdx===1?'2px solid #fff':'none',borderRadius:'11px',color:'white',display:'flex',alignItems:'center',gap:'9px',fontSize:'14px',cursor:'pointer',fontWeight:'bold',boxShadow:dZone==='buttons'&&dIdx===1?`0 0 15px ${C.primary}`:`0 6px 28px rgba(255,20,147,.6)`,transform:dZone==='buttons'&&dIdx===1?'scale(1.05)':'scale(1)',transition:'all 0.22s',outline:'none'}}>
                    <Play size={17} fill="white"/> GUARDA
                  </button>
                )}
              </div>
            </div>
          </div>
          {selectedProject.video_data.is_serie&&selectedProject.video_data.episodi&&(
            <div>
              <h2 style={{fontSize:'19px',marginBottom:'12px'}}>Episodi</h2>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:'10px'}}>
                {selectedProject.video_data.episodi.map((ep,i)=>{
                  const saved=localStorage.getItem(rKey(selectedProject.id_progetto,i));
                  return (<button key={i} data-de={i} onClick={()=>playVideo(selectedProject,i)}
                    style={{padding:'11px 13px',background:'rgba(26,26,26,.95)',border:`2px solid ${dZone==='episodes'&&dIdx===i?'#fff':C.primary}`,borderRadius:'10px',color:'white',textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',gap:'10px',fontSize:'12px',fontWeight:'bold',transition:'all 0.22s',boxShadow:dZone==='episodes'&&dIdx===i?`0 0 13px ${C.primary}`:'none',transform:dZone==='episodes'&&dIdx===i?'scale(1.04)':'scale(1)',position:'relative',overflow:'hidden',outline:'none'}}>
                    {saved&&parseInt(saved)>5&&<div style={{position:'absolute',bottom:0,left:0,height:'3px',width:'40%',background:C.primary}}/>}
                    <div style={{width:'28px',height:'28px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Play size={13} fill="white"/></div>
                    {ep.titolo_episodio}
                  </button>);
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SCHERMATA PRINCIPALE ────────────────────────────────────────────
  const fp=getFilteredProjects(), opts=subOpts();
  return (
    <div ref={scrollRef} style={{width:'100%',height:'100vh',overflowY:'auto',background:`url(https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/background.png)`,backgroundSize:'cover',backgroundPosition:'center',backgroundAttachment:'fixed',color:'white',opacity:showApp?1:0,transition:'opacity 0.5s ease-in',paddingBottom:'44px'}}>
      <style>{`body,*{-ms-overflow-style:none;scrollbar-width:none;}*::-webkit-scrollbar{display:none;}button,input{outline:none!important;-webkit-tap-highlight-color:transparent;}video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-panel{display:none!important;}video{outline:none;background:#000;}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {showExitMsg&&(<div style={{position:'fixed',bottom:'50px',left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.96)',border:`2px solid ${C.primary}`,borderRadius:'16px',padding:'13px 30px',fontSize:'16px',fontWeight:'bold',color:'white',zIndex:9999,whiteSpace:'nowrap',boxShadow:`0 0 24px rgba(255,20,147,.5)`,animation:'toastIn 0.3s ease-out'}}>Premi ancora <span style={{color:C.primary}}>Indietro</span> per uscire dall'app</div>)}
      <div style={{position:'relative',zIndex:1,paddingTop:'95px'}}>
        <header style={{position:'fixed',top:0,left:0,right:0,zIndex:100,padding:'0 12px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(0,0,0,.96)',backdropFilter:'blur(10px)',borderBottom:`3px solid ${C.primary}`,height:'95px',boxSizing:'border-box',gap:'8px',overflow:'hidden'}}>
          <img src="https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/logo.svg" alt="My Drama Life" style={{height:'44px',width:'auto',flexShrink:0}}/>
          <nav style={{display:'flex',gap:'clamp(1px,.3vw,4px)',alignItems:'center',flex:1,justifyContent:'flex-end',overflow:'hidden',height:'100%'}}>
            {menuItems.map((item,idx)=>{
              const Icon=IconMap[item.id]||Home, isFoc=focusZone==='menu'&&focusedMenu===idx, isAct=currentPage===item.id;
              return (<button key={item.id} tabIndex={-1}
                onClick={()=>{if(item.id==='sync'){setShowSyncModal(true);setSyncFocus(groupName?'btn_send':'main_create');setSyncView('main');setFocusZone('sync');}else{goToPage(item.id);setFocusZone('menu');setFocusedMenu(idx);}}}
                style={{padding:'clamp(4px,.55vw,8px) clamp(4px,.72vw,11px)',background:isAct?`linear-gradient(135deg,${C.primary},${C.secondary})`:'transparent',border:`2px solid ${isFoc?C.primary:'transparent'}`,borderRadius:'9px',color:'white',display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',fontWeight:'bold',transform:isFoc?'scale(1.04)':'scale(1)',transition:'all 0.18s',minWidth:'clamp(40px,5.6vw,72px)',flexShrink:1,boxShadow:isFoc?`0 0 8px 2px ${C.primary}`:'none'}}>
                <Icon size={15}/>
                <span style={{fontSize:'clamp(6px,.72vw,10px)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{item.label}</span>
              </button>);
            })}
          </nav>
        </header>
        <main style={{padding:'13px 28px',minHeight:'100vh'}}>
          {currentPage==='home'&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'38px',marginBottom:'10px'}}><h1 style={{fontSize:'22px',textShadow:'0 4px 20px rgba(0,0,0,.9)',margin:0}}>Ultime uscite</h1></div>}
          {currentPage==='search'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'46px',marginBottom:'12px'}}>
              <div style={{position:'relative',width:'100%',maxWidth:'540px'}}>
                <input ref={searchRef} type="text" placeholder="Cerca titolo, genere, attore, descrizione..."
                  value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onFocus={()=>setFocusZone('search_input')}
                  style={{width:'100%',padding:'10px 36px 10px 12px',fontSize:'14px',background:'rgba(26,26,26,.93)',border:`2px solid ${focusZone==='search_input'?'#fff':C.primary}`,borderRadius:'11px',color:'white',boxSizing:'border-box',boxShadow:focusZone==='search_input'?`0 0 11px ${C.primary}`:'none'}}/>
                {searchQuery&&<button onClick={()=>setSearchQuery('')} style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',fontSize:'17px',lineHeight:1}}>×</button>}
              </div>
            </div>
          )}
          {currentPage==='history'&&history.length>0&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'46px',marginBottom:'12px'}}>
              <button onClick={clearHistory}
                style={{padding:'7px 16px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,border:focusZone==='history_clear'?'2px solid #fff':'2px solid transparent',borderRadius:'9px',color:'white',fontSize:'12px',cursor:'pointer',fontWeight:'bold',display:'flex',alignItems:'center',gap:'6px',boxShadow:focusZone==='history_clear'?`0 0 16px ${C.primary}`:'none',transform:focusZone==='history_clear'?'scale(1.06)':'scale(1)',transition:'all 0.2s'}}>
                <Trash2 size={13}/> Cancella tutta la cronologia
              </button>
            </div>
          )}
          {hasSub&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'48px',marginBottom:'11px',gap:'7px',flexWrap:'wrap'}}>
              {opts.map((opt,idx)=>{
                const isSel=opt==='Tutte'?!selectedCategory:opt===selectedCategory, isFoc=focusZone==='subcategory'&&focusedSubcat===idx;
                return (<button key={opt} tabIndex={-1} onClick={()=>{setSelectedCategory(opt==='Tutte'?null:opt);setFocusedCard(0);}}
                  style={{padding:'6px 14px',background:isSel?C.primary:'rgba(26,26,26,.92)',border:`2px solid ${isFoc?'#fff':isSel?C.primary:'transparent'}`,borderRadius:'9px',color:'white',fontSize:'12px',cursor:'pointer',fontWeight:'bold',boxShadow:isFoc?`0 0 11px ${C.primary}`:'none',transform:isFoc?'scale(1.06)':'scale(1)',transition:'all 0.18s',outline:'none'}}>{opt}</button>);
              })}
            </div>
          )}
          <div ref={gridRef} style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))',gap:'14px'}}>
            {fp.map((project,index)=>{
              const isFoc=focusZone==='content'&&focusedCard===index, isFav=favorites.includes(project.id_progetto);
              const isOnAir=project.generi.some(g=>g.toLowerCase()==='onair'||g.toLowerCase()==='on air');
              const lastEp=history.find(h=>h.projectId===project.id_progetto);
              const savedPos=lastEp?parseInt(localStorage.getItem(rKey(project.id_progetto,lastEp.episodeIndex))||'0'):0;
              const savedDur=parseInt(localStorage.getItem(`${project.id_progetto}_dur`)||'0');
              const progressPct=savedDur>0&&savedPos>0?Math.min(98,(savedPos/savedDur)*100):(savedPos>0?15:0);
              return (
                <div key={project.id_progetto} data-ci={index}
                  style={{background:'rgba(26,26,26,.9)',borderRadius:'10px',overflow:'hidden',cursor:'pointer',transition:'all 0.25s',transform:isFoc?'scale(1.08)':'scale(1)',boxShadow:isFoc?`0 0 20px ${C.primary}`:'none',border:`2px solid ${isFoc?C.primary:'transparent'}`,zIndex:isFoc?10:1,scrollMarginTop:'108px'}}
                  onClick={()=>{if(currentPage==='history'&&lastEp){playVideo(project,lastEp.episodeIndex);}else{setSelectedProject(project);setDZone('back');setDIdx(0);}}}>
                  <div style={{position:'relative'}}>
                    <img src={project.url_poster_verticale} alt={project.titolo} style={{width:'100%',height:'205px',objectFit:'cover',display:'block'}}/>
                    <button onClick={e=>{e.stopPropagation();toggleFavorite(project.id_progetto);}}
                      style={{position:'absolute',top:'6px',left:'6px',background:'rgba(0,0,0,.84)',border:'none',borderRadius:'50%',width:'29px',height:'29px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',zIndex:2,padding:0}}>
                      <HeartIcon filled={isFav} size={14}/>
                    </button>
                    {progressPct>0&&(<div style={{position:'absolute',bottom:0,left:0,right:0,height:'3px',background:'rgba(0,0,0,.3)'}}><div style={{height:'100%',width:`${progressPct}%`,background:C.primary}}/></div>)}
                    {isOnAir&&<div style={{position:'absolute',top:'5px',right:'5px',background:'#FF0000',borderRadius:'4px',padding:'2px 5px',fontSize:'9px',fontWeight:'bold',color:'white'}}>LIVE</div>}
                  </div>
                  <div style={{padding:'7px 9px'}}>
                    <h3 style={{fontSize:'11px',marginBottom:'3px',lineHeight:'1.3'}}>{project.titolo}</h3>
                    {currentPage==='history'&&lastEp&&project.video_data.is_serie&&project.video_data.episodi&&(<div style={{fontSize:'10px',color:C.primary,marginBottom:'2px',fontWeight:'bold'}}>▶ {project.video_data.episodi[lastEp.episodeIndex]?.titolo_episodio||`Ep. ${lastEp.episodeIndex+1}`}</div>)}
                    <div style={{fontSize:'10px',opacity:.7,marginBottom:'2px'}}>{project.macro_categoria} • {project.sub_categoria}</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'4px'}}>
                      <div style={{fontSize:'10px',opacity:.7,flex:1}}>{project.generi.filter(g=>g.toLowerCase()!=='onair'&&g.toLowerCase()!=='on air').slice(0,2).join(', ')}</div>
                      {isOnAir&&<div style={{color:'#FF0000',fontWeight:'bold',fontSize:'9px'}}>ONAIR</div>}
                    </div>
                    {currentPage==='history'&&(<button onClick={e=>{e.stopPropagation();removeFromHistory(project.id_progetto);}}
                      style={{marginTop:'6px',width:'100%',padding:'4px 0',background:focusZone==='history_delete'&&focusedCard===index?`linear-gradient(135deg,${C.primary},${C.secondary})`:'rgba(255,20,147,.12)',border:`2px solid ${focusZone==='history_delete'&&focusedCard===index?'#fff':C.primary}`,borderRadius:'6px',color:focusZone==='history_delete'&&focusedCard===index?'white':C.primary,fontSize:'10px',cursor:'pointer',fontWeight:'bold',outline:'none',boxShadow:focusZone==='history_delete'&&focusedCard===index?`0 0 12px ${C.primary}`:'none',transform:focusZone==='history_delete'&&focusedCard===index?'scale(1.04)':'scale(1)',transition:'all 0.2s'}}>Cancella</button>)}
                  </div>
                </div>
              );
            })}
          </div>
          {fp.length===0&&(<div style={{textAlign:'center',padding:'50px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:'16px'}}><img src="https://wh1373514.ispot.cc/wp/wp-content/MY%20DRAMA%20TV/FILEAPP/No_Found_loop.gif" alt="" style={{width:'170px',borderRadius:'11px'}}/><p style={{fontSize:'17px',fontWeight:'bold',opacity:.85}}>Ci dispiace, non c'è ancora nulla qui</p></div>)}
        </main>
      </div>

      {/* POPUP AGGIORNAMENTO */}
      {updateInfo&&updateStatus!=='done'&&(
        <div style={{position:'fixed',bottom:'60px',left:'50%',transform:'translateX(-50%)',background:'#1a0010',border:`3px solid ${C.primary}`,borderRadius:'16px',padding:'20px 28px',zIndex:9998,color:'white',minWidth:'400px',textAlign:'center',boxShadow:`0 0 30px rgba(255,20,147,.4)`}}>
          <p style={{fontSize:'18px',fontWeight:'bold',marginBottom:'12px'}}>🆕 Aggiornamento disponibile — v{updateInfo.version}</p>
          {updateStatus==='downloading'?(
            <div><div style={{height:'8px',background:'rgba(255,255,255,.15)',borderRadius:'4px',overflow:'hidden',marginBottom:'8px'}}><div style={{height:'100%',width:`${downloadProgress}%`,background:`linear-gradient(90deg,${C.primary},${C.secondary})`,borderRadius:'4px',transition:'width 0.3s'}}/></div><p style={{fontSize:'14px',opacity:.7}}>{downloadProgress<100?`Download ${downloadProgress}%`:'Installazione in corso...'}</p></div>
          ):updateStatus==='done'?(<p style={{fontSize:'16px',color:'#22c55e',fontWeight:'bold'}}>✅ Aggiornamento installato!</p>):(
            <div style={{display:'flex',gap:'12px',justifyContent:'center'}}>
              <button onClick={()=>downloadAndInstall(updateInfo.downloadUrl)} style={{padding:'12px 28px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,border:'none',borderRadius:'10px',color:'white',fontSize:'16px',fontWeight:'bold',cursor:'pointer',outline:'none'}}>Aggiorna ora</button>
              <button onClick={()=>setUpdateInfo(null)} style={{padding:'12px 28px',background:'transparent',border:`2px solid rgba(255,255,255,.3)`,borderRadius:'10px',color:'white',fontSize:'16px',cursor:'pointer',outline:'none'}}>Più tardi</button>
            </div>
          )}
        </div>
      )}

      {/* MODALE SYNC */}
      {showSyncModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.95)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#1a0010',border:`2px solid ${C.primary}`,borderRadius:'20px',padding:'32px',width:'480px',color:'white'}}>
            <h2 style={{fontSize:'22px',marginBottom:'16px',textAlign:'center'}}>🔄 Sincronizzazione</h2>
            {groupName ? (
              <>
                <div style={{background:'rgba(255,20,147,.1)',border:`1px solid ${C.primary}`,borderRadius:'12px',padding:'16px',marginBottom:'16px',textAlign:'center'}}>
                  <p style={{fontSize:'12px',opacity:.7,margin:'0 0 6px'}}>Gruppo attivo</p>
                  <p style={{fontSize:'22px',fontWeight:'bold',color:C.primary,margin:'0 0 4px'}}>{groupName}</p>
                  <p style={{fontSize:'14px',opacity:.8,margin:0}}>PIN: <strong>{groupPin}</strong></p>
                </div>
                <button onClick={()=>{pushToGroup(groupName,getLocalSyncData());setSyncStatus('ok');setTimeout(()=>setSyncStatus('idle'),1500);}}
                  style={{width:'100%',padding:'14px',background:syncStatus==='ok'?'#22c55e':`linear-gradient(135deg,${C.primary},${C.secondary})`,border:`3px solid ${syncFocus==='btn_send'?'#fff':'transparent'}`,borderRadius:'12px',color:'white',fontSize:'16px',fontWeight:'bold',cursor:'pointer',marginBottom:'10px',outline:'none',transform:syncFocus==='btn_send'?'scale(1.03)':'scale(1)',boxShadow:syncFocus==='btn_send'?`0 0 20px ${C.primary}`:'none',transition:'all 0.2s'}}>
                  {syncStatus==='ok'?'✅ Inviato!':'Invia dati ora'}
                </button>
                <button onClick={()=>{disconnectGroup();setGroupName(null);setGroupPin(null);setShowSyncModal(false);setFocusZone('menu');}}
                  style={{width:'100%',padding:'12px',background:'transparent',border:`3px solid ${syncFocus==='btn_disconnect'?'#fff':'rgba(255,100,100,.5)'}`,borderRadius:'12px',color:'white',fontSize:'15px',cursor:'pointer',marginBottom:'10px',outline:'none',transform:syncFocus==='btn_disconnect'?'scale(1.03)':'scale(1)',transition:'all 0.2s'}}>
                  Disconnetti
                </button>
                <button onClick={()=>{setShowSyncModal(false);setFocusZone('menu');}}
                  style={{width:'100%',padding:'12px',background:'transparent',border:`3px solid ${syncFocus==='btn_close'?'#fff':'rgba(255,255,255,.3)'}`,borderRadius:'12px',color:'white',fontSize:'15px',cursor:'pointer',outline:'none',transform:syncFocus==='btn_close'?'scale(1.03)':'scale(1)',transition:'all 0.2s'}}>
                  Chiudi
                </button>
              </>
            ) : syncView==='main' ? (
              <>
                <p style={{fontSize:'14px',opacity:.8,textAlign:'center',marginBottom:'20px'}}>Sincronizza preferiti, cronologia e posizioni video tra tutti i tuoi dispositivi.</p>
                <button onClick={()=>{setSyncView('create');setSyncFocus('input_group');}}
                  style={{width:'100%',padding:'16px',background:`linear-gradient(135deg,${C.primary},${C.secondary})`,border:`3px solid ${syncFocus==='main_create'?'#fff':'transparent'}`,borderRadius:'12px',color:'white',fontSize:'17px',fontWeight:'bold',cursor:'pointer',marginBottom:'12px',outline:'none',transform:syncFocus==='main_create'?'scale(1.03)':'scale(1)',boxShadow:syncFocus==='main_create'?`0 0 20px ${C.primary}`:'none',transition:'all 0.2s'}}>
                  Crea nuovo gruppo
                </button>
                <button onClick={()=>{setSyncView('join');setSyncFocus('input_group');}}
                  style={{width:'100%',padding:'16px',background:'transparent',border:`3px solid ${syncFocus==='main_join'?'#fff':C.primary}`,borderRadius:'12px',color:'white',fontSize:'17px',fontWeight:'bold',cursor:'pointer',outline:'none',transform:syncFocus==='main_join'?'scale(1.03)':'scale(1)',boxShadow:syncFocus==='main_join'?`0 0 20px ${C.primary}`:'none',transition:'all 0.2s'}}>
                  Unisciti a gruppo esistente
                </button>
              </>
            ) : (
              <>
                <p style={{fontSize:'14px',opacity:.8,marginBottom:'8px'}}>Nome gruppo:</p>
                <input type="text" placeholder="es. Valentina, FamigliaRossi..." value={syncGroupInput} onChange={e=>setSyncGroupInput(e.target.value)}
                  onFocus={()=>{setSyncFocus('input_group');}}
                  style={{width:'100%',padding:'12px 16px',fontSize:'16px',background:'rgba(26,26,26,.95)',border:`3px solid ${syncFocus==='input_group'?'#fff':C.primary}`,borderRadius:'12px',color:'white',boxSizing:'border-box' as any,marginBottom:'12px',boxShadow:syncFocus==='input_group'?`0 0 16px ${C.primary}`:'none'}}/>
                {syncView==='join'&&(<>
                  <p style={{fontSize:'14px',opacity:.8,marginBottom:'8px'}}>PIN (6 cifre):</p>
                  <input type="number" placeholder="000000" value={syncPinInput} onChange={e=>setSyncPinInput(e.target.value)} onFocus={()=>setSyncFocus('input_pin')}
                    style={{width:'100%',padding:'12px 16px',fontSize:'22px',background:'rgba(26,26,26,.95)',border:`3px solid ${syncFocus==='input_pin'?'#fff':C.primary}`,borderRadius:'12px',color:'white',boxSizing:'border-box' as any,textAlign:'center',letterSpacing:'4px',marginBottom:'12px',boxShadow:syncFocus==='input_pin'?`0 0 16px ${C.primary}`:'none'}}/>
                </>)}
                {syncError&&<p style={{color:'#ff6b6b',fontSize:'13px',marginBottom:'8px'}}>{syncError}</p>}
                <button onClick={handleSyncAction} disabled={syncStatus==='loading'}
                  style={{width:'100%',padding:'14px',background:syncStatus==='ok'?'#22c55e':syncStatus==='error'?'#ef4444':`linear-gradient(135deg,${C.primary},${C.secondary})`,border:`3px solid ${syncFocus==='btn_action'?'#fff':'transparent'}`,borderRadius:'12px',color:'white',fontSize:'17px',fontWeight:'bold',cursor:'pointer',marginBottom:'10px',outline:'none',transform:syncFocus==='btn_action'?'scale(1.03)':'scale(1)',boxShadow:syncFocus==='btn_action'?`0 0 20px ${C.primary}`:'none',transition:'all 0.2s'}}>
                  {syncStatus==='loading'?'Attendere...':syncStatus==='ok'?'✅ Fatto!':syncStatus==='error'?'❌ Errore':syncView==='create'?'Crea gruppo':'Unisciti'}
                </button>
                <button onClick={()=>{setSyncView('main');setSyncGroupInput('');setSyncPinInput('');setSyncError('');setSyncFocus('main_create');}}
                  style={{width:'100%',padding:'12px',background:'transparent',border:`3px solid ${syncFocus==='btn_back'?'#fff':'rgba(255,255,255,.3)'}`,borderRadius:'12px',color:'white',fontSize:'15px',cursor:'pointer',outline:'none',transform:syncFocus==='btn_back'?'scale(1.03)':'scale(1)',transition:'all 0.2s'}}>
                  ← Indietro
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <footer style={{position:'fixed',bottom:0,left:0,right:0,zIndex:99,padding:'6px 28px',textAlign:'center',borderTop:'2px solid rgba(255,255,255,.1)',background:'rgba(0,0,0,.85)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <p style={{opacity:.6,fontSize:'11px',margin:0}}>My Drama Life TV © 2025 all right reserved - Created by gswebagency.net</p>
        <p style={{opacity:.4,fontSize:'10px',margin:0}}>{groupName?`🔄 ${groupName}`:'Sync non attivo'}</p>
      </footer>
    </div>
  );
};

export default MyDramaApp;
