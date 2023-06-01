# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart TB

window-.-selector
subgraph selector
 direction TB
 child--softmax-->parent
 parent--depth-->child
end

grade("Pre-grade. Sanitize.")
selector-->grade-->a

subgraph type
  direction TB
  a("1x: structure, viewport")
  grade-.-tag{blacklist}
  a-->b{interactive}
  b--no---poster("2x: img, text")
  b--yes---native("3x: form, video")
end

poster-->html-to-image
native-->CSS3DRenderer
```
|| usage | selector |
| :-- | :-- | :-- |
|| depth ||
| `allow` | whitelist | `.allow, div, main, section, article, nav, header, footer, aside, tbody, tr, th, td, li, ul, ol, menu, figure, address` |
| `block` | blacklist | `.block, canvas[data-engine~='three.js'], head, style, script, link, meta, applet, param, map, br, wbr, template` |
|| quality ||
| `native` | CSS3DRenderer | `.native, a, iframe, frame, embed, object, svg, table, details, form, dialog, video, audio[controls]` |
| `poster` | html-to-image | `.poster, .pstr, canvas, picture, img, h1, h2, h3, h4, h5, h6, p, ul, ol, th, td, caption, dt, dd` |
| `native3d` | environment | `model-viewer, a-scene, babylon, three-d-viewer, #stl_cont, #root, .sketchfab-embed-wrapper, StandardReality` |
