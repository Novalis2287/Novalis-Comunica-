# Novalis Comunica

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

Sin claves la app funciona igualmente para leer y hacer los test; el profesor y
la corrección de preguntas de desarrollo necesitan `ANTHROPIC_API_KEY`.

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

Las visitas registradas se guardan en el navegador del dispositivo donde se
anotan. Al profesor se le envían sin el identificador del paciente.

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
`.env.example` y pon un `CODIGO_ACCESO` para que solo tú puedas usar el profesor.

## Versión como página de Claude

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
