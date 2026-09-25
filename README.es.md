# motion-reel

Una skill para agentes que crea **sitios web y videos generados con código, con nivel de motion designer profesional**: cortes secos entre colores a pantalla completa, tipografía cinética ultra gruesa, HUD en las esquinas, partículas, transformación de formas y shaders 3D con estética de impresión risográfica. Todo el movimiento está sincronizado a un tempo musical. Funciona con cualquier marca y paleta.

> [Read in English](README.md)

## Camino rápido

1. Instalá la skill:
   ```bash
   git clone https://github.com/benjatestaferri7/motion-reel ~/.claude/skills/motion-reel
   ```
2. Abrí cualquier proyecto en Claude Code y pedí:
   > Usá motion-reel para rediseñar esta landing.
3. Respondé dos preguntas, de a una:
   - **Estilo:** Swiss Kinetic, Riso Shader, Híbrido o Sorprendeme.
   - **Paleta:** tu color de marca, un preset o Sorprendeme.
4. El agente construye el resultado y lo verifica con capturas automáticas o una hoja de contactos del video antes de entregarlo.

Si la querés solo para un proyecto, cloná la skill en `<proyecto>/.claude/skills/motion-reel`.

## Qué puede hacer

| Salida | Ejemplos |
|--------|----------|
| Sitio web | Rediseños de landings en cualquier stack (incluye plantillas React/Next; los patrones se adaptan a Vue, Svelte, Astro o HTML plano) |
| Video | Showreels de 15–45 s, clips de lanzamiento y promos para redes en 16:9, 4:5 y 9:16, con audio sintetizado |
| Ambos | El video sirve de storyboard y el sitio reutiliza las mismas escenas |

## Estilos

| Estilo | Estética | Ideal para |
|--------|----------|------------|
| **Swiss Kinetic** | Cortes de color planos, mayúsculas anchas gigantes, ecos en contorno, estiramiento por eje de ancho, texto que se descifra, UI de editor de curvas, túneles en perspectiva | Estudios, SaaS, lanzamientos, portfolios |
| **Riso Shader** | Esferas trazadas por rayos en WebGL2 puro, impresión de 3 tintas con trama de puntos, corrimiento de planchas, grano de papel | Marcas que buscan un 3D táctil, tipo póster, sin dependencias |
| **Híbrido** | Fondos de shader con tipografía cinética encima | Heros y campañas premium |

## Paletas

Las paletas se arman con cuatro **roles** (`ink`, `bone`, `action`, `machine`), nunca con colores fijos. El color del texto sobre cada fondo se elige según el contraste WCAG.

```bash
node assets/palette/palette.mjs --list                                  # 15 presets curados
node assets/palette/palette.mjs --brand "#1DB954" --format css          # a partir de tu marca
node assets/palette/palette.mjs --surprise --mood "wellness calm" --seed 3
```

Formatos de salida: `css` (variables CSS), `tailwind`, `config` (para la plantilla de video) y `json` (incluye matriz de contraste).

## Requisitos

| Herramienta | Para qué |
|-------------|----------|
| Un agente compatible con skills `SKILL.md` (hecha para Claude Code) | Todo |
| Node.js 18+ | Paletas, render de video, capturas de QA |
| Chrome, Brave o Chromium | Render de video y QA sin ventana (se detecta automáticamente) |
| ffmpeg | Codificación de video |
| Python 3 (numpy opcional) | Banda sonora sintetizada |

**Plataformas:** macOS y Linux funcionan sin configuración. En Windows, los scripts de Node corren en PowerShell, pero `contact-sheet.sh` necesita WSL o Git Bash. Si no se encuentra el navegador, definí `BROWSER_PATH`. En Docker o CI corriendo como root, los flags de sandbox se agregan solos (o definí `NO_SANDBOX=1`).

## Estructura

```
motion-reel/
├── SKILL.md                  # Contrato que sigue el agente
├── references/               # Sistema de diseño, paletas, web, video, shader
└── assets/
    ├── palette/              # palette.mjs + presets.json (sin dependencias)
    ├── web/                  # Componentes React/TS: HUD, partículas, morphs, túnel, cortes glitch…
    ├── video/reel-template/  # Reel en canvas determinístico → navegador sin ventana → ffmpeg
    ├── shader/               # Riso Shader (WebGL2) independiente + wrapper React
    └── qa/                   # Scripts de capturas y hojas de contactos
```

## Principios que aplica

- Un solo movimiento protagonista por escena, alternando escenas intensas y tranquilas.
- Todo cae sobre una grilla de tiempos musicales, y cada pose clave se sostiene al menos un tiempo.
- Respeta `prefers-reduced-motion`, pausa los canvas fuera de pantalla y evita el scroll horizontal en celulares.
- Nunca inventa testimonios, métricas ni clientes.
- Evita los clichés típicos del diseño hecho con IA: degradados violetas, glassmorphism, filas de tres tarjetas con íconos y similares.

## Créditos

Esta skill nació de los posts de septiembre de 2026 sobre el "showreel de motion designer de Opus 5.5" de [@shneural](https://x.com/shneural/status/2103151003272962130), [@aiehon_aya](https://x.com/aiehon_aya/status/2103403361022419005), [@Fujin_Metaverse](https://x.com/Fujin_Metaverse/status/2103325252415860767) y [@akiy_8](https://x.com/akiy_8/status/2103434383218872503). Sus prompts y explicaciones mostraron lo que este pipeline podía hacer.

## Licencia

[Apache-2.0](LICENSE)
