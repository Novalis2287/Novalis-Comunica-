import { createClient } from "@supabase/supabase-js";

export function tokenDePeticion(req) {
  const cabecera = req.get("authorization");
  if (cabecera) return /^Bearer ([^\s]+)$/i.exec(cabecera)?.[1] || "";
  const cookie = (req.get("cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith("novalis_sesion="));
  return cookie?.slice("novalis_sesion=".length) || "";
}

export function crearAcceso({ url, key, fabrica = createClient }) {
  return async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!url || !key) return res.status(503).json({ error: "El acceso de Novalis Aprende aún no está configurado." });
    const token = tokenDePeticion(req);
    if (!token) return res.status(401).json({ error: "Inicia sesión para acceder.", requiereSesion: true });
    try {
      const cliente = fabrica(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: (ruta, opciones) => fetch(ruta, { ...opciones, signal: AbortSignal.timeout(12000) }),
        },
      });
      const { data, error } = await cliente.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: "La sesión ha caducado. Vuelve a entrar.", requiereSesion: true });
      if (!data.user.email_confirmed_at) return res.status(403).json({ error: "Confirma tu correo electrónico antes de entrar." });
      const perfil = await cliente.from("perfiles").select("id,email,rol,activo").eq("id", data.user.id).single();
      if (perfil.error) return res.status(503).json({ error: "No se pudo comprobar tu cuenta. Inténtalo de nuevo." });
      if (!perfil.data?.activo) return res.status(403).json({ error: "Tu cuenta está desactivada. Contacta con el administrador." });
      req.cuenta = { cliente, perfil: perfil.data, token };
      next();
    } catch {
      res.status(503).json({ error: "No se pudo comprobar la sesión. Inténtalo de nuevo." });
    }
  };
}

export function exigirAdministrador(req, res, next) {
  if (req.cuenta?.perfil.rol !== "admin") return res.status(403).json({ error: "Solo el administrador puede acceder a esta sección." });
  next();
}
