import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { listarTemas, obtenerTema, temaComoHtml, listarFuentes, obtenerFlujo } from "./lib/contenido.js";
import { conversar, corregir, valorarProgreso, tutorConfigurado, mensajeDeError } from "./lib/tutor.js";
import { crearAcceso, exigirAdministrador } from "./lib/acceso.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// Carga .env si existe (sin dependencias).
const rutaEnv = path.join(aqui, ".env");
if (fs.existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
const exigirSesion = crearAcceso({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY });

const CODIGO = process.env.CODIGO_ACCESO || "";
function codigoCorrecto(valor) {
  const a = Buffer.from(String(valor || ""));
  const b = Buffer.from(CODIGO);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Protege las rutas que gastan la clave de IA.
function exigirAcceso(req, res, next) {
  if (!CODIGO || codigoCorrecto(req.get("x-codigo-acceso"))) return next();
  res.status(401).json({ error: "Código de acceso incorrecto.", pideCodigo: true });
}
function exigirTutor(req, res, next) {
  if (tutorConfigurado()) return next();
  res.status(503).json({
    error: "El profesor con IA aún no está configurado: falta la clave ANTHROPIC_API_KEY en el servidor.",
  });
}

app.get("/api/estado", (req, res) => {
  res.json({
    tutor: tutorConfigurado(),
    pideCodigo: Boolean(CODIGO),
    fuentes: listarFuentes().map((f) => f.nombre),
  });
});

app.get("/api/configuracion", (req, res) => {
  res.set("Cache-Control", "no-store").json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    requiereCuenta: true,
  });
});

app.delete("/api/sesion", (req, res) => {
  res.clearCookie("novalis_sesion", { path: "/", httpOnly: true, sameSite: "strict", secure: req.secure });
  res.status(204).end();
});
app.post("/api/sesion", exigirSesion, (req, res) => {
  if (req.get("origin") && new URL(req.get("origin")).host !== req.get("host")) return res.status(403).json({ error: "Origen no permitido." });
  res.cookie("novalis_sesion", req.cuenta.token, { httpOnly: true, secure: req.secure, sameSite: "strict", path: "/", maxAge: 3600000 });
  res.json({ perfil: req.cuenta.perfil });
});

// También se comprueba en el servidor: ocultar el menú no protege el contenido.
app.use("/api", exigirSesion);
app.get("/api/admin/usuarios", exigirAdministrador, async (req, res) => {
  const pagina = Math.max(0, Math.min(10000, Number.parseInt(req.query.pagina, 10) || 0));
  const { data, count, error } = await req.cuenta.cliente.from("perfiles")
    .select("id,email,rol,activo,creado", { count: "exact" }).order("creado", { ascending: false }).range(pagina * 50, pagina * 50 + 49);
  if (error) return res.status(503).json({ error: "No se pudieron cargar los usuarios." });
  res.json({ usuarios: data, total: count, pagina });
});
app.patch("/api/admin/usuarios/:id", exigirAdministrador, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || typeof req.body?.activo !== "boolean") return res.status(400).json({ error: "Datos no válidos." });
  if (req.params.id === req.cuenta.perfil.id) return res.status(400).json({ error: "No puedes desactivar tu propia cuenta." });
  const { data, error } = await req.cuenta.cliente.from("perfiles").update({ activo: req.body.activo })
    .eq("id", req.params.id).eq("rol", "usuario").select("id,activo").maybeSingle();
  if (error) return res.status(503).json({ error: "No se pudo modificar la cuenta." });
  if (!data) return res.status(404).json({ error: "Usuario no encontrado o protegido." });
  res.json(data);
});

app.get("/api/temas", (req, res) => {
  res.json(
    listarTemas().map((t) => ({
      id: t.id,
      titulo: t.titulo,
      resumen: t.resumen,
      ejemplo: t.ejemplo,
      tieneAudio: t.tieneAudio,
      numPreguntas: t.preguntas.length,
    })),
  );
});

app.get("/api/temas/:id", (req, res) => {
  const t = obtenerTema(req.params.id);
  if (!t) return res.status(404).json({ error: "Tema no encontrado." });
  res.json({
    id: t.id,
    titulo: t.titulo,
    resumen: t.resumen,
    ejemplo: t.ejemplo,
    tieneAudio: t.tieneAudio,
    html: temaComoHtml(t),
    preguntas: t.preguntas,
  });
});

app.get("/api/temas/:id/audio", (req, res) => {
  const t = obtenerTema(req.params.id);
  if (!t || !t.tieneAudio) return res.status(404).json({ error: "Este tema aún no tiene audio." });
  res.sendFile(path.join(t.dir, "audio.mp3"));
});

app.get("/api/flujo", (req, res) => res.json(obtenerFlujo()));

app.post("/api/progreso", exigirAcceso, exigirTutor, async (req, res) => {
  try {
    res.json({ valoracion: await valorarProgreso({ visitas: req.body?.visitas }) });
  } catch (error) {
    res.status(error instanceof Error && !("status" in error) ? 400 : 502).json({ error: mensajeDeError(error) });
  }
});

app.post("/api/chat", exigirAcceso, exigirTutor, async (req, res) => {
  let stream;
  try {
    stream = conversar({ mensajes: req.body?.mensajes, temaId: req.body?.temaId, visitas: req.body?.visitas });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const enviar = (dato) => res.write(`data: ${JSON.stringify(dato)}\n\n`);
  res.on("close", () => {
    if (!res.writableEnded) stream.abort();
  });
  try {
    for await (const evento of stream) {
      if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
        enviar({ texto: evento.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") enviar({ error: "El profesor no puede responder a esa petición." });
    else if (final.stop_reason === "max_tokens") enviar({ aviso: "La respuesta se ha cortado por longitud." });
    enviar({ fin: true });
  } catch (error) {
    if (!res.writableEnded) enviar({ error: mensajeDeError(error) });
  }
  res.end();
});

app.post("/api/corregir", exigirAcceso, exigirTutor, async (req, res) => {
  const { temaId, indice, respuesta } = req.body || {};
  const tema = obtenerTema(String(temaId || ""));
  const pregunta = tema?.preguntas[indice];
  if (!pregunta || pregunta.tipo !== "desarrollo") return res.status(404).json({ error: "Pregunta no encontrada." });
  if (typeof respuesta !== "string" || !respuesta.trim()) return res.status(400).json({ error: "La respuesta está vacía." });
  try {
    res.json(await corregir({ tema, pregunta, respuesta }));
  } catch (error) {
    res.status(502).json({ error: mensajeDeError(error) });
  }
});

app.use("/vendor/marked.js", express.static(path.join(aqui, "node_modules/marked/lib/marked.umd.js")));
app.use("/vendor/purify.js", express.static(path.join(aqui, "node_modules/dompurify/dist/purify.min.js")));
app.use("/vendor/supabase.js", express.static(path.join(aqui, "node_modules/@supabase/supabase-js/dist/umd/supabase.js")));
app.use(express.static(path.join(aqui, "public")));

const puerto = Number(process.env.PORT) || 3000;
app.listen(puerto, () => console.log(`Novalis Aprende en http://localhost:${puerto}`));
