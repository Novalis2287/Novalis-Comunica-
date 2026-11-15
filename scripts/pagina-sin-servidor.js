// Sustituye al servidor en la versión de una sola página: los temas van
// incluidos y los datos del usuario se guardan en la base de datos de la página.
const DATOS = __DATOS__;

const usar = (nombre) => (window.claude?.use ? window.claude.use(nombre).catch(() => null) : Promise.resolve(null));
const responder = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

window.fetch = async (ruta) => {
  if (ruta === "/api/estado") return responder({ tutor: false, pideCodigo: false, fuentes: DATOS.fuentes });
  if (ruta === "/api/flujo") return responder(DATOS.flujo);
  if (ruta === "/api/temas") return responder(DATOS.temas.map(({ html, preguntas, texto, ...resto }) => resto));
  if (ruta === "/api/material") return responder({ temas: DATOS.temas.map(({ id, titulo, texto }) => ({ id, titulo, texto })) });
  const tema = DATOS.temas.find((t) => ruta === "/api/temas/" + t.id);
  if (tema) {
    const { texto, ...resto } = tema;
    return responder(resto);
  }
  return responder({ error: "No encontrado." }, 404);
};

// Dentro de la página de Claude los enlaces de descarga no funcionan: guarda la propia página.
if (window.claude?.use) {
  window.novalisDescargar = async (nombre, texto) => {
    const descargas = await usar("downloads");
    if (!descargas) throw new Error("Descarga no disponible");
    await descargas.save({ filename: nombre, data: texto });
  };
}

// Los datos del usuario se guardan también en la base de datos de la página,
// en su carpeta privada, para que estén en todos sus dispositivos.
const CLAVES = ["visitas", "resultados", "caso"];
(async () => {
  const [db, usuario] = await Promise.all([usar("db"), usar("user")]);
  const id = db && usuario ? await usuario.id().catch(() => null) : null;
  if (!id) return;
  const carpeta = db.collection(`data/users/${id}`);
  const enCola = new Map();
  async function subir(clave) {
    // Una escritura a la vez por documento; si llega otra mientras tanto, se guarda la última.
    while (enCola.has(clave)) {
      const valor = enCola.get(clave);
      try {
        await carpeta.doc(clave).set({ valor: JSON.stringify(valor), fecha: Date.now() });
      } catch {
        /* sin conexión o sin permiso: el dato sigue en este navegador */
      }
      if (enCola.get(clave) === valor) enCola.delete(clave);
    }
  }
  window.addEventListener("novalis:guardado", (e) => {
    const { clave, valor } = e.detail;
    if (!CLAVES.includes(clave)) return;
    const yaSubiendo = enCola.has(clave);
    enCola.set(clave, valor);
    if (!yaSubiendo) subir(clave);
  });
  // Al abrir, lo guardado en la nube sustituye a lo de este navegador.
  let cambios = false;
  await Promise.all(
    CLAVES.map(async (clave) => {
      try {
        const doc = (await carpeta.doc(clave).get()).data();
        if (!doc || typeof doc.valor !== "string" || enCola.has(clave)) return;
        if (localStorage.getItem(clave) !== doc.valor) {
          localStorage.setItem(clave, doc.valor);
          cambios = true;
        }
      } catch {
        /* se sigue con los datos locales */
      }
    }),
  );
  if (cambios) window.dispatchEvent(new Event("novalis:sincronizado"));
})();
