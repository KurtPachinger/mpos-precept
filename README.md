# mpos-precept
Imposter DOM rects in THREE
```js
// Initialize containers and EventListeners
const proxy = { scene: scene, camera: camera, renderer: renderer }
mpos.init( /*proxy*/ )

// Add element (and children) to scene
const opts = {
  grade: null,
  depth: 32,
  parse: function( comment ){ /*data*/ }
}
mpos.mod.add( 'main', opts )
```

### tools
```js
const rect = mpos.fnVar('find', '123', {})
const deep = mpos.fnVar('march', '#host', {})
const nest = mpos.fnVar('chain', '#host', { count: 8, symbol: 'last' })
```

### grade
```mermaid
flowchart TB

window-.-selector
subgraph selector
 direction TB
 parent--depth-->child
 child--maxRes-->parent
end

grade("sanitize, transform")
selector-->grade-->a

subgraph type
  direction TB
  a("1x: structure, visibility")
  grade-.-tag{blacklist}
  a-->b{interactive}
  b--no---poster("2x: img, text")
  b--yes---native("3x: form, video")
  native-->c{cors}
end

c-.yes-.->CSS3DRenderer
c--no--->html-to-image
poster-->html-to-image
a-->loader
```
### applications
- menus: runtime, dynamic, translate, filesize, outsource, mixed-media
- sentiment analysis: simulate, augment, local
- advertise: immersive, context-aware
- game: environment, prototype
- test suite: comps, spec sheet
