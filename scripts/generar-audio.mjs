#!/usr/bin/env node
// Genera la narración (audio.mp3) de cada tema con una voz de IA.
//
//   npm run audio              -> todos los temas sin audio o con el texto cambiado
//   npm run audio -- 01-tema   -> solo ese tema
//   npm run audio -- --forzar  -> regenera aunque el texto no haya cambiado
//
// Proveedor por defecto: ElevenLabs (voz masculina de España, elegida con
// ELEVENLABS_VOICE_ID). Alternativa: Azure Speech (es-ES-AlvaroNeural).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { listarTemas, textoParaNarrar } from "../lib/contenido.js";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (fs.existsSync(path.join(raiz, ".env"))) process.loadEnvFile(path.join(raiz, ".env"));

const PROVEEDOR = (process.env.TTS_PROVEEDOR || "elevenlabs").toLowerCase();
const MAX_TROZO = 2500; // caracteres por petición

// Parte el texto por párrafos (y por frases si un párrafo es muy largo).
export function trocear(texto, max = MAX_TROZO) {
  const piezas = [];
  for (const parrafo of texto.split(/\n{2,}/)) {
    if (parrafo.length <= max) piezas.push(parrafo);
    else piezas.push(...(parrafo.match(/[^.!?]+[.!?]*\s*/g) || [parrafo]));
  }
  const trozos = [];
  let actual = "";
  for (const pieza of piezas) {
    const p = pieza.trim();
    if (!p) continue;
    if (actual && actual.length + p.length + 2 > max) {
      trozos.push(actual);
      actual = "";
    }
    actual = actual ? `${actual}\n\n${p}` : p;
  }
  if (actual) trozos.push(actual);
  return trozos;
}

async function pedir(url, opciones) {
  for (let intento = 1; ; intento++) {
    const r = await fetch(url, opciones);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const reintentable = r.status === 429 || r.status >= 500;
    if (!reintentable || intento === 4) {
      throw new Error(`El servicio de voz respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    }
    await new Promise((ok) => setTimeout(ok, 2000 * intento));
  }
}

const proveedores = {
  elevenlabs: {
    firma: () => `elevenlabs:${process.env.ELEVENLABS_VOICE_ID}:${process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2"}`,
    comprobar() {
      if (!process.env.ELEVENLABS_API_KEY) throw new Error("Falta ELEVENLABS_API_KEY.");
      if (!process.env.ELEVENLABS_VOICE_ID) throw new Error("Falta ELEVENLABS_VOICE_ID (ID de la voz elegida).");
    },
    // previous_text / next_text mantienen la entonación entre trozos.
    sintetizar(texto, anterior, siguiente) {
      const voz = process.env.ELEVENLABS_VOICE_ID;
      return pedir(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: texto,
          model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
          language_code: "es",
          previous_text: anterior || undefined,
          next_text: siguiente || undefined,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, speed: 0.95 },
        }),
      });
    },
  },
  azure: {
    firma: () => `azure:${process.env.AZURE_VOZ || "es-ES-AlvaroNeural"}`,
    comprobar() {
      if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
        throw new Error("Faltan AZURE_SPEECH_KEY y AZURE_SPEECH_REGION.");
      }
    },
    sintetizar(texto) {
      const voz = process.env.AZURE_VOZ || "es-ES-AlvaroNeural";
      const xml = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return pedir(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "novalis-comunica",
        },
        body: `<speak version="1.0" xml:lang="es-ES"><voice name="${voz}"><prosody rate="-5%">${xml}</prosody></voice></speak>`,
      });
    },
  },
};

async function principal() {
  const args = process.argv.slice(2);
  const forzar = args.includes("--forzar");
  const ids = args.filter((a) => !a.startsWith("--"));
  const proveedor = proveedores[PROVEEDOR];
  if (!proveedor) throw new Error(`Proveedor de voz desconocido: ${PROVEEDOR}`);
  proveedor.comprobar();

  const temas = listarTemas().filter((t) => !ids.length || ids.includes(t.id));
  if (!temas.length) throw new Error("No hay temas que coincidan.");

  for (const tema of temas) {
    const texto = `${tema.titulo}.\n\n${textoParaNarrar(tema.markdown)}`;
    const huella = crypto.createHash("sha256").update(`${proveedor.firma()}\n${texto}`).digest("hex");
    const rutaHuella = path.join(tema.dir, "audio.sha256");
    const alDia = tema.tieneAudio && fs.existsSync(rutaHuella) && fs.readFileSync(rutaHuella, "utf8").trim() === huella;
    if (alDia && !forzar) {
      console.log(`= ${tema.id}: audio al día`);
      continue;
    }
    const trozos = trocear(texto);
    console.log(`> ${tema.id}: ${texto.length} caracteres en ${trozos.length} trozo(s)`);
    const partes = [];
    for (let i = 0; i < trozos.length; i++) {
      partes.push(await proveedor.sintetizar(trozos[i], trozos[i - 1]?.slice(-300), trozos[i + 1]?.slice(0, 300)));
      console.log(`  trozo ${i + 1}/${trozos.length}`);
    }
    fs.writeFileSync(path.join(tema.dir, "audio.mp3"), Buffer.concat(partes));
    fs.writeFileSync(rutaHuella, huella + "\n");
    console.log(`  guardado ${path.join(tema.dir, "audio.mp3")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
