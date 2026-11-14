// Carga los temas y las fuentes desde la carpeta contenido/.
// Cada tema es una carpeta con tema.md (texto), examen.json (preguntas)
// y, opcionalmente, audio.mp3 (narración generada con scripts/generar-audio.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DIR_CONTENIDO = process.env.DIR_CONTENIDO || path.join(raiz, "contenido");
const dirTemas = () => path.join(DIR_CONTENIDO, "temas");
const dirFuentes = () => path.join(DIR_CONTENIDO, "fuentes");

// Cabecera opcional al principio de tema.md:
// ---
// titulo: ...
// resumen: ...
// ---
export function separarCabecera(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { datos: {}, cuerpo: texto };
  const datos = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const i = linea.indexOf(":");
    if (i > 0) datos[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  return { datos, cuerpo: texto.slice(m[0].length) };
}

// Convierte el markdown del tema en el texto que se narra en el audio.
export function textoParaNarrar(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+(.*)$/gm, "$1.")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/^[ \t]*(\d+)\.[ \t]+/gm, "$1. ")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/([.:;!?])\.(\s|$)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function leerTema(id) {
  if (!/^[\w-]+$/.test(id)) return null;
  const dir = path.join(dirTemas(), id);
  const rutaTexto = path.join(dir, "tema.md");
  if (!fs.existsSync(rutaTexto)) return null;
  const { datos, cuerpo } = separarCabecera(fs.readFileSync(rutaTexto, "utf8"));
  let examen = { preguntas: [] };
  const rutaExamen = path.join(dir, "examen.json");
  if (fs.existsSync(rutaExamen)) examen = JSON.parse(fs.readFileSync(rutaExamen, "utf8"));
  return {
    id,
    dir,
    titulo: datos.titulo || id,
    resumen: datos.resumen || "",
    ejemplo: datos.ejemplo === "si",
    markdown: cuerpo,
    preguntas: examen.preguntas || [],
    tieneAudio: fs.existsSync(path.join(dir, "audio.mp3")),
  };
}

export function listarTemas() {
  if (!fs.existsSync(dirTemas())) return [];
  return fs
    .readdirSync(dirTemas(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map(leerTema)
    .filter(Boolean);
}

export function obtenerTema(id) {
  return leerTema(id);
}

export function temaComoHtml(tema) {
  return marked.parse(tema.markdown);
}

// Fuentes: texto extraído de los documentos originales (.md o .txt).
export function listarFuentes() {
  if (!fs.existsSync(dirFuentes())) return [];
  return fs
    .readdirSync(dirFuentes())
    .filter((f) => /\.(md|txt)$/i.test(f) && f.toLowerCase() !== "readme.md")
    .sort()
    .map((f) => ({
      nombre: f.replace(/\.(md|txt)$/i, ""),
      texto: fs.readFileSync(path.join(dirFuentes(), f), "utf8"),
    }));
}

// Flujo de la primera visita: pasos, puntos de control, frases y el caso guiado.
export function obtenerFlujo() {
  const ruta = path.join(DIR_CONTENIDO, "flujo.json");
  if (!fs.existsSync(ruta)) return { caso: null, pasos: [] };
  return JSON.parse(fs.readFileSync(ruta, "utf8"));
}
