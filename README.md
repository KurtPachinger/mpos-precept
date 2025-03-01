# mpos-precept
Imposter DOM rects in THREE. Synthetic event dispatch.

### Usage
```js
// Initialize containers and EventListeners
const proxy = { scene: scene, camera: camera, renderer: renderer }
mpos.init( /*proxy*/ )

// Add element (and children) to scene
const opts = {
  depth: 32,
  parse: function( comment ){ /*data*/ }
  /* grade: inject */
}
mpos.mod.add( 'main', opts )
```

### Markup
```html
<!-- Loads mime as OpenCV to create Paths -->
<img class="mp-loader" src="./Lena.jpg" />

<!-- Loads mime as JSONLoader -->
<object class="mp-loader" data="./Model.json"></object>

<!-- Precept match CORS sets CSS3D -->
<div class="yt mp-native"><iframe src="//youtube.com/embed/joOIBteSo1w"></iframe></div>

<!-- Precept allows terminal form and terminates allowed div -->
<form class="mp-allow">
  <div class="mp-poster"><a>sprite</a></div>
  <div class="mp-poster"><a>sprite</a><a>sprite</a></div>
</form>

<!-- Node is parsed -->
<!--//__THREE__ let value; mpos.fnVar('error', value); -->
```

### Tools
```js
// Element rect, with current meta
const rect = mpos.fnVar( 'find', '0' )

// Element depth, to root and from slot
const deep = mpos.fnVar( 'march', '#host' )

// Element helper, to cast hierarchy
const link = mpos.fnVar( 'chain', '#host', { count: 8, symbol: 'last' } )
```

### Features
- [Precept Grade](https://github.com/KurtPachinger/mpos-precept/wiki/Process-Flow#precept-grade):
  - Tags allow user to specify node usage. Elements may be ignored, loaded as paths, or updated every frame.
  - Loader supports/converts media types: OpenCV, GIF, MP4, JSON, CSS3D.
  - Texture atlas sets tiered cell area. Interface shows element visibility.
- [Sync Frame](https://github.com/KurtPachinger/mpos-precept/wiki/Process-Flow#sync-frame):
  - inPolar: Limit visible to user viewport
  - css: Styles propagate (matrix, pseudo) for event synthesis
  - time: FPS cues optimize performance
  - differ: Detect active features and reduce frame updates
  - toSVG: Options qualify diverse metadata
