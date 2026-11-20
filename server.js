import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listarTemas, obtenerTema, temaComoHtml, listarFuentes, obtenerFlujo } from "./lib/contenido.js";
import { crearAcceso, exigirAdministrador } from "./lib/acceso.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// Carga .env si existe (sin dependencias).
const rutaEnv = path.join(aqui, ".env");
if (fs.existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
const exigirSesion = crearAcceso({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY });

app.get("/api/estado", (req, res) => {
  res.json({
    tutor: false,
    pideCodigo: false,
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
app.get("/api/admin/correos", exigirAdministrador, async (req, res) => {
  const pagina = Math.max(0, Math.min(10000, Number.parseInt(req.query.pagina, 10) || 0));
  const { data, count, error } = await req.cuenta.cliente.from("correos_autorizados")
    .select("email,autorizado_el", { count: "exact" }).order("autorizado_el", { ascending: false }).range(pagina * 50, pagina * 50 + 49);
  if (error) return res.status(503).json({ error: "No se pudieron cargar los correos autorizados." });
  const registrados = data.length ? await req.cuenta.cliente.from("perfiles").select("email").in("email", data.map((x) => x.email)) : { data: [] };
  if (registrados.error) return res.status(503).json({ error: "No se pudieron comprobar los registros." });
  const emails = new Set(registrados.data.map((x) => x.email));
  res.json({ correos: data.map((x) => ({ ...x, registrado: emails.has(x.email) })), total: count, pagina });
});
app.post("/api/admin/correos", exigirAdministrador, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Escribe un correo electrónico válido." });
  const { error } = await req.cuenta.cliente.from("correos_autorizados").insert({ email, autorizado_por: req.cuenta.perfil.id });
  if (error?.code === "23505") return res.status(409).json({ error: "Este correo ya está autorizado." });
  if (error) return res.status(503).json({ error: "No se pudo autorizar este correo." });
  res.status(201).json({ email });
});
app.delete("/api/admin/correos/:email", exigirAdministrador, async (req, res) => {
  const email = req.params.email.trim().toLowerCase();
  const registrado = await req.cuenta.cliente.from("perfiles").select("id").eq("email", email).limit(1);
  if (registrado.error) return res.status(503).json({ error: "No se pudo comprobar este correo." });
  if (registrado.data.length) return res.status(409).json({ error: "Esta cuenta ya está creada. Usa «Desactivar acceso» para bloquearla." });
  const { data, error } = await req.cuenta.cliente.from("correos_autorizados").delete().eq("email", email).select("email");
  if (error) return res.status(503).json({ error: "No se pudo retirar la autorización." });
  if (!data.length) return res.status(404).json({ error: "Correo no encontrado." });
  res.json({ email });
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

// Temario en texto, para el archivo de práctica que el usuario se lleva a una IA.
app.get("/api/material", (req, res) => {
  res.set("Cache-Control", "private, no-store").json({
    temas: listarTemas().map((t) => ({ id: t.id, titulo: t.titulo, texto: t.markdown })),
  });
});

app.use("/vendor/supabase.js", express.static(path.join(aqui, "node_modules/@supabase/supabase-js/dist/umd/supabase.js")));
app.use(express.static(path.join(aqui, "public")));

const puerto = Number(process.env.PORT) || 3000;
app.listen(puerto, () => console.log(`Novalis Aprende en http://localhost:${puerto}`));
