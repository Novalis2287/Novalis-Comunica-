// Grabación de audio de la visita. El audio se guarda solo en este dispositivo
// (IndexedDB): no se sube a ningún servidor ni se sincroniza con la cuenta.

const BD = "novalis-grabaciones";
const ALMACEN = "audios";

function abrir() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

async function operar(modo, accion) {
  const bd = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(ALMACEN, modo);
    const peticion = accion(tx.objectStore(ALMACEN));
    tx.oncomplete = () => {
      bd.close();
      resolver(peticion.result);
    };
    tx.onerror = tx.onabort = () => {
      bd.close();
      rechazar(tx.error);
    };
  });
}

// Cada cuenta tiene sus propias grabaciones.
const clave = (visitaId) => window.novalisClave?.(`audio:${visitaId}`) || `audio:${visitaId}`;

export const guardarAudio = (visitaId, blob) => operar("readwrite", (a) => a.put(blob, clave(visitaId)));
export const leerAudio = (visitaId) => operar("readonly", (a) => a.get(clave(visitaId))).catch(() => null);
export const borrarAudio = (visitaId) => operar("readwrite", (a) => a.delete(clave(visitaId))).catch(() => null);

export function puedeGrabar() {
  return !window.novalisSinMicrofono && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

export function duracionLegible(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function extensionDe(tipo) {
  return /mp4|aac|m4a/.test(tipo || "") ? "m4a" : /ogg/.test(tipo || "") ? "ogg" : "webm";
}

// Pide el micrófono y empieza a grabar. Devuelve los mandos de la grabación.
export async function empezarGrabacion() {
  const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
  const grabadora = new MediaRecorder(flujo, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
  const trozos = [];
  grabadora.addEventListener("dataavailable", (e) => e.data.size && trozos.push(e.data));

  // El tiempo se cuenta aparte para descontar las pausas.
  let acumulado = 0;
  let desde = performance.now();
  let pausada = false;
  const segundos = () => (acumulado + (pausada ? 0 : performance.now() - desde)) / 1000;

  // Mantiene la pantalla encendida: si el móvil se bloquea, el navegador corta la grabación.
  let bloqueo = null;
  const pedirBloqueo = async () => {
    try {
      bloqueo = await navigator.wakeLock?.request("screen");
    } catch {
      bloqueo = null;
    }
  };
  const alVolver = () => {
    if (!document.hidden && grabadora.state !== "inactive") pedirBloqueo();
  };
  document.addEventListener("visibilitychange", alVolver);
  await pedirBloqueo();

  grabadora.start(1000);

  return {
    segundos,
    estaPausada: () => pausada,
    pausar() {
      if (pausada || grabadora.state !== "recording") return;
      grabadora.pause();
      acumulado += performance.now() - desde;
      pausada = true;
    },
    reanudar() {
      if (!pausada || grabadora.state !== "paused") return;
      grabadora.resume();
      desde = performance.now();
      pausada = false;
    },
    detener() {
      return new Promise((resolver) => {
        const duracion = segundos();
        const terminar = () => {
          flujo.getTracks().forEach((pista) => pista.stop());
          document.removeEventListener("visibilitychange", alVolver);
          bloqueo?.release?.().catch(() => {});
          const tipoFinal = grabadora.mimeType || tipo || "audio/webm";
          resolver({ blob: new Blob(trozos, { type: tipoFinal }), duracion, tipo: tipoFinal });
        };
        if (grabadora.state === "inactive") return terminar();
        grabadora.addEventListener("stop", terminar, { once: true });
        grabadora.stop();
      });
    },
  };
}
