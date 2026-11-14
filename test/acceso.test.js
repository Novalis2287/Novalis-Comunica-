import test from "node:test";
import assert from "node:assert/strict";
import { crearAcceso, tokenDePeticion, exigirAdministrador } from "../lib/acceso.js";

async function comprobar({ token = "Bearer valido", user = { id: "uno", email_confirmed_at: "2026-11-14" }, authError = null, perfil = { id: "uno", rol: "usuario", activo: true }, perfilError = null } = {}) {
  let validaciones = 0;
  let permitida = false;
  const req = { get: (k) => k === "authorization" ? token : "" };
  const res = { codigo: 200, set() { return this; }, status(n) { this.codigo = n; return this; }, json(v) { this.cuerpo = v; return this; } };
  const cliente = { auth: { getUser: async () => { validaciones++; return { data: { user }, error: authError }; } }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: perfil, error: perfilError }) }) }) }) };
  await crearAcceso({ url: "https://example.supabase.co", key: "publicable", fabrica: () => cliente })(req, res, () => { permitida = true; });
  return { req, res, permitida, validaciones };
}
test("el contenido exige una sesión, aunque se conozca la URL", async () => {
  const r = await comprobar({ token: "" });
  assert.equal(r.res.codigo, 401); assert.equal(r.permitida, false); assert.equal(r.validaciones, 0);
});
test("una sesión manipulada se valida con el servidor de autenticación", async () => {
  const r = await comprobar({ authError: new Error("JWT inválido") });
  assert.equal(r.res.codigo, 401); assert.equal(r.permitida, false); assert.equal(r.validaciones, 1);
});
test("el correo sin confirmar no permite acceder", async () => {
  const r = await comprobar({ user: { id: "uno" } });
  assert.equal(r.res.codigo, 403); assert.equal(r.permitida, false);
});
test("una cuenta desactivada queda bloqueada aunque su token siga vigente", async () => {
  const r = await comprobar({ perfil: { id: "uno", rol: "usuario", activo: false } });
  assert.equal(r.res.codigo, 403); assert.equal(r.permitida, false);
});
test("un fallo al comprobar perfiles deniega el acceso", async () => {
  const r = await comprobar({ perfilError: new Error("Sin red") });
  assert.equal(r.res.codigo, 503); assert.equal(r.permitida, false);
});
test("la cuenta activa y confirmada puede acceder", async () => {
  const r = await comprobar();
  assert.equal(r.permitida, true); assert.equal(r.req.cuenta.perfil.id, "uno");
});
test("un usuario normal no puede acceder a administración", async () => {
  const r = await comprobar(); let permitida = false;
  exigirAdministrador(r.req, r.res, () => { permitida = true; });
  assert.equal(r.res.codigo, 403); assert.equal(permitida, false);
});
test("el administrador accede al panel", async () => {
  const r = await comprobar({ perfil: { id: "uno", rol: "admin", activo: true } }); let permitida = false;
  exigirAdministrador(r.req, r.res, () => { permitida = true; });
  assert.equal(permitida, true);
});
test("los audios admiten la cookie de sesión y una cabecera inválida no la suplanta", () => {
  assert.equal(tokenDePeticion({ get: (k) => k === "cookie" ? "otro=x; novalis_sesion=token-firmado" : "" }), "token-firmado");
  assert.equal(tokenDePeticion({ get: (k) => k === "authorization" ? "no es bearer" : "novalis_sesion=token-firmado" }), "");
});
