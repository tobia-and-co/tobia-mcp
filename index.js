#!/usr/bin/env node
// Tobia & Co. — server MCP: dati pubblici italiani e calcolatori dei diritti dei consumatori.
// I dati vengono letti da https://tobia-and-co.github.io/data/ (aggiornati da robot automatici). Nessuna chiave richiesta.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SITO = process.env.TOBIA_SITO || "https://tobia-and-co.github.io/";
const AIRHELP = "https://www.airhelp.it/?utm_medium=affiliate&utm_source=pap&utm_campaign=aff-tobiaandco&utm_content=mcp&a_aid=tobiaandco";
const cache = new Map();
async function dati(percorso) {
  if (!cache.has(percorso)) cache.set(percorso, fetch(SITO + "data/" + percorso).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} per ${percorso}`); return r.json(); }));
  return cache.get(percorso);
}
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const testo = o => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });
const NOMI = { B: "benzina", D: "gasolio", G: "GPL", M: "metano" };

const server = new McpServer({ name: "tobia-and-co", version: "0.1.0" });

server.tool("carburante_dove_conviene",
  "Trova i distributori di carburante più convenienti in Italia contando prezzo E viaggio per arrivarci (prezzi ufficiali del Ministero, aggiornati ogni mattina). Dai un comune italiano oppure latitudine e longitudine.",
  { comune: z.string().optional().describe("Comune italiano, es. 'Monza' o 'Roma'"), lat: z.number().optional(), lon: z.number().optional(),
    carburante: z.enum(["B", "D", "G", "M"]).default("B").describe("B benzina, D gasolio, G GPL, M metano"),
    litri: z.number().default(40), km_con_un_litro: z.number().default(15) },
  async ({ comune, lat, lon, carburante, litri, km_con_un_litro }) => {
    const indice = await dati("carburanti/indice.json");
    let nome = "posizione indicata";
    if (comune) {
      const c = indice.comuni.find(x => norm(x[0]) === norm(comune)) || indice.comuni.find(x => norm(x[0]).startsWith(norm(comune)));
      if (!c) return testo(`Comune "${comune}" non trovato tra quelli con distributori. Prova con latitudine e longitudine.`);
      [lat, lon] = [c[2], c[3]]; nome = `${c[0]} (${c[1]})`;
    }
    if (lat == null || lon == null) return testo("Serve un comune oppure latitudine e longitudine.");
    const prov = indice.province.map(p => ({ p: p[0], d: km(lat, lon, p[1], p[2]) })).sort((a, b) => a.d - b.d).filter((v, i) => i < 2 || (v.d < 70 && i < 6));
    const tutti = [];
    for (const { p } of prov) for (const v of (await dati(`carburanti/${p}.json`)).impianti) {
      if (!v[7][carburante]) continue;
      const strada = km(lat, lon, v[5], v[6]) * 1.3, prezzo = v[7][carburante][0];
      if (strada > 30) continue;
      tutti.push({ nome: v[1] + " · " + v[2], indirizzo: `${v[3]}, ${v[4]}`, prezzo, self: !!v[7][carburante][1], km_stimati: +strada.toFixed(1),
        costo_totale: +(prezzo * litri + strada * 2 / km_con_un_litro * prezzo).toFixed(2), mappa: `https://www.google.com/maps/dir/?api=1&destination=${v[5]},${v[6]}` });
    }
    if (!tutti.length) return testo("Nessun distributore con prezzo recente entro 30 km.");
    const med = tutti.map(x => x.prezzo).sort((a, b) => a - b)[tutti.length >> 1];
    const buoni = tutti.filter(x => x.prezzo >= med * 0.9 && x.prezzo <= med * 1.25).sort((a, b) => a.costo_totale - b.costo_totale);
    return testo({ zona: nome, carburante: NOMI[carburante], aggiornamento: indice.aggiornato, prezzo_tipico_zona: med,
      nota: "Costo totale = rifornimento + carburante per andata e ritorno (distanza stimata: linea d'aria × 1,3). Prezzi anomali (sotto il 90% del tipico) esclusi perché spesso errati.",
      migliori: buoni.slice(0, 5), mappa_interattiva: SITO + "carburante/", fonte: "Ministero delle Imprese e del Made in Italy (Osservaprezzi), elaborazione Tobia & Co." });
  });

server.tool("carburante_prezzi_medi",
  "Prezzo medio di oggi di benzina e gasolio self, GPL e metano in Italia e per ciascuna regione, con lo storico giornaliero.",
  { regione: z.string().optional().describe("Es. 'Lombardia'; vuoto = tutte") },
  async ({ regione }) => {
    const m = await dati("carburanti/medie.json");
    const reg = regione ? Object.fromEntries(Object.entries(m.regioni).filter(([r]) => norm(r).includes(norm(regione)))) : m.regioni;
    return testo({ data: m.data, unita: "€/litro (metano €/kg); benzina e gasolio: self service", italia: m.italia, regioni: reg, pagina: SITO + "carburante/prezzi-medi/", storico_json: SITO + "data/carburanti/storico.json" });
  });

