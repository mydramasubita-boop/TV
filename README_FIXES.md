# My Drama Life TV — Patch Notes & Build Guide

## ✅ Fix applicate in questa versione

### FIX 1 — Preloader: niente flash bianco/nero
- Il video parte con `opacity: 0` e diventa visibile solo all'evento `onCanPlay`
- I controlli nativi del browser sul tag `<video>` sono nascosti via CSS globale in `index.html`
- Lo sfondo di `html`, `body` e `#root` è sempre `#000` così non compare mai la schermata bianca

### FIX 2 — Navigazione telecomando (CRITICO)
- **Enter sul menù**: gestito in `keyDown` (non solo `keyUp`) → i telecomandi reagiscono immediatamente
- **Tasto Back**: riconosciuto su tutti i remote: `Escape`, `Backspace`, keyCode `10009` (Samsung Tizen), `461` (LG WebOS), `8`
- **Doppia pressione per uscire**: prima pressione → toast "Premi di nuovo per uscire dall'app" (2,5s),
  seconda pressione → chiama `Android.exitApp()` + `window.history.back()`
- Back dal player → torna alla schermata precedente
- Back dal detail → torna alla lista
- Back da lista non-home → torna a Home
- Back da Home → doppia pressione richiesta

### FIX 3 — Card e dettagli ridimensionati per TV
- Griglia card: colonne `clamp(130px, 12vw, 185px)` → ~6-7 card visibili su 43"
- Immagini card: `aspect-ratio: 2/3` (proporzionato, no altezza fissa)
- Pagina dettaglio: poster 200×300px (era 350×525px), titolo scalato con `clamp()`
- Tutti i font size usano `clamp()` o `vw` per adattarsi alle dimensioni della TV
- Bottoni più compatti nelle pagine dettaglio ed episodi

### FIX 4 — Scroll corretto sotto l'header fisso
- Sostituito `scrollIntoView()` con scroll manuale che controlla l'header (95px) prima di scorrere
- Quando il focus torna al **menù** → `window.scrollTo({ top: 0 })` automatico
  così le card della prima riga sono sempre completamente visibili

### FIX 5 — Sezioni vuote con GIF corretta
- GIF `No_Found_loop.gif` mostrata in: Preferiti vuoti, Cronologia vuota, categorie senza risultati, ricerca senza risultati
- Testo aggiornato: "Ci dispiace, non c'è ancora nulla qui"

### FIX 6 — Icona app per TV/Firestick + Banner Fire TV (CRITICO)
- `manifest.json` aggiornato con `icona_app_tv.png` come icona principale (512×512)
- `index.html` usa `icona_app_tv.png` come favicon e apple-touch-icon
- `capacitor.config.json` aggiunto con `appId: "com.mydramalife.tv"` per il build APK
- **`public/banner_firetv.png` (320×180px) — FONDAMENTALE per Fire TV**:
  senza questo file l'app non appare nella riga principale del launcher Fire TV,
  ma viene nascosta nelle impostazioni. Con questo banner appare normalmente.

#### Come usare banner_firetv.png nel wrapper APK
In Android Studio, nel file `res/drawable/` aggiungi `banner_firetv.png`,
poi in `AndroidManifest.xml`:
```xml
<application
    android:banner="@drawable/banner_firetv"
    ... >
    <activity ...>
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
        </intent-filter>
    </activity>
</application>
```
Se usi Web2APK o tool simili, cerca il campo "TV Banner" e carica `banner_firetv.png`.

---

## 🔨 Come fare il build

### 1. Installa le dipendenze
```bash
npm install
```

### 2. Build web
```bash
npm run build
```
Questo crea la cartella `dist/`

### 3. Converti in APK con Capacitor (opzione A)
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync
npx cap open android
# poi in Android Studio: Build > Generate Signed APK
```

### 4. Converti con WebView wrapper (opzione B — più semplice)
Usa [WebView App Creator](https://www.pwabuilder.com/) o un tool come **Gonative**, **AppMySite** o **WebIntoApp**:
- URL: punta alla tua web app hostata
- Imposta orientation: landscape
- Usa `icona_app_tv.png` come icona (512×512)
- Abilita: "Handle back button natively" → **NO** (lo gestiamo noi)

### 5. Per Firestick / Android TV
Nel `AndroidManifest.xml` del wrapper assicurati di avere:
```xml
<uses-feature android:name="android.software.leanback" android:required="false" />
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
<category android:name="android.intent.category.LEANBACK_LAUNCHER" />
```
Questo fa apparire l'app nel launcher di Fire TV e Android TV.

---

## 📁 File modificati
- `src/App.tsx` — tutti i fix principali
- `index.html` — sfondo nero, manifest, icona TV, CSS video controls
- `public/manifest.json` — icona TV aggiornata
- `capacitor.config.json` — **NUOVO** — config per build APK
