import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Nodo extends EventTarget {
  constructor(tag = "div") { super(); this.tag = tag; this.children = []; this.textContent = ""; }
  append(...hijos) { this.children.push(...hijos); }
  replaceChildren(...hijos) { this.children = hijos; }
  setAttribute(clave, valor) { this[clave] = valor; }
}
const pausa = () => new Promise((r) => setImmediate(r));
async function vaciar() { for (let i = 0; i < 12; i++) await pausa(); }
function buscar(nodo, texto) {
  if (nodo?.textContent === texto) return nodo;
  for (const hijo of nodo?.children || []) { const n = buscar(hijo, texto); if (n) return n; }
}
async function entorno({ usuario = "uno", filas = [], previo = {}, fallo = false } = {}) {
  const panel = new Nodo();
  const ventana = new EventTarget();
  const doc = new EventTarget();
  doc.createElement = (tag) => new Nodo(tag);
  doc.getElementById = () => panel;
  const valores = new Map(Object.entries(previo));
  const llamadas = [];
  const remoto = new Map(filas.map((f) => [f.clave, structuredClone(f)]));
  let sinRed = fallo;
  let interceptar;
  const cliente = {
    auth: { getSession: async () => ({ data: { session: usuario ? { access_token: "sesion-de-prueba", user: { id: usuario, email: "alumno@example.org" } } : null } }), onAuthStateChange() {}, signOut: async () => ({}) },
    from: () => ({ select: async () => sinRed ? { error: new Error("Sin red") } : { data: [...remoto.values()].map((x) => structuredClone(x)) } }),
    rpc: async (_, p) => {
      llamadas.push(p);
      if (sinRed) return { error: new Error("Sin red") };
      const actual = remoto.get(p.p_clave);
      if ((actual?.revision || 0) !== p.p_revision) return { data: null };
      const revision = p.p_revision + 1;
      remoto.set(p.p_clave, { clave: p.p_clave, valor: structuredClone(p.p_valor), revision });
      if (interceptar) { const fn = interceptar; interceptar = null; fn(); }
      return { data: revision };
    },
  };
  ventana.supabase = { createClient: () => cliente };
  const ctx = vm.createContext({ window: ventana, document: doc, Event, AbortSignal, URLSearchParams, queueMicrotask,
    fetch: async (ruta) => ({ ok: true, json: async () => ruta === "/api/sesion" ? { perfil: { id: usuario, rol: "usuario", activo: true } } : { supabaseUrl: "https://example.supabase.co", supabaseKey: "publicable" } }),
    localStorage: { getItem: (k) => valores.get(k) ?? null, setItem: (k, v) => valores.set(k, v) },
    location: { origin: "https://app.example.org", pathname: "/", search: "", reload() {} },
  });
  const fuente = fs.readFileSync(new URL("../public/cuenta.js", import.meta.url), "utf8");
  vm.runInContext(fuente.replace("export async function iniciarCuenta", "async function iniciarCuenta"), ctx);
  await ctx.iniciarCuenta();
  const guardar = (clave, valor) => {
    valores.set(ventana.novalisClave(clave), JSON.stringify(valor));
    const e = new Event("novalis:guardado");
    e.detail = { clave, valor }; ventana.dispatchEvent(e);
  };
  return { panel, ventana, valores, llamadas, remoto, guardar, red: (ok) => { sinRed = !ok; }, duranteGuardado: (fn) => { interceptar = fn; } };
}

test("la cuenta carga el progreso de la nube y aísla los datos del invitado", async () => {
  const e = await entorno({ filas: [{ clave: "visitas", valor: [{ id: "remota" }], revision: 2 }], previo: { visitas: '[{"id":"invitado"}]', "novalis:otro:visitas": '[{"id":"otro"}]' } });
  assert.equal(e.valores.get("novalis:uno:visitas"), '[{"id":"remota"}]');
  assert.equal(e.valores.get("visitas"), '[{"id":"invitado"}]');
  assert.equal(e.ventana.novalisClave("codigo"), "codigo");
  assert.equal(e.llamadas.length, 0);
});

test("guarda cambios con revisión y excluye chat y código de acceso", async () => {
  const e = await entorno();
  e.guardar("resultados", { tema: [{ nota: 9 }] });
  e.guardar("chat", [{ content: "privado" }]);
  e.guardar("codigo", "secreto");
  await vaciar();
  assert.deepEqual(e.remoto.get("resultados").valor, { tema: [{ nota: 9 }] });
  assert.equal(e.llamadas.length, 1);
  assert.equal(e.llamadas[0].p_revision, 0);
});

test("los cambios sin conexión sobreviven y se reintentan", async () => {
  const e = await entorno({ fallo: true });
  e.guardar("caso", { aciertos: 5 });
  await vaciar();
  assert.equal(JSON.parse(e.valores.get("novalis:uno:sincronizacion")).caso.pendiente, true);
  e.red(true);
  e.ventana.dispatchEvent(new Event("online"));
  await vaciar();
  assert.deepEqual(e.remoto.get("caso").valor, { aciertos: 5 });
  assert.equal(JSON.parse(e.valores.get("novalis:uno:sincronizacion")).caso.pendiente, false);
});

test("un conflicto conserva ambas versiones hasta elegir", async () => {
  const e = await entorno({
    filas: [{ clave: "visitas", valor: [{ id: "ipad" }], revision: 4 }],
    previo: { "novalis:uno:visitas": '[{"id":"movil"}]', "novalis:uno:sincronizacion": '{"visitas":{"revision":3,"pendiente":true}}' },
  });
  assert.equal(e.llamadas.length, 0);
  assert.equal(e.valores.get("novalis:uno:visitas"), '[{"id":"movil"}]');
  buscar(e.panel, "Conservar la de este dispositivo").onclick();
  await vaciar();
  assert.deepEqual(e.remoto.get("visitas").valor, [{ id: "movil" }]);
  assert.equal(e.remoto.get("visitas").revision, 5);
});

test("la elección de nube descarta solo el cambio local en conflicto", async () => {
  const e = await entorno({ filas: [{ clave: "caso", valor: { aciertos: 6 }, revision: 2 }],
    previo: { "novalis:uno:caso": '{"aciertos":3}', "novalis:uno:sincronizacion": '{"caso":{"revision":1,"pendiente":true}}' } });
  buscar(e.panel, "Usar la versión de la nube").onclick();
  await vaciar();
  assert.equal(e.valores.get("novalis:uno:caso"), '{"aciertos":6}');
  assert.equal(e.llamadas.length, 0);
});

test("un cambio durante la subida también acaba guardado", async () => {
  const e = await entorno();
  e.duranteGuardado(() => e.guardar("caso", { aciertos: 8 }));
  e.guardar("caso", { aciertos: 2 });
  await vaciar();
  assert.deepEqual(e.remoto.get("caso").valor, { aciertos: 8 });
  assert.equal(e.remoto.get("caso").revision, 2);
});