server.tool("farmaco_equivalente",
  "Cerca un farmaco (marca o principio attivo) nella lista ufficiale AIFA dei farmaci equivalenti e mostra le alternative che costano meno, con la differenza che il paziente paga.",
  { nome: z.string().describe("Es. 'Eutirox', 'omeprazolo', 'Pantorc'") },
  async ({ nome }) => {
    const f = await dati("farmaci.json"), q = norm(nome);
    const gruppi = f.gruppi.filter(g => norm(g.p).includes(q) || g.f.some(x => norm(x[0]).includes(q))).slice(0, 8);
    if (!gruppi.length) return testo(`Nessun farmaco equivalente trovato per "${nome}" nella lista AIFA.`);
    return testo({ prezzi_al: f.prezzi_al, fonte: "Lista di trasparenza AIFA", nota: "Il prezzo di riferimento è rimborsato dal SSN; la differenza è a carico del paziente. Chiedi sempre al medico o al farmacista.",
      risultati: gruppi.map(g => ({ principio_attivo: g.p, confezione: g.c, prezzo_riferimento: g.r,
        confezioni: g.f.map(x => ({ nome: x[0], ditta: x[2], prezzo: x[3], differenza_a_carico: x[4] })).sort((a, b) => a.prezzo - b.prezzo) })),
      pagina: SITO + "farmaci/" });
  });

server.tool("rimborso_volo",
  "Calcola la compensazione per un volo in ritardo, cancellato o con imbarco negato secondo il Regolamento UE 261/2004 (250/400/600 € a persona), usando i codici IATA degli aeroporti.",
  { da: z.string().describe("Codice IATA di partenza, es. FCO"), a: z.string().describe("Codice IATA di arrivo, es. JFK"),
    evento: z.enum(["ritardo", "cancellato", "imbarco_negato"]), ore_ritardo_arrivo: z.number().optional(),
    compagnia_europea: z.boolean().default(true), causa_straordinaria: z.boolean().default(false).describe("Maltempo, sciopero dei controllori, sicurezza: true. Sciopero del personale della compagnia: false.") },
  async ({ da, a, evento, ore_ritardo_arrivo, compagnia_europea, causa_straordinaria }) => {
    const A = await dati("aeroporti.json"), trova = c => A.find(x => x[0] === c.toUpperCase());
    const p = trova(da), q = trova(a);
    if (!p || !q) return testo("Codice IATA non trovato.");
    const UE = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS NO CH LI".split(" ");
    const daUE = UE.includes(p[3]), aUE = UE.includes(q[3]), d = Math.round(km(p[4], p[5], q[4], q[5]));
    const vale = daUE || (aUE && compagnia_europea);
    let importo = d <= 1500 ? 250 : (d <= 3500 || (daUE && aUE) ? 400 : 600);
    const motivi = [];
    if (!vale) { importo = 0; motivi.push("Il regolamento vale per i voli che partono dall'UE, o che arrivano nell'UE con una compagnia europea."); }
    if (causa_straordinaria) { importo = 0; motivi.push("Con circostanze straordinarie la compensazione non spetta (restano rimborso/riprotezione e assistenza)."); }
    if (evento === "ritardo" && (ore_ritardo_arrivo ?? 0) < 3) { importo = 0; motivi.push("Per il ritardo servono almeno 3 ore all'arrivo."); }
    if (importo === 600 && evento === "ritardo" && ore_ritardo_arrivo < 4) { importo = 300; motivi.push("Oltre 3.500 km con ritardo tra 3 e 4 ore: importo dimezzato."); }
    return testo({ distanza_km: d, compensazione_per_persona_eur: importo, note: motivi, calcolatore_e_lettera: SITO + "voli/",
      fai_gestire_da_un_esperto: { link: AIRHELP, avviso: "Link di affiliazione di Tobia & Co.: AirHelp trattiene una percentuale solo se vince; il passeggero può anche chiedere da solo gratis." } });
  });

server.tool("rimborso_treno",
  "Indennità per un treno in ritardo in Italia/UE (Reg. UE 2021/782): 25% del biglietto da 60 a 119 minuti, 50% da 120 minuti; importi fino a 4 € non pagati.",
  { prezzo_biglietto: z.number(), minuti_ritardo: z.number() },
  async ({ prezzo_biglietto, minuti_ritardo }) => {
    const perc = minuti_ritardo >= 120 ? 50 : minuti_ritardo >= 60 ? 25 : 0, imp = Math.round(prezzo_biglietto * perc) / 100;
    return testo({ percentuale: perc, indennita_eur: imp > 4 ? imp : 0, nota: imp > 0 && imp <= 4 ? "Sotto i 4 € l'indennità non viene pagata." : "Trenitalia: richiesta entro 12 mesi; regionali pagati con mezzi elettronici rimborsati in automatico dal 2025.", pagina: SITO + "treno/" });
  });

server.tool("cambio_bce",
  "Cambi ufficiali BCE di oggi rispetto all'euro.",
  { valuta: z.string().optional().describe("Codice, es. USD; vuoto = tutte") },
  async ({ valuta }) => {
    const c = await dati("cambi.json");
    return testo({ data: c.data, fonte: "BCE", euro_vale: valuta ? { [valuta.toUpperCase()]: c.eur[valuta.toUpperCase()] } : c.eur });
  });

await server.connect(new StdioServerTransport());
