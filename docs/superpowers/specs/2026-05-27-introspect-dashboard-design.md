# Introspect — Dashboard di audit e osservabilità di Claude

> **Cos'è questo file.** Spec di design e contratto di implementazione per `introspect`, una dashboard locale read-only per ispezionare, analizzare e fare audit di come Claude (Claude Code) è configurato e di come opera in tempo reale.
> **Audience:** chi implementa (engineer senior) e chi revisiona il design.
> **Owner:** marcello.barile.
> **File companion:** questo è l'unico documento di design al momento; il piano di implementazione (con i task per slice) verrà generato a parte dalla skill `writing-plans` e farà riferimento a questa spec come contratto.

## Legenda stato

Tutto in questo documento è **Planned (non delivered)** salvo diversa indicazione esplicita. Quando una funzionalità verrà completata e disponibile, sarà marcata `Delivered`.

---

## 1. Obiettivo e scope

Una dashboard locale che permette, a livello utente, di:

1. **Ispezionare la configurazione** di Claude: system prompt / istruzioni globali, skills, agents (subagenti), slash commands, memorie, hooks, permessi, variabili d'ambiente, plugin.
2. **Esplorare i progetti su filesystem** in cui si è interagito con Claude, e per ognuno accedere a memorie, file di spec e prompt personalizzati, oltre allo storico delle sessioni.
3. **Accedere al debug**: output di debug nativo (`debug/`) e decisioni/debug custom (`debug-decisions/`).
4. **Esportare** la configurazione locale custom per ricreare un Claude identico su un'altra macchina (bundle dati + script di restore).
5. **Osservare il live**: un grafo che si aggiorna in tempo reale e riflette cosa sta facendo la sessione attiva (subagenti in esecuzione, ragionamenti, file letti/scritti, tool e skill in uso).

### Fuori scope (v1)

- **Scrittura/editing** di qualsiasi configurazione di Claude. La dashboard è **read-only**; l'unico output scritto è il bundle di export, in una destinazione scelta dall'utente.
- Acquisizione live tramite hook di Claude Code (mutazione di `settings.json`). Considerata come possibile slice futura; v1 usa esclusivamente il file-tail.
- Multi-utente, autenticazione, deploy remoto. È uno strumento locale per un singolo utente sulla propria macchina.

---

## 2. Vincoli e principi

- **Read-only sul filesystem di Claude.** Nessuna scrittura nelle config root. Nessuna mutazione di `settings.json`, hook, memorie, ecc.
- **Agnostico ai symlink.** Il layout di config dell'utente può usare symlink arbitrari (custom). La risoluzione dei path non deve assumere file reali.
- **Convention-aware, non hardcoded.** Le convenzioni custom dell'utente (dove vivono spec, memorie, prompt personalizzati — es. spec sotto `docs/superpowers/`, memorie sotto `docs/memory/` + symlink) variano per utente e per progetto. Non vanno hardcodate: sono catturate in un **profilo di discovery** (vedi §5.6) costruito una tantum post-installazione, editabile a mano e ri-eseguibile.
- **Locale e single-user.** Server in ascolto su `localhost`, nessuna esposizione di rete.
- **Degradazione per-sezione.** L'assenza o corruzione di una sorgente non deve far crashare l'intera dashboard: la singola sezione mostra uno stato di errore/vuoto.
- **Isolamento dei moduli.** Ogni unità (resolver, parser, watcher, export, ogni pagina) ha uno scopo unico, un'interfaccia definita, ed è testabile in isolamento.
- **YAGNI.** Nessuna astrazione o feature oltre lo scope di questa spec.

---

## 3. Stack tecnico

- **Runtime:** Node + TypeScript.
- **Server:** Fastify per le API REST di lettura statica; libreria `ws` per il canale WebSocket del live.
- **File watching:** `chokidar`.
- **Web:** Vite + React + TypeScript.
- **Grafo:** `d3-force` per il layout (disposizione organica dei nodi); rendering SVG custom per lo stile visivo validato.
- **Dati client:** fetch dei dati statici on-demand (con caching leggero lato client); hook React dedicato per lo stream WebSocket del live.
- **Persistenza:** nessun database. Le sorgenti sono i file di Claude, letti on-demand con cache in-memory lato server invalidata su evento `fs.watch`. Unico stato proprio scritto da `introspect`: il `profile.json` di discovery (§5.6).
- **Dipendenza opzionale:** il CLI `claude` (per `introspect init --with-claude`). Assente → la discovery resta euristica/offline.

