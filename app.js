// Sentinel Aula: pagina statica. Chiama Nano Banana Pro su Vertex AI con la chiave API dell'alunno
// (chiave collegata a un account di servizio con il ruolo «Utente Vertex AI»). Niente server, niente salvataggi:
// chiave e immagini restano solo nella memoria della pagina finché non si preme «Esci» o si chiude la finestra.
(() => {
  "use strict";
  const MODELLO = "gemini-3-pro-image";
  const FORMATI = { "1:1": "ONE_BY_ONE", "2:3": "TWO_BY_THREE", "3:2": "THREE_BY_TWO", "3:4": "THREE_BY_FOUR",
    "4:3": "FOUR_BY_THREE", "4:5": "FOUR_BY_FIVE", "5:4": "FIVE_BY_FOUR", "9:16": "NINE_BY_SIXTEEN",
    "16:9": "SIXTEEN_BY_NINE", "21:9": "TWENTY_ONE_BY_NINE" };
  const RISOLUZIONI = { "1K": "ONE_K", "2K": "TWO_K", "4K": "FOUR_K" };
  const $ = (id) => document.getElementById(id);

  let chiave = "", progetto = "", reference = [], immagini = [], inCorso = null;

  const messaggio = (testo, tipo = "info") => { $("messaggio").textContent = testo; $("messaggio").dataset.state = tipo; };

  function aggiorna() {
    const attiva = Boolean(chiave);
    $("stato").textContent = attiva ? "Inserita" : "Non inserita";
    $("esci").disabled = !attiva && !immagini.length;
    for (const id of ["progetto", "chiave", "inserisci"]) $(id).disabled = attiva;
    for (const id of ["prompt", "formato", "risoluzione", "reference"]) $(id).disabled = !attiva || Boolean(inCorso);
    $("genera").disabled = !attiva || Boolean(inCorso) || !$("prompt").value.trim();
    $("genera").textContent = inCorso ? "Sto generando…" : "Genera";
    $("costo").textContent = $("risoluzione").value === "4K" ? "circa 0,21 € a immagine" : "circa 0,12 € a immagine";
    $("nota").textContent = attiva ? "Costa dal tuo credito, anche se l'immagine non ti piace." : "Prima inserisci la chiave.";
  }

  function indirizzo() {
    return "https://aiplatform.googleapis.com/v1/projects/" + encodeURIComponent(progetto) +
      "/locations/global/publishers/google/models/" + MODELLO + ":generateContent";
  }

  function spiegaErrore(codice, testo) {
    const t = (testo || "").toLowerCase();
    if ((codice === 400 || codice === 401) && t.includes("api key")) return "Chiave non valida: ricopiala da Google Cloud (Credenziali).";
    if (codice === 403 && (t.includes("has not been used") || t.includes("disabled"))) return "Nel tuo progetto l'API Vertex AI non è attiva: guida, passo 3.";
    if (codice === 403 && t.includes("billing")) return "Il progetto non ha la fatturazione o la prova gratuita attiva: guida, passo 1.";
    if (codice === 403) return "Permesso negato. Se hai appena creato la chiave aspetta un minuto e riprova; se no controlla l'ID del progetto e il ruolo «Utente Vertex AI» (guida, passo 4).";
    if (codice === 404) return "Progetto non trovato: controlla l'ID del progetto.";
    if (codice === 429) return "Troppe richieste in poco tempo: aspetta un minuto e riprova.";
    if (codice >= 500) return "Google è sovraccarico in questo momento: riprova tra poco.";
    return "Errore " + codice + ": " + (testo || "risposta inattesa").slice(0, 200);
  }

  async function chiama(corpo) {
    const risposta = await fetch(indirizzo(), {
      method: "POST", signal: inCorso?.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": chiave },
      body: JSON.stringify(corpo),
    });
    const testo = await risposta.text();
    if (!risposta.ok) {
      let dettaglio = testo;
      try { dettaglio = JSON.parse(testo).error.message; } catch {}
      throw new Error(spiegaErrore(risposta.status, dettaglio));
    }
    return JSON.parse(testo);
  }

  // «Inserisci»: controllo gratuito (conta i token di una parola) per sapere subito se chiave e progetto vanno.
  async function inserisci() {
    const p = $("progetto").value.trim(), k = $("chiave").value.trim();
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(p)) return messaggio("L'ID del progetto è sbagliato: è tutto minuscolo, con trattini e numeri (guida, passo 2).", "error");
    if (k.length < 30) return messaggio("La chiave sembra incompleta: ricopiala intera.", "error");
    progetto = p; chiave = k;
    $("inserisci").disabled = true; messaggio("Controllo la chiave…");
    try {
      const url = indirizzo().replace(":generateContent", ":countTokens");
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": chiave },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "prova" }] }] }) });
      if (!r.ok) {
        let d = ""; try { d = (await r.json()).error.message; } catch {}
        // un 400 che non parla della chiave vuol dire solo che il controllo non è supportato: la chiave va bene
        if (!(r.status === 400 && !d.toLowerCase().includes("api key"))) throw new Error(spiegaErrore(r.status, d));
      }
      $("chiave").value = "";
      messaggio("Chiave inserita. Puoi generare.", "ok");
    } catch (e) {
      chiave = ""; progetto = "";
      messaggio(e.message, "error");
    }
    aggiorna();
  }

  function leggiFile(file) {
    return new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok({ tipo: file.type, dati: r.result.split(",")[1], url: r.result });
      r.onerror = ko; r.readAsDataURL(file);
    });
  }

  function mostraReference() {
    $("refs").replaceChildren(...reference.map((ref, i) => {
      const s = document.createElement("span"), img = new Image(), b = document.createElement("button");
      img.src = ref.url; img.alt = "Riferimento " + (i + 1);
      b.type = "button"; b.textContent = "×"; b.title = "Togli";
      b.onclick = () => { reference.splice(i, 1); mostraReference(); };
      s.append(img, b); return s;
    }));
  }

  function mostra(i) {
    const im = immagini[i];
    $("risultato").src = im.url; $("risultato").hidden = false; $("vuoto").hidden = true;
    $("salva").href = im.url; $("salva").download = im.nome; $("salva").hidden = false;
    [...$("galleria").children].forEach((el, j) => el.classList.toggle("on", j === i));
  }

  function aggiungiImmagine(base64, tipo) {
    const byte = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([byte], { type: tipo }));
    const ora = new Date().toTimeString().slice(0, 8).replaceAll(":", "");
    immagini.push({ url, nome: "sentinel-" + ora + (tipo.includes("jpeg") ? ".jpg" : ".png") });
    const mini = new Image(); mini.src = url; mini.alt = "Immagine " + immagini.length;
    const n = immagini.length - 1; mini.onclick = () => mostra(n);
    $("galleria").append(mini); mostra(n);
  }

  async function genera(evento) {
    evento.preventDefault();
    if (!chiave || inCorso) return;
    const immagine = { imageSize: "IMAGE_SIZE_" + RISOLUZIONI[$("risoluzione").value] };
    const f = $("formato").value;
    if (FORMATI[f]) immagine.aspectRatio = "ASPECT_RATIO_" + FORMATI[f];
    const parti = [{ text: $("prompt").value.trim() },
      ...reference.map((r) => ({ inlineData: { mimeType: r.tipo, data: r.dati } }))];
    inCorso = new AbortController(); aggiorna();
    messaggio("Sto generando: di solito ci vuole meno di un minuto…");
    try {
      const d = await chiama({ contents: [{ role: "user", parts: parti }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], responseFormat: [{ image: immagine }] } });
      const parte = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
      if (!parte) throw new Error("Google non ha restituito un'immagine (a volte succede con prompt bloccati dai filtri). Riformula e riprova.");
      aggiungiImmagine(parte.inlineData.data, parte.inlineData.mimeType || "image/png");
      messaggio("Fatto. Ricordati di salvare le immagini che vuoi tenere: «Esci» le cancella.", "ok");
    } catch (e) {
      if (e.name !== "AbortError") messaggio(e.message, "error");
    }
    inCorso = null; aggiorna();
  }

  async function esci() {
    inCorso?.abort(); inCorso = null;
    chiave = ""; progetto = "";
    immagini.forEach((im) => URL.revokeObjectURL(im.url)); immagini = []; reference = [];
    $("galleria").replaceChildren(); mostraReference();
    $("modulo").reset(); $("progetto").value = ""; $("chiave").value = "";
    $("risultato").hidden = true; $("risultato").removeAttribute("src"); $("vuoto").hidden = false; $("salva").hidden = true;
    try { await navigator.clipboard.writeText(""); } catch {}
    aggiorna();
    messaggio("Hai finito. Chiudi la finestra in incognito: per il prossimo non resta niente.", "ok");
  }

  $("inserisci").onclick = inserisci;
  $("chiave").addEventListener("keydown", (e) => { if (e.key === "Enter") inserisci(); });
  $("esci").onclick = esci;
  $("modulo").addEventListener("submit", genera);
  $("prompt").addEventListener("input", aggiorna);
  $("risoluzione").addEventListener("change", aggiorna);
  $("reference").addEventListener("change", async (e) => {
    for (const file of [...e.target.files].slice(0, 6 - reference.length)) {
      if (file.size > 7 * 1024 * 1024) { messaggio(file.name + " è troppo grande (massimo 7 MB).", "error"); continue; }
      reference.push(await leggiFile(file));
    }
    e.target.value = ""; mostraReference();
  });
  window.addEventListener("beforeunload", (e) => { if (immagini.length) e.preventDefault(); });
  if (location.protocol === "file:") messaggio("Apri la pagina dal suo indirizzo online, non come file.", "error");
  aggiorna();
})();
