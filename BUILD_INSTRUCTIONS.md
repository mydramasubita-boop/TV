# My Drama Life TV — Istruzioni Build APK

## PROCEDURA COMPLETA (copia questi comandi uno alla volta)

### 1. Apri CMD e vai nella cartella del progetto
```
cd C:\Users\valen\Documents\DRAMA\APP\FileApp\mydramalife-fixed-v2
```

### 2. Installa dipendenze
```
npm install
```

### 3. Build web
```
npm run build
```

### 4. Installa Capacitor
```
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### 5. Inizializza Capacitor
```
npx cap init MyDramaLife com.mydramalife.tv --web-dir=dist
```

### 6. Aggiungi Android
```
npx cap add android
```

### ⚠️ PASSO NUOVO — OBBLIGATORIO per il tasto Back ⚠️
```
npm run cap:setup
```
> Questo copia il file MainActivity.kt corretto che fa funzionare
> il tasto Back del telecomando. Senza questo passo il Back esce dall'app!

### 7. Copia i file web nel progetto Android
```
npx cap copy android
```

### 8. Apri Android Studio
```
npx cap open android
```

### 9. In Android Studio
- Aspetta il caricamento Gradle
- Vai su **Build → Generate App Bundles or APKs → Generate APKs**
- L'APK si trova in: `android/app/build/outputs/apk/debug/`

---

## Struttura file importanti
- `src/App.tsx` — codice principale dell'app
- `android-patches/MainActivity.kt` — fix tasto Back (non modificare)
- `scripts/cap-setup.mjs` — script che applica il fix automaticamente
- `public/icona_app_tv.png` — icona app per TV
- `public/banner_firetv.png` — banner 320x180 per Fire TV launcher
