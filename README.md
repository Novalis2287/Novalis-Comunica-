# Novalis Aprende

App para entrenar la comunicación con los pacientes.

- **Temas**: cada tema tiene su texto y un audio narrado por una voz de profesor (hombre, acento de España).
- **Examen**: preguntas tipo test y de desarrollo por tema, con nota sobre 10. Las de desarrollo las corrige la IA.
- **Profesor**: chat con una IA que conoce todas las fuentes del curso, para preguntar y debatir.
- **Visita**: el flujo de la primera visita paso a paso. Se puede recorrer con un caso guiado, decidiendo qué hacer en cada momento, o usar como guía en consulta marcando los puntos que se cumplen.
- **Seguimiento**: registro de las visitas reales, con el cumplimiento por paso, los puntos a reforzar y la valoración del profesor según los avances.

## Ponerla en marcha

```bash
npm install
cp .env.example .env   # y rellena las claves
npm start              # http://localhost:3000
```

La web necesita las dos variables públicas de Supabase para permitir el acceso.
El profesor web funciona localmente con WebLLM 0.2.88 y Qwen2.5 1.5B Instruct cuantizado a 4 bits. No necesita claves ni cuentas de proveedores de IA. En Profesor, pulsa «Descargar y preparar profesor» en cada dispositivo. La primera descarga proviene de Hugging Face y MLC; el navegador guarda el modelo en caché, pero puede borrarlo. La inferencia usa WebGPU en un worker. Necesita HTTPS, un navegador compatible con shader-f16 y memoria disponible; no se promete compatibilidad ni velocidad hasta probar el dispositivo real.

Esta integración es una prueba. Se seleccionan fragmentos del temario para limitar el contexto; no se carga el contenido completo en cada respuesta. Las correcciones de desarrollo son orientativas y se validan antes de puntuar. El profesor genera el texto en el dispositivo. El temario sigue requiriendo una sesión activa y conexión con el servidor, y el progreso sincronizado usa Supabase. El chat se guarda solo en el navegador por cuenta. El modelo de IA no recibe datos desde un proveedor externo; descarga sus archivos públicos antes de funcionar.

Se han comprobado la recuperación de fragmentos, el contrato de corrección y la interfaz con un motor simulado. La generación real y su calidad en iPhone/iPad requieren validación en los equipos del usuario. Referencias: https://github.com/mlc-ai/web-llm y https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct (licencia Apache 2.0).

## Dónde está el contenido

```
contenido/
  fuentes/                 texto de cada fuente (.md o .txt); lo lee el profesor
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
Al profesor se le envían las visitas sin el campo identificador del paciente.

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

## Exportador legado como página de Claude

`node scripts/exportar-pagina.mjs <carpeta>` genera la app en una sola página,
sin servidor, para publicarla como artefacto privado de Claude con las
capacidades `sample`, `db` y `user`. En esa versión:

- El profesor responde con la cuenta de Claude de quien abre la página; no hace
  falta clave de API ni alojamiento.
- Las visitas, las notas de examen y la valoración se guardan en la carpeta
  privada del usuario en la base de datos de la página, y se ven en todos sus
  dispositivos.

## Pruebas

```bash
npm test
```
