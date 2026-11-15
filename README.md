# Novalis Aprende

App para entrenar la comunicación con los pacientes.

- **Temas**: cada tema tiene su texto, un audio narrado y un examen. Las preguntas tipo test se corrigen solas; las de desarrollo muestran los criterios para autocorregirse.
- **Guía**: se añade un paciente nuevo y una plantilla guía la primera visita paso a paso, con las frases, los puntos de control, lo que hay que evitar y apuntes por paso. Incluye un caso de ejemplo para practicar.
- **Grabación**: en la versión web, la guía puede grabar el audio de la visita (con el consentimiento del paciente) y marca en qué momento empieza cada paso. Después se revisa paso a paso: se escucha, se marca lo que de verdad se cumplió y se anota la corrección. El audio se guarda solo en el dispositivo donde se graba.
- **Historial**: todas las primeras visitas, con su resultado, los mensajes de seguimiento, los recordatorios y los puntos que más se resisten.
- **Practicar con una IA**: desde el historial se descarga o se copia un archivo con el método, las visitas y el temario para adjuntarlo a una conversación con cualquier IA y practicar en modo charla.

## Ponerla en marcha

```bash
npm install
cp .env.example .env   # y rellena las claves
npm start              # http://localhost:3000
```

La web necesita las dos variables públicas de Supabase para permitir el acceso.
La app no usa ningún servicio de IA: no necesita claves ni cuentas de proveedores.

## Dónde está el contenido

```
contenido/
  fuentes/                 texto de cada fuente (.md o .txt)
  temas/
    01-nombre-del-tema/
      tema.md              texto del tema (con cabecera titulo / resumen)
      examen.json          preguntas del examen
      audio.mp3            narración (se genera con npm run audio)
  flujo.json               pasos de la primera visita, puntos de control y caso guiado
```

La web requiere Supabase y una cuenta confirmada. Las visitas se guardan en el
navegador donde se anotan y se sincronizan con la cuenta. Cada alumno sincroniza sus
visitas, notas de examen, caso práctico, borrador y valoración entre dispositivos.
El chat y el código de acceso no se sincronizan. Los datos locales están separados
por cuenta. Los registros previos de invitado se mantienen separados de la cuenta.
Las primeras visitas se guardan bajo la clave `visitas`; los registros anteriores a la guía por paciente se convierten al abrirlos.

## Acceso desde móvil y iPad

La versión web exige registro con correo y contraseña, confirmación del correo e
inicio de sesión. Los contenidos y audios también comprueban la sesión en el
servidor. La recuperación de contraseña se solicita desde la pantalla de acceso.

En **Ajustes → Usuarios y permisos**, el administrador autoriza previamente los
correos que pueden registrarse. El alta se comprueba también en el trigger de
Supabase, por lo que no se puede eludir usando directamente la API. Se puede
retirar una autorización pendiente; las cuentas ya creadas se bloquean con
**Desactivar acceso**. Autorizar un correo no envía una invitación automáticamente.

El administrador ve las cuentas y puede activar o desactivar usuarios. Los roles
no se leen de metadatos editables. El correo reservado para el administrador se
configura en `private.ajustes_acceso`, nunca en el código público. El registro
crea su perfil; para entrar debe confirmar el correo y elegir su propia contraseña.
El panel no muestra las notas libres ni las visitas de otras cuentas.

Tras la migración inicial de progreso, ejecuta también
`supabase/migrations/20261114155643_acceso_usuarios.sql`. Desde SQL Editor, configura
el correo del administrador con una consulta privada:

```sql
update private.ajustes_acceso set email_admin = lower('correo-del-administrador') where unico;
-- Si la cuenta ya existía, asigna el rol a ese perfil concreto:
update public.perfiles set rol = 'admin' where email = (select email_admin from private.ajustes_acceso where unico);
```

Después ejecuta `supabase/migrations/20261114161915_correos_autorizados.sql` para
exigir autorización previa a cada nuevo registro. El correo reservado para el
administrador puede crear la cuenta inicial sin autorización de otra persona.

El servicio usa las variables configuradas en Render. `render.yaml` queda como
plantilla para despliegues nuevos; el servicio actual se creó desde el panel.

Consulta [PUBLICAR.md](PUBLICAR.md) para configurar Supabase y publicar el servidor.
Se incluye `render.yaml` para Render. La identidad visual utiliza el logotipo
facilitado por Novalis, su azul corporativo y una interfaz adaptada a pantallas táctiles.

La sincronización se realiza al entrar, al guardar, al volver a la pestaña y al
recuperar conexión. También se puede pulsar «Sincronizar ahora». Si dos dispositivos
modifican la misma sección sin haberse sincronizado, se pide elegir qué versión
conservar antes de reemplazarla. No hay actualización en tiempo real de una pantalla
que permanezca abierta en primer plano. Los cambios sin conexión quedan pendientes
en el dispositivo; no debe borrarse el almacenamiento del navegador antes de subirlos.

Los temas se ordenan por el nombre de la carpeta. Formato de `examen.json`:

```json
{
  "preguntas": [
    { "tipo": "test", "enunciado": "…", "opciones": ["…", "…"], "correcta": 0, "explicacion": "…" },
    { "tipo": "desarrollo", "enunciado": "…", "criterios": "Qué debe incluir una buena respuesta" }
  ]
}
```

## Generar los audios

```bash
npm run audio                 # temas sin audio o con el texto cambiado
npm run audio -- 01-mi-tema   # solo un tema
npm run audio -- --forzar     # regenerar todo
```

Por defecto usa ElevenLabs (`ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` con una
voz masculina de España de su biblioteca). Con `TTS_PROVEEDOR=azure` usa Azure
Speech con la voz `es-ES-AlvaroNeural`. Mientras un tema no tiene audio, la app
ofrece leerlo con la voz del navegador.

## Publicarla

Es un servidor Node sin paso de compilación: sirve en cualquier alojamiento que
ejecute `npm start` (Render, Railway, Fly.io…). Define allí las variables de
`.env.example`. El acceso al curso se controla mediante las cuentas de Supabase.

## Versión como página de Claude

`node scripts/exportar-pagina.mjs <carpeta>` genera la app en una sola página,
sin servidor, para publicarla como artefacto privado de Claude con las
capacidades `db`, `user` y `downloads`. En esa versión las visitas y las notas
de examen se guardan en la carpeta privada del usuario en la base de datos de
la página, y la descarga del material de práctica la gestiona la propia página.

## Pruebas

```bash
npm test
```
