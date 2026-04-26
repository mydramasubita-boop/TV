import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAyG4RRhGVDjgNK9vSBO6yjnt_9isrheeg",
  authDomain: "mydramatv-63779.firebaseapp.com",
  projectId: "mydramatv-63779",
  storageBucket: "mydramatv-63779.firebasestorage.app",
  messagingSenderId: "527358114947",
  appId: "1:527358114947:web:9bf8c2750b277397812fb6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Struttura dati gruppo ────────────────────────────────────────────
export interface SyncData {
  favorites: string[];
  history: { projectId: string; episodeIndex: number; timestamp: number }[];
  positions: Record<string, number>;
  lastUpdated: number;
}

// ── Crea gruppo (verifica che non esista già) ────────────────────────
export const createGroup = async (
  groupName: string
): Promise<{ success: boolean; pin?: string; error?: string }> => {
  const cleanName = groupName.trim().toLowerCase().replace(/ /g, '_');
  if (cleanName.length < 3) return { success: false, error: 'Nome troppo corto (min. 3 caratteri)' };
  try {
    const ref = doc(db, 'sync_groups', cleanName);
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: false, error: 'Nome già in uso, scegline un altro' };
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    await setDoc(ref, {
      pin,
      created: Date.now(),
      favorites: [],
      history: [],
      positions: {},
      lastUpdated: Date.now(),
    });
    localStorage.setItem('mdl_group_name', cleanName);
    localStorage.setItem('mdl_group_pin', pin);
    return { success: true, pin };
  } catch (e) {
    return { success: false, error: 'Errore di connessione' };
  }
};

// ── Unisciti a gruppo esistente ──────────────────────────────────────
export const joinGroup = async (
  groupName: string,
  pin: string
): Promise<{ success: boolean; data?: SyncData; error?: string }> => {
  const cleanName = groupName.trim().toLowerCase().replace(/ /g, '_');
  try {
    const ref = doc(db, 'sync_groups', cleanName);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, error: 'Gruppo non trovato' };
    if (snap.data()?.pin !== pin) return { success: false, error: 'PIN errato' };
    localStorage.setItem('mdl_group_name', cleanName);
    localStorage.setItem('mdl_group_pin', pin);
    return { success: true, data: snap.data() as SyncData };
  } catch (e) {
    return { success: false, error: 'Errore di connessione' };
  }
};

// ── Salva dati su Firestore (merge con esistenti) ────────────────────
export const pushToGroup = async (groupName: string, localData: SyncData): Promise<void> => {
  try {
    const ref = doc(db, 'sync_groups', groupName);
    const snap = await getDoc(ref);
    const remote = snap.exists() ? snap.data() as SyncData : { favorites: [], history: [], positions: {} };

    // Merge preferiti
    const mergedFav = [...new Set([...localData.favorites, ...(remote.favorites || [])])];

    // Merge cronologia: tieni il più recente per projectId
    const allHist = [...localData.history, ...(remote.history || [])];
    const histMap = new Map<string, { projectId: string; episodeIndex: number; timestamp: number }>();
    allHist.forEach(h => {
      const existing = histMap.get(h.projectId);
      if (!existing || h.timestamp > existing.timestamp) histMap.set(h.projectId, h);
    });
    const mergedHist = Array.from(histMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);

    // Merge posizioni: tieni il valore più alto
    const mergedPos: Record<string, number> = { ...(remote.positions || {}) };
    Object.entries(localData.positions).forEach(([k, v]) => {
      if (!mergedPos[k] || v > mergedPos[k]) mergedPos[k] = v;
    });

    await setDoc(ref, {
      favorites: mergedFav,
      history: mergedHist,
      positions: mergedPos,
      lastUpdated: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.warn('pushToGroup error:', e);
  }
};

// ── Listener realtime ────────────────────────────────────────────────
export const subscribeToGroup = (
  groupName: string,
  callback: (data: SyncData) => void
): Unsubscribe => {
  return onSnapshot(doc(db, 'sync_groups', groupName), (snap) => {
    if (snap.exists()) callback(snap.data() as SyncData);
  }, (err) => console.warn('Firestore listener error:', err));
};

// ── Helpers localStorage gruppo ──────────────────────────────────────
export const getSavedGroupName = (): string | null => localStorage.getItem('mdl_group_name');
export const getSavedGroupPin = (): string | null => localStorage.getItem('mdl_group_pin');
export const disconnectGroup = (): void => {
  localStorage.removeItem('mdl_group_name');
  localStorage.removeItem('mdl_group_pin');
};

// ── Mantieni compatibilità con vecchio sistema ───────────────────────
export const getUserCode = (): string => {
  let code = localStorage.getItem('mdl_user_code');
  if (!code) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = 'MDL-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    localStorage.setItem('mdl_user_code', code);
  }
  return code;
};