Nome del progetto: **`introspect`**. Comando di avvio: `introspect` (avvia il server e apre il browser sull'URL locale).

---

## 4. Sorgenti dati (lato Claude)

Tutte le sorgenti sono individuate dal modulo `sources/` a partire dalle **config root** rilevate (vedi §5.1). Path tipici per ciascuna config root:

| Sorgente | Path tipico | Note |
|---|---|---|
| System prompt / istruzioni | `CLAUDE.md` | globale + eventuali per-progetto |
| Skills | `plugins/**/skills/*`, skill installate | da catalogo plugin |
| Agents (subagenti) | `agents/*.md` | definizioni con frontmatter |
| Commands (slash) | `commands/*.md` | |
| Memorie | dir di memoria del progetto e globali | layout variabile |
| Hooks / permessi / env | `settings.json`, `settings.local.json` | i segreti vanno redatti di default |
| Plugin | `plugins/installed_plugins.json`, `plugins/marketplaces/` | |
| Progetti | `projects/<slug>/` | uno per cwd; slug = path con `/`→`-` |
| Sessioni / history | `projects/<slug>/*.jsonl`, `history.jsonl` | transcript per sessione |
| Debug nativo | `debug/` | |
| Debug / decisioni custom | `debug-decisions/`, `commands/decision*.md` | |

> I path sono **sondati**, non assunti: ciò che manca viene segnalato come assente, non causa errore globale.

### 4.1 Schema dei transcript (`projects/<slug>/*.jsonl`)

Un transcript è una sequenza di righe JSON (JSON Lines). Tipi di riga osservati: `assistant`, `user`, `attachment`, `system`, `file-history-snapshot`, `last-prompt`, `permission-mode`, `ai-title`, `queue-operation`.

Campi rilevanti per la ricostruzione:

- Riga `assistant`: `message.content[]` con blocchi di tipo `thinking` | `text` | `tool_use`; più `message.model`, `message.usage` (token), `timestamp`, `cwd`, `gitBranch`, `sessionId`, `uuid`, `parentUuid`, `isSidechain`, `requestId`.
- Blocco `tool_use`: `name` + `input`. Lo spawn di un subagente è un `tool_use` con `name` ∈ {`Task`, `Agent`}, il cui `input` contiene `subagent_type` e `description`.
- Riga `user`: contiene i `tool_result` corrispondenti (collegati per `tool_use_id`).
- **Ricostruzione dell'albero esecuzione:** `parentUuid` collega le righe in catena; `isSidechain: true` marca le righe che appartengono all'esecuzione di un subagente. La combinazione permette di costruire l'albero `main thread → subagente → tool → file`.

---

## 5. Architettura del server

Monorepo con due pacchetti: `server/` e `web/`. Moduli del server:

### 5.1 `sources/` — resolver dei path (agnostico ai symlink)

Responsabilità: essere l'**unico** punto che sa dove stanno le cose.

- **Discovery delle config root:**
  - usa `CLAUDE_CONFIG_DIR` se presente;
  - altrimenti il default (`~/.claude`) più eventuali root extra **configurabili** (flag CLI / variabile d'ambiente di `introspect`).
- **Risoluzione via `realpath`:** ogni path candidato viene risolto prima della lettura, così è indifferente se `agents/`, `hooks/`, `settings.json`, ecc. sono file reali o symlink (custom o no).
- **Dedup per inode:** se due config root risolvono allo stesso target reale, la sorgente è contata una sola volta.
- **Nessun layout assunto rigido:** i path noti vengono sondati; gli assenti sono riportati come `missing`, non sono errori fatali.

Interfaccia: data una config root (o l'insieme rilevato), restituisce i percorsi reali e lo stato (`present` | `missing`) di ciascuna sorgente di §4. I path delle sorgenti a convenzione variabile (spec, memorie, prompt custom per-progetto) non sono hardcodati ma letti dal **profilo di discovery** (§5.6).

### 5.2 `parser/` — transcript → eventi normalizzati

Responsabilità: trasformare uno o più `.jsonl` in un modello di dominio normalizzato, **condiviso** tra letture statiche (replay di sessioni passate) e live.

- Modello `SessionEvent` (unione discriminata): `thinking` | `text` | `tool_use` | `tool_result` | `subagent_spawn` | `file_touch` | `skill_use` | `meta`.
- Deriva da `tool_use`: `file_touch` (per Read/Write/Edit/Grep/Glob sui path nell'input), `skill_use` (per il tool Skill), `subagent_spawn` (per Task/Agent).
- Costruisce l'**albero di esecuzione** usando `parentUuid` + `isSidechain`.
- **Robustezza:** una riga JSON malformata viene saltata e conteggiata in un contatore di errori del parse (esposto, non silenzioso).
- Parsing **incrementale**: data una posizione (offset) in un file, processa solo le righe nuove — riusato dal `watcher` per il tail.

### 5.3 `watcher/` — tail live → stream eventi

- `chokidar` osserva `projects/**/*.jsonl` su tutte le config root.
- **Sessione attiva** = file con `mtime` più recente (idle se nessuna attività recente entro una soglia).
- Mantiene un offset per file; ad ogni append, legge le righe nuove e le passa al `parser` (modalità incrementale).
- Emette `SessionEvent` verso il bus interno → broadcast su WebSocket.
- Cambio di sessione attiva (un altro file diventa il più recente): emette un evento di switch così la UI può reinizializzare il grafo.

### 5.4 `api/` — REST + WebSocket

- REST (sola lettura):
  - `GET /config` — system prompt, hooks, permessi, env (segreti redatti).
  - `GET /skills`, `GET /agents`, `GET /commands`, `GET /memories`, `GET /plugins`.
  - `GET /projects` — elenco con metadati (path, numero sessioni, ultima attività).
  - `GET /projects/:id/sessions` — sessioni del progetto.
  - `GET /sessions/:id` — transcript normalizzato (per replay statico col grafo).
  - `GET /debug` — debug nativo + decisioni custom.
- WebSocket:
  - `/live` — stream di `SessionEvent` della sessione attiva + evento di switch sessione + stato `idle`.
- Cache in-memory invalidata da `fs.watch` sulle sorgenti rilevanti.

### 5.5 `export/` — bundle + script di restore

Genera **entrambi**:

- **Bundle** `introspect-export-<timestamp>.tar.gz` contenente i file di config selezionati, più `manifest.json` (per ogni file: path sorgente reale, path relativo nel bundle, checksum, config root di origine).
- **`restore.sh`** idempotente: ricrea la struttura sulla macchina target a partire dal bundle, rispettando i path del manifest, senza sovrascrivere ciecamente (idempotente, verificabile prima dell'applicazione).
- **Selezione granulare:** l'utente sceglie quali sorgenti includere (es. solo skills + agents + CLAUDE.md, oppure tutto).
- **Sicurezza:** i segreti (token in `settings.json` / env) sono **redatti di default**; includerli richiede un opt-in esplicito con avviso.

### 5.6 `discovery/` — profilo delle convenzioni custom

Responsabilità: catturare **dove** l'utente tiene gli artefatti a convenzione variabile (spec, memorie, prompt personalizzati, dir di decisioni), così che `sources/` non debba hardcodare nulla.

- **Output:** un file di profilo (`profile.json`) sotto la config dir di `introspect` stessa (es. `~/.config/introspect/`), **editabile a mano** e ri-generabile. Contiene, per categoria, i pattern/percorsi rilevati e la loro provenienza (rilevato euristicamente | dichiarato in istruzioni | aggiunto a mano).
- **Quando gira:** comando one-shot **`introspect init`** post-installazione (non al bootstrap di ogni avvio, per non pagare il costo ogni volta). Ri-eseguibile su richiesta quando le convenzioni cambiano.
- **Strategia a due livelli:**
  1. **Euristica (default, sempre disponibile, offline):** scansiona i progetti noti per directory ricorrenti (`docs/**/specs`, `docs/memory`, `**/*.spec.md`, dir di prompt) e legge i file di istruzioni dell'utente (`CLAUDE.md`, e companion tipo `memory-org.md`) per estrarre convenzioni dichiarate esplicitamente.
  2. **Potenziamento via Claude locale (opzionale):** se il CLI `claude` è installato, `introspect init --with-claude` lo invoca in modalità headless (read-only, print mode) per fare introspezione: legge le istruzioni e un campione di progetti e **riporta** le convenzioni inferite (es. "le spec stanno sotto `docs/superpowers/`"). Claude qui **solo legge e riporta**; l'unico file scritto è il `profile.json` di `introspect`.
- **Read-only verso Claude:** né la discovery euristica né quella via Claude scrivono nelle config root o nei progetti.
- **Fallback:** senza profilo, `sources/` usa i path noti di default; le sorgenti a convenzione custom risultano semplicemente `missing` finché `introspect init` non popola il profilo.

---

## 6. Architettura web

Una pagina per voce di navigazione; ogni pagina è un'unità isolata che consuma un endpoint:

- **Realtime** — Live graph (consuma `/live` via WebSocket).
- **Configurazione** — System prompt, Hooks · Permessi · Env (`/config`).
- **Skills**, **Agents**, **Commands**, **Memories**, **Plugins** (rispettivi endpoint).
- **Projects** — explorer dei progetti (`/projects`), drill-down a sessioni.
- **Sessions / History** — lista sessioni + **replay statico** di una sessione passata col grafo (`/sessions/:id`).
- **Debug** (`/debug`).
- **Export** — selezione sorgenti + download bundle/script.

### 6.1 Componente grafo (condiviso live + replay)

- Layout con `d3-force`; nodi: `main` | `subagente` | `tool` | `file`; edge curvi (bézier) con flusso animato sui rami attivi.
- Stile visivo: tema "Observatory" (griglia hairline, monospace, accento ciano) con glow sui nodi attivi ed edge organici — **direzione già validata** nei mockup di brainstorming.
- Sidebar di navigazione e rail destra con sfondo **glass**; il canvas centrale del grafo è l'unica superficie piena.
- Rail destra: stream eventi cronologico + ultimo blocco `thinking` ("reasoning corrente").

### 6.2 Dati e stato

- Letture statiche: fetch on-demand per pagina con caching leggero.
- Live: un hook React si sottoscrive al WebSocket, mantiene lo store degli eventi della sessione attiva, alimenta il grafo e la rail; gestisce switch sessione e stato `idle`.

---

## 7. Flusso dati

- **Statico:** pagina → REST → `sources` + `parser` → JSON → render. Cache invalidata da `fs.watch`.
- **Live:** `watcher` tail → `parser` (incrementale) → `SessionEvent` → WebSocket → store React → il grafo aggiorna nodi/edge; la rail aggiorna stream + reasoning.

---

## 8. Piano di consegna (slice)

Ogni slice è indipendentemente revisionabile e rollback-friendly.

- **Slice 0 — Scaffold.** Monorepo `server/` + `web/`; modulo `sources/` (discovery config root + realpath + dedup); comando di avvio `introspect`; shell UI (navigazione glass + tema visivo).
- **Slice 1 — Config statica.** `parser/` con test su transcript reali anonimizzati; pagine read-only: System prompt, Skills, Agents, Commands, Memories, Plugins, Hooks · Permessi · Env.
- **Slice 1.5 — Discovery.** Modulo `discovery/` + comando `introspect init`: euristica offline (scan progetti + lettura istruzioni) e potenziamento opzionale `--with-claude`; produce `profile.json` che `sources/` consuma per le sorgenti a convenzione custom.
- **Slice 2 — Workspace.** Projects explorer + Sessions/History; replay statico di una sessione passata col componente grafo.
- **Slice 3 — Live.** `watcher` (tail + sessione attiva) + WebSocket + grafo real-time + rail reasoning + stato idle/switch.
- **Slice 4 — Export.** Selezione sorgenti + bundle `.tar.gz` + `manifest.json` + `restore.sh`, con redazione segreti.

---

## 9. Gestione errori e casi limite

- Config root assente o symlink rotto → la sorgente è `missing`, la sezione mostra stato vuoto; nessun crash.
- Riga `.jsonl` malformata → saltata, conteggiata in un contatore di errori esposto in UI.
- Nessuna sessione attiva → la pagina Live mostra stato `idle`.
- Cambio di sessione attiva durante l'osservazione → evento di switch, il grafo si reinizializza.
- File transcript molto grandi → parsing incrementale per offset; per il replay statico, lettura completa una tantum.
- Segreti negli export → redatti di default, opt-in esplicito per includerli.

---

## 10. Testing

- **TDD** sul `parser/` (cuore della logica): fixture di transcript reali **anonimizzati**, inclusi casi con subagenti (`isSidechain` + `Task`/`Agent`), righe malformate, sessioni senza tool.
- **Test** su `export/`: correttezza di `manifest.json` (checksum), idempotenza di `restore.sh`, redazione segreti.
- **Test** su `sources/`: discovery delle config root, risoluzione symlink, dedup per inode, sorgenti `missing`, consumo del `profile.json`.
- **Test** su `discovery/`: euristica su fixture di alberi di progetto (rileva `docs/superpowers/specs`, `docs/memory`, ecc.), estrazione di convenzioni dichiarate da file di istruzioni, merge con override manuali del profilo. Il ramo `--with-claude` è isolato dietro un'interfaccia e mockato nei test (no chiamate reali al CLI).
- **UI:** smoke test del componente grafo (rendering nodi/edge da un set di `SessionEvent`); il resto delle pagine, prevalentemente meccanico, è test-after.
