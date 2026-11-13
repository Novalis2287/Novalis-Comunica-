# Novalis Comunica

App para entrenar la comunicación con los pacientes.

- **Temas**: cada tema tiene su texto y un audio narrado por una voz de profesor (hombre, acento de España).
- **Examen**: preguntas tipo test y de desarrollo por tema, con nota sobre 10. Las de desarrollo las corrige la IA.
- **Profesor**: chat con una IA que conoce todas las fuentes del curso, para preguntar y debatir.

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
```

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

## Pruebas

```bash
npm test
```
