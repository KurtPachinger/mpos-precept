import './mpos.css'
// ...OpenCV, SuperGif

import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'

import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import { toSvg, toCanvas, getFontEmbedCSS } from 'html-to-image'
import { parseGIF, decompressFrames } from 'gifuct-js'

const mpos = {
  fnVar: function (tool, value, opts = {}) {
    //
    // Syntactic Suger: allow keys and map variable scope

    if (value === null || value === undefined) {
      console.log(tool + ': bad value')
      return
    }

    // filter user variables from core
    opts.var = this.var
    opts.value = value
    switch (tool) {
      case 'march':
        opts.precept = this.mod.precept
        break
      default:
      // opts.grade = ?
    }

    // Tool use
    // note: find Object3D ...but... march/chain query DOM
    if (['march', 'chain'].includes(tool) && typeof value === 'string') {
      // permit element or selector
      value = document.querySelector(value)
    }

    //
    // use tool
    const fnvar = this.var.tool[tool]
    const response = fnvar ? fnvar(value, opts) : 'no fnVar'
    console.log('tool ' + tool, opts.value, response)
    return response
  },
  var: {
    batch: 0,
    cache: new Map(),
    time: {
      sFence: new THREE.Clock(), // update (interval) and share (with nominal) via oldTime
      sFenceDelta: 0,
      sFenceFPS: 1 / 60, // 60 fps
      sFenceFPS_slice: { boundary: 0, gate: Infinity, ramp: 0, quota: { count: 0, average: 0 } },
      slice(boundary, gate) {
        //
        // Slice Disabled (Experimental):
        // Don't "optimize" sync, potentially skipping frames
        // which affects (variable) framerate.
        // Guarantees constant feedback (i.e. native form gripper),
        // but overhead tends to produce more delayed effects...
        // ...which may be mitigated by mip level, quality toSvg, or user-level code.
        if (!mpos.var.opt.slice) return true

        // bitmask power: %1==60fps || %2==30fps || %4==15fps
        const slice = this.sFenceFPS_slice
        boundary = slice.boundary % boundary === 0
        if (gate !== undefined) {
          // match status of boundary gate (not ramp)
          gate = gate ? slice.gate === true : slice.gate === Infinity
        } else {
          gate = true
        }

        return boundary && gate
      }
    },
    fov: {
      basis: 1024,
      dpr: Math.min(devicePixelRatio, 1),
      width: window.innerWidth,
      height: window.innerHeight,
      z: 8
    },
    opt: {
      request: 'xml_guide.html',
      selector: 'main',
      custom: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 6,
      inPolar: 4,
      arc: 0.0,
      delay: 16.666,
      slice: true,
      update: function () {
        //
        // GUI Options Panel
        let selector = this.selector
        const options = { depth: this.depth }

        if (this.selector === 'custom') {
          // Document from URI (CORS?)
          if (this.custom.startsWith('//') || this.custom.startsWith('http')) {
            //|| this.custom === '#fragment'
            // '#custom template'
            selector = '#custom object'
            options.custom = this.custom
          } else {
            selector = this.custom
          }
        }

        mpos.mod.add(selector, options).then((res) => {
          mpos.step.sync(res)
        })
      }
    },
    reset: {
      margin: 'initial',
      transform: 'initial',
      //display: 'block',
      imageRendering: 'pixelated'
    },
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({
      color: 'cyan'
    }),
    mat_shape: new THREE.MeshBasicMaterial({ alphaHash: true }),
    mat_line: new THREE.MeshBasicMaterial({
      color: 'cyan',
      wireframe: true
    }),
    mat_shader: new THREE.RawShaderMaterial({
      //discourse.threejs.org/t/13221/18
      //discourse.threejs.org/t/33191/12
      uniforms: {
        map: {
          type: 't',
          value: null
        },
        atlasSize: {
          type: 'f',
          value: null
        }
      },
      vertexShader: `precision highp float;

      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;

      attribute vec3 position;
      attribute vec2 uv;
      attribute mat4 instanceMatrix;
      attribute vec3 uvOffset;

      uniform float atlasSize;
      varying vec2 vUv;

      void main()
      {
        vUv = vec2(uvOffset.x, uvOffset.y) + ((uv* uvOffset.z) / atlasSize ) ;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
      `,
      fragmentShader: `precision highp float;

      varying vec2 vUv;
      uniform sampler2D map;
      
      void main()
      {
        gl_FragColor = texture2D(map, vUv);
      }
      `
    }),
    tool: {
      //
      // Tools and fnVar: compatibility or direct access?
      avg: function (val, acc) {
        // moving average
        let avg = acc.average + (val - acc.average) / (1 + acc.count)
        // moving average
        acc.average = avg
        acc.count++
      },

      chain: function (element, opts = {}) {
        // chain of elements to count
        let nodeName = opts.nodeName || 'mp'
        let chains = document.createElement(nodeName)
        chains.classList.add('mp-allow', 'march')
        let last = chains
        while (--opts.count > 0) {
          let chain = document.createElement(nodeName)
          chain.classList.add('mp-allow', 'p')
          if (opts.count % 2 === 0) {
            chain.classList.add('odd')
          }
          // path scatter sample (no pointerevents)
          chain.innerHTML += `<mp class='k'>${opts.count}</mp>`

          last.append(chain)
          last = chain
        }

        last.classList.add('last')
        last.innerHTML += opts.symbol || ''
        if (element) element.prepend(chains)

        return chains
      },
      find: function (term, opts = {}) {
        // find rects by key
        let rect

        const grade = opts.var.grade

        if (term === 'first' || term === 'last') {
          const rects = Array.from(grade.rects)
          const position = term === 'first' ? 0 : rects.length - 1
          rect = rects[position][1]
        } else if (term === 'atlas' || term === 'other') {
          rect = grade.major[term]
        } else {
          rect = grade.rects.get(term)
        }

        return rect
      },
      march: function (element, opts = {}) {
        const { grade, opt } = opts.var
        const depth = grade?.depth || opts.depth || opt.depth

        //
        // z relative to root(s) and slot depth(s)
        let inner = element
        const outer = grade?.el || document.querySelector(opt.selector) || document.body
        const m = { root: 0, slot: 0 }
        while (m.root < 32 && inner && inner.parentElement && !inner.isSameNode(outer)) {
          m.root++
          inner = inner.parentElement.closest(opts.precept.allow)
        }

        m.slot = depth - m.root

        return m
      },
      diffs: function (type, opts = {}) {
        let differ = false
        const rect = opts.rect
        const style = rect.css.style || rect.el.style // computed or direct if not priority

        //
        // Different from Baseline Generic Primitive

        if (type === 'rect') {
          // should TRUE indicate need for action, like other diffs, despire FALSE being the problem?
          //rect.el.naturalWidth, rect.el.naturalHeight

          // WARNING: bipolar feature test... not to be passed to ux.u?
          // force flush, similar to syncFPS===0 (but saved rect)
          // - NO ATLAS CELL (UX.CHANGE/PRIOR) AND MUST SET: frame:-1 :
          // - NO SIZE ELEMENT AND MUST SET: ATLAS?
          //

          differ = !rect.el.clientWidth || !rect.el.clientHeight
          // note: opts.whitelist quirks ( || el.matches('a, img, object, span, xml, :is(:empty)' )
        } else if (type === 'matrix') {
          // note: style source may re-prioritize by accumulating frames
          const newFrame = rect.frame === -1
          const newBound = rect.bound.width / rect.bound.height !== rect.el.offsetWidth / rect.el.offsetHeight
          differ = newFrame || newBound || style.transform?.startsWith('matrix')
        } else if (type === 'tween') {
          // note: loose definition
          // ...transform, filter, overlay, allow-discrete
          const keyframes =
            (style.transitionProperty !== '' && parseFloat(style.transitionDuration) > 0) ||
            (style.animationName !== 'none' && style.animationPlayState === 'running')
          differ = keyframes
        } else if (type === 'flow') {
          // note: if position overflows scrollOffset, canvas may not draw
          differ = style.zIndex >= 9 && (style.position === 'fixed' || style.position === 'absolute')
          //&& !!(parseFloat(style.top) || parseFloat(style.right) || parseFloat(style.bottom) || parseFloat(style.left))
        } else if (type === 'pseudo') {
          // note: get pseudo capture once per frame for all rects
          let css = rect.css
          if (css) {
            // deepest pseudo match: pass an object (to avoid per-element / per-frame)
            const root = rect.el.parentElement || document.body // note: document.body is excessive, but may prevent error in a loop
            let capture = opts.capture || {
              hover: [...root.querySelectorAll(':hover')].pop(),
              active: [...root.querySelectorAll(':active')].pop(),
              focus: [...root.querySelectorAll(':focus')].pop()
            }

            // note: pseudo (or unset prior frame) enqueued for atlas
            differ = rect.el === capture.active || rect.el === capture.focus || (rect.el === capture.hover && rect.minor === 'poster')
          }
        }

        //
        // WARNING: direct update to rect
        // ?? duplicate access get/set per frame ??
        differ ? rect.ux.u.add(type) : rect.ux.u.delete(type)

        if (opts.node) {
          // todo: node may be set manually
          // check on tail, so other updates (like pseudo) bubble to queue
          differ = differ || opts.node.classList.contains('mp-diff')
        }

        return differ
      },
      dpr: function (distance) {
        const { fov, camera, grade } = mpos.var
        //
        // todo: could be used for anisotropy
        const dprPractical = (fov.width + fov.height) / 2
        const camPosition = camera.position
        const distanceZ = camPosition.distanceTo({ x: camPosition.x, y: camPosition.y, z: 0 })
        let distanceTarget = grade?.group.position || { x: 0, y: 0, z: 0 }
        let sample = distance || camPosition.distanceTo(distanceTarget)

        const eDPI = dprPractical / ((sample + distanceZ) / 2)
        fov.dpr = Math.max(Math.min(eDPI, 1), 0.5)
      },
      resort(object) {
        //
        // Structure of Map requires coercion: for access by index, reverse-order, or other query set
        const array = []
        Array.from(object)
          .flat()
          .forEach((rect) => {
            if (rect.el) array.push(rect.el)
          })
        return array
      },
      old: function () {
        const { scene, grade } = mpos.var
        //console.log(mpos.var.renderer.info)
        return new Promise((resolve, reject) => {
          // dispose of scene and release listeners
          const groups = scene?.getObjectsByProperty('type', 'Group')

          if (groups && groups.length) {
            for (let g = groups.length - 1; g >= 0; g--) {
              const group = groups[g].children || []
              for (let o = group.length - 1; o >= 0; o--) {
                const obj = group[o]
                if (obj.type === 'Mesh') {
                  const material = obj.material
                  // Cache flag from loader asset to dispose...?
                  let cache
                  if (material.length) {
                    for (let m = material.length - 1; m >= 0; m--) {
                      const mat = material[m]
                      if (mat) {
                        // ...?
                        //cache = mat.userData.cache
                        // cubemap front [5]
                        mat.canvas && (mat.canvas = null)
                        mat.map && mat.map.dispose()
                        // shader
                        mat.userData.s && mat.userData.s.uniforms.texAtlas.value.dispose()
                        mat.userData.t && mat.userData.t.dispose()
                        mat.dispose()
                      }
                    }
                  } else {
                    // ...?
                    //cache = material.userData.cache
                    // front
                    //if (!cache) {
                    material.map && material.map.dispose()
                    material.dispose()
                    //}
                  }

                  // Loader rules...?
                  if (obj.animate?.gif) {
                    // Cache loader SuperGif case study:
                    // hogs memory, frames backwards reused, strange loader signature...?
                    //obj.animate.gif.pause()
                    obj.animate.gif = obj.animate.context = obj.animate.patch = null
                  }
                  //
                  cache = obj.userData.cache
                  if (!cache) {
                    obj.geometry.dispose()
                  }
                }
                obj.removeFromParent()
              }
              groups[g].removeFromParent()
            }
          }

          let canvas = grade?.atlas?.canvas
          if (canvas) {
            //
            // Canvas
            //const ctxC = grade.atlas.ctx
            //ctxC.clearRect(0, 0, ctxC.width, ctxC.height)
            //grade.atlas.ctx.reset()
            canvas.remove()
            canvas = null
            // note: more grades would destroy canvases
            //grade.atlas.canvas = grade.ctx = null
          }

          //
          // CSS3D
          const css3d = mpos.var.rendererCSS.domElement
          //const clones = css3d.querySelectorAll(':not(.mp-block)')
          css3d.querySelectorAll('[data-batch]').forEach((el) => {
            el.firstElementChild.remove()
            el.parentElement.removeChild(el)
            el = null
          })

          // Shader Atlas
          //let atlas = document.getElementById('atlas').children
          //for (let c = atlas.length - 1; c >= 0; c--) {
          // atlas[c].parentElement.removeChild(atlas[c])
          //}
          document.querySelectorAll('[data-idx]').forEach((el) => el.removeAttribute('data-idx'))
          mpos.ux.observer?.disconnect()

          //
          // Performance ResourceTiming
          // - clear it
          // - entries against DOM to release last batch
          function resourceUse(initiatorType = ['img', 'source', 'object', 'iframe']) {
            const entries = []

            /*'fetch','xmlhttprequest','script'*/
            for (const res of window.performance.getEntriesByType('resource')) {
              const media = initiatorType.indexOf(res.initiatorType) > -1
              if (media) {
                const name = res.name.split('/').pop()
                if (!document.querySelector(`[src$="${name}"], [data$="${name}"]`)) {
                  // none use
                  //console.log('none:', res.initiatorType, name, res.name)
                } else {
                  // some use and parent
                  ;['src', 'data'].forEach((attr) => {
                    let els = document.querySelectorAll(`[${attr}$="${name}"]`)
                    if (els.length) {
                      //console.log('some:', els)
                      els.forEach((el) => {
                        //console.log('parent:', el.parentNode)
                      })
                      entries.push(els)
                    }
                  })
                }
              }
            }

            //console.log('entries:', entries)
            performance.clearResourceTimings()
            return entries
          }

          //resourceUse()

          resolve('clear')
          reject('no')
        })
      },
      pyr: function (width, height, thumb = 16) {
        // Reduce image to thumbnail
        let pyr = { cols: width, rows: height }
        if (Math.min(pyr.cols, pyr.rows) > thumb) {
          // limit long edge
          const orient = pyr.cols > pyr.rows ? 'cols' : 'rows'
          const scale = thumb < pyr[orient] ? thumb / pyr[orient] : 1
          pyr = { cols: Math.ceil(pyr.cols * scale), rows: Math.ceil(pyr.rows * scale) }
        }
        return [pyr.cols, pyr.rows]
      },
      src: function (element, uri, attribute) {
        return new Promise((resolve, reject) => {
          element.onload = (e) => resolve(e)
          element.onerror = (e) => reject(e)
          element.setAttribute(attribute, uri)
        })
      },
      xml: function (url, opts = {}) {
        return fetch(url)
          .then((response) => response.text())
          .then((html) => {
            document.querySelector(opts.selector).innerHTML = html
          })
          .catch((error) => {
            console.error('Error fetching HTML:', error)
          })
      }
    }
  },

  init: function (opts = {}) {
    const vars = mpos.var
    const { opt, fov } = vars

    //
    // WebWorker...
    vars.worker = new Worker('worker.js')
    vars.worker.onmessage = (e) => {
      const result = e.data
      console.log('WW message:', result)
    } // -->

    const promise = new Promise((resolve, reject) => {
      //
      // Mode: Proxy or Standalone
      const proxy = !!(opts.scene && opts.camera && opts.renderer)

      vars.scene = opts.scene || new THREE.Scene()
      vars.scene.autoUpdate = vars.scene.matrixAutoUpdate = vars.scene.matrixWorldAutoUpdate = false

      //const canvas = document.createElement('canvas')

      vars.renderer =
        opts.renderer ||
        new THREE.WebGLRenderer({
          //canvas: canvas
          //antialias: false,
          //precision: 'lowp',
          //powerPreference: 'low-power',
        })

      vars.renderer.setPixelRatio(fov.dpr)
      const domElement = vars.renderer.domElement
      opts.host = proxy ? domElement.parentElement : document.body

      fov.width = opts.host.offsetWidth
      fov.height = opts.host.offsetHeight
      const frustum = fov.basis * opt.depth
      vars.camera = opts.camera || new THREE.PerspectiveCamera(45, fov.width / fov.height, fov.z / 2, frustum * 4)

      //
      // Inject Stage
      const template = document.createElement('template')
      template.innerHTML = `
    <section id='mp'>
      <div id='custom' class='tool mp-offscreen'>
        <object alt='OSC'></object>
        <!-- iframe, template -->
      </div>
      <aside id='atlas' class='tool'>
        <!--<canvas></canvas>-->
        <hr id='caret' />
      </aside>
      <div id='css3d'></div>
    </section>`

      opts.host.appendChild(template.content)
      const mp = proxy ? opts.host : document.getElementById('mp')
      mp.classList.add('mp-block')
      //mpos.var.atlas = mp.querySelector('#atlas canvas')
      vars.caret = mp.querySelector('#caret')

      vars.camera.layers.enableAll()
      if (!proxy) {
        vars.camera.position.z = frustum / 8
        vars.renderer.setSize(fov.width * fov.dpr, fov.height * fov.dpr)
        mp.appendChild(domElement)
        vars.renderer.setClearColor(0x00ff00, 0)
        // helpers
        const axes = new THREE.AxesHelper(fov.basis)
        vars.scene.add(axes)
      }

      // CSS3D
      const css3d = document.getElementById('css3d')
      vars.rendererCSS = new CSS3DRenderer()
      vars.rendererCSS.setSize(fov.width * fov.dpr, fov.height * fov.dpr)
      css3d.appendChild(vars.rendererCSS.domElement)
      css3d.querySelectorAll('div').forEach((el) => el.classList.add('mp-block'))

      const controls = new MapControls(vars.camera, domElement)
      controls.screenSpacePanning = true
      controls.maxDistance = frustum

      const halfHeight = -(fov.height / 2)
      vars.camera.position.setY(halfHeight + 0.125)
      controls.target.setY(halfHeight)
      controls.update()
      vars.controls = controls

      //
      // Enable UX
      const ux = mpos.ux
      window.stats = new Stats()
      mp.appendChild(stats.dom)
      //
      const gridHelper = new THREE.GridHelper(fov.width, 4, 0x444444, 0xc0c0c0)
      gridHelper.rotateX(3.14 / 2)
      vars.scene.add(gridHelper)

      // First Paint
      ux.events.raycaster.layers.set(2)
      //ux.render()

      // User Events: Window, Scene, Raycaster
      controls.addEventListener('change', ux.render, false)

      const events = ['mousedown', 'mousemove', 'click']
      events.forEach((event) => {
        domElement.addEventListener(event, ux.event, false)
      })

      // User Events: Window Layout Shift
      window.addEventListener('scroll', ux.reflow, false)

      const resize = new ResizeObserver((entries) => {
        ux.reflow({ type: 'resize' })
      })
      resize.observe(mp)

      const callback = function (entries, observer) {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target)
            ux.reflow(entry)
          }
        })
      }

      ux.observer = new IntersectionObserver(callback, {
        // note: relax error range, for canvas threshold
        threshold: [0, 1]
      })

      // User Events: CSS Clones
      //const cloneCSS = mp.querySelector('#css3d > div > div > div')
      //domElement.addEventListener('input', ux.event, false)

      const gui = new GUI()
      gui.domElement.classList.add('mp-native')
      for (const key in opt) {
        const params = {
          request: [['xml_suite.html', 'xml_track.html', 'xml_guide.html']],
          selector: [['body', 'main', '#native', '#text', '#loader', '#media', '#live', 'custom']],
          depth: [0, 32, 1],
          inPolar: [1, 4, 1],
          delay: [0, 133.333, 8.333],
          arc: [0, 1, 0.25]
        }
        const param = params[key] || []
        const controller = gui.add(opt, key, ...param).listen()

        if (key === 'delay') {
          controller.onFinishChange((v) => {
            ux.reflow({ type: 'delay', value: v })
          })
        } else if (key === 'request') {
          controller.onFinishChange((v) => {
            vars.tool.xml(v, { selector: 'main' }).finally(() => {
              mpos.mod.add().then((res) => {
                console.log('mod add:', res)
              })
            })
          })
        }
      }

      resolve(opts)
      reject('err')
    })

    // note: delay timer may go here, BUT needs grade to continue...

    return promise
  },
  mod: {
    precept: {
      //
      // Types for NodeIterator
      manual: `.mp-loader,.mp-poster,.mp-native`.split(','),
      allow: `.mp-allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
      block:
        `.mp-block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template,track,source,iframe:not([src])`.split(
          ','
        ),
      poster: `.mp-poster,canvas,img,picture,figcaption,h1,h2,h3,h4,h5,h6,p,ul,ol,li,th,td,summary,caption,dt,dd,code,span,root`.split(','),
      native:
        `.mp-native,a,canvas,iframe,frame,object,embed,svg,table,details,form,label,button,input,select,textarea,output,dialog,video,audio[controls]`.split(
          ','
        ),
      native3d: `model-viewer,a-scene,babylon,three-d-viewer,#stl_cont,#root,.sketchfab-embed-wrapper,StandardReality`.split(','),
      cors: `iframe,object,.yt`.split(','),
      unset: `.mp-offscreen`.split(','),
      //
      tween:
        `width,height,border,margin,padding,top,right,bottom,left,position,flex,display,visibility,opacity,mask,filter,mix-blend-mode,background-blend-mode,color,background,font,align-content,stretch,float,border-radius,box-shadow,animation,transition`.split(
          ','
        ),
      //
      // Code Comment
      parse: function (node) {
        console.log(node.nodeName, node.textContent)
        if (node.textContent.indexOf('//__THREE__') === 0) {
          try {
            // use internals (cache)
            eval(node.textContent)
          } catch (error) {
            console.log(error)
          }
        }
      }
    },
    rect: class {
      constructor(node, opts = {}) {
        for (let k in opts) {
          this[k] = opts[k]
        }
        this.el = node
      }

      el = {}
      idx
      bound = {}
      css = {
        // style: {},
        transform: 0,
        scale: 1,
        degree: 0,
        radian: 0
      }
      ux = { i: 0, o: 0, u: new Set() /*p:*/ }
      frame = -1
      inPolar = 3
      major
      minor

      z = 0
    },
    treeGrade: class {
      //
      // Build DOM Tree Structure
      #lock = 0 // atlas key(s) reserved space

      // Template Isolate
      group = new THREE.Group()
      batch = ++mpos.var.batch // unique group identifier
      atlas = {
        //idxMip: this.#lock, // implies poster++ (from depth/type) and not other
        //idxMip2: 0,
        // configure
        size: 512,
        cells: 12,
        uv: {
          // idx (count), maximum, map(pixels)
          0.5: { idx: 0, span: 2, area: 48 * 48 },
          '1.0': { idx: 0, span: 6 }, //this.#lock
          '2.0': { idx: 0, span: 4, area: 96 * 128 }
        }
        //cellMip: 12,
        //cellMip2: 4
      }
      elsMin = 0 // inPolar or Observer
      elsMax = 0 // data-idx
      inPolar = 3
      // sets and subsets

      rects = new Map()
      major = {
        // live values
        queue: new Set(),
        atlas: new Map(),
        other: new Map(),
        text: new WeakMap()
      }

      //scroll: { x: window.scrollX, y: -window.scrollY }

      //
      // Filter (Precept #2): reduce source of memory... but don't alter whitespace!
      // Child node may be malformed or create documents in the loop
      static #allow = new Set(['FORM', 'FIELDSET'])
      static #block = new Set(['SCRIPT', 'SOURCE', 'TRACK', '#comment', '#cdata-section'])
      static #node
      static filter(clone) {
        this.#node = clone
        return (
          !this.#allow.has(this.#node.nodeName) ||
          !this.#allow.has(this.#node.parentElement.nodeName) ||
          (!this.#block.has(this.#node.nodeName) && !this.#block.has(this.#node.parentElement.nodeName))
          //node.nodeName === '#text' &&
        )
      }

      constructor(opts) {
        this.depth = opts.depth
        this.group.name = opts.selector

        const atlas = this.atlas
        atlas.fontEmbedCSS = /*await getFontEmbedCSS(grade.el)*/ ''
        //
        // Offscreen Canvas
        //devnook.github.io/OffscreenCanvasDemo/use-with-lib.html
        atlas.canvas = document.createElement('canvas')
        // note: offscreen, transfercontrols, multiple readback
        //developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
        atlas.ctx = atlas.canvas.getContext('2d', { willReadFrequently: true, alpha: true })
        atlas.ctx.imageSmoothingEnabled = false
      }
    },
    treeFlat: function (grade, opts = {}) {
      // todo: if user passes bad selector, catch again
      const element = opts.selector || grade.el
      const precept = opts.precept || this.precept
      const parse = opts.parse || precept.parse

      //
      // Flat-Grade: filter, grade, sanitize
      const ni = document.createNodeIterator(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
      const sibling = (parent) => {
        return parent.childElementCount >= 1 && parent.matches([precept.allow])
      }
      let node = ni.nextNode()
      while (node) {
        if (node.nodeName === '#comment') {
          // #comment (or CDATA, xml, php)
          parse(node)
        } else {
          //
          // Prototype for Records
          const rect = new this.rect(node, {})

          if (mpos.set.inPolar(rect)) {
            // not empty
            if (node.nodeName === '#text') {
              const control = mpos.var.tool.resort(grade.rects)

              if (mpos.set.inPolar(rect, control) && sibling(node.parentNode)) {
                // sanitize #text orphan (semantic or list) with parent visible
                const wrap = document.createElement('span')
                wrap.classList.add('mp-poster')
                node.parentNode.insertBefore(wrap, node)
                wrap.appendChild(node)

                rect.el = wrap
                mpos.set.inPolar(rect)
                grade.major.text.set(node, wrap)
              }
            }

            if (rect.inPolar >= 2) {
              // Element in Document
              const idx = grade.elsMax++
              rect.idx = idx.toString()
              rect.el.setAttribute('data-idx', idx)
              grade.rects.set(idx.toString(), rect)
              rect.css = {
                degree: 0,
                radian: 0,
                scale: 1,
                transform: 0
              }
            }
          }
        }

        node = ni.nextNode()
      }
    },
    treeDeep: function (grade, opts = {}) {
      const precept = this.precept

      const zSlot = opts.zSlot || 0
      const depth = opts.depth - zSlot
      console.log('zSlot', opts.zSlot)

      function setRect(rect, z, mat, unset) {
        //
        // Qualify Geometry Usage
        if (rect) {
          rect.minor = mat
          rect.z = zSlot + z

          //
          // Assign Archetype
          // note: atlas excludes rect.minor type "native" that matches CORS... to CSS3D
          // ... atlas "poster" became first-class, so the logic is !!BetterLate
          const other = rect.minor === 'loader' || rect.minor === 'wire' || rect.el.matches([precept.cors, precept.native3d])
          rect.major = other ? 'other' : 'atlas'

          // elevate priority for ux update (not hyperlinks or CSS3D)
          const uxin = rect.minor === 'native' && rect.el.tagName !== 'A' && rect.major !== 'other' ? 1 : 0
          rect.ux.i = uxin

          // Class to unset quirks (inherit transform, details...)
          unset = unset || rect.el.matches(precept.unset)
          if (unset) {
            rect.unset = true
            rect.ux.i = 1
          }

          if (rect.inPolar >= grade.inPolar) {
            // Begin Subsets: atlas || other
            mpos.set.key(grade, rect)
            // note: counter logic duplicated in step sync queue (major, priority)
          } else {
            // note: observe greedily on pageLoad...?
            mpos.ux.observer?.observe(rect.el)
            // note: observe off-screen (!inPolar) elements...?
          }

          // Atlas cellMip2 test 1
          //if (rect.minor === 'poster' || rect.minor === 'native' /* || rect.minor === 'child' */) {
          //  const area = rect.el.offsetWidth * rect.el.offsetHeight
          //  tool.avg(area, atlasWide)
          //}
        }
        return unset
      }
      function setMat(node, mat, manual, layer) {
        //
        // Qualify Geometry Type
        if (manual) {
          // priority score
          precept.manual.every((classMat) => {
            classMat = classMat.replace('.mp-', '')
            if (node.className.includes(classMat)) {
              mat = classMat
              classMat = false
            }
            return classMat
          })
        } else if (node.matches([precept.native, precept.native3d])) {
          // todo: shared 3d spaces
          mat = 'native'
        } else if (node.matches(precept.poster) || layer === 0) {
          mat = 'poster'
        }
        return mat
      }

      function treeSet(sel, deep, unset) {
        //
        // DEEP-GRADE: type, count
        const z = depth - deep

        // SELF
        const rect = grade.rects.get(sel.getAttribute('data-idx'))

        let mat = 'self'
        // specify empty or manual
        const children = sel.children

        const manual = rect.el.matches(precept.manual)
        if (!children.length || manual) {
          mat = setMat(rect.el, mat, manual, children.length)
        }
        unset = setRect(rect, z, mat, unset)
        if (!manual) {
          // CHILD
          for (let i = 0; i < children.length; i++) {
            const node = children[i]

            const rect = grade.rects.get(node.getAttribute('data-idx'))
            if (rect && rect.inPolar) {
              // CLASSIFY TYPE
              const block = node.matches(precept.block)
              // Despite reported range, impose upper limit on practical quantity
              const abortEls = grade.elsMin >= 1_024 //|| grade.elsMin > grade.elsMax
              const abortAtlas = grade.atlas.idxMip >= 256 // || grade.idxMip > grade.elsMin
              if (block || abortEls || abortAtlas) {
                console.log('skip', node.nodeName)
                //rect.el = null
              } else {
                if (rect.inPolar >= 1) {
                  const allow = node.matches(precept.allow)
                  const manual = node.matches(precept.manual)
                  const child = node.children.length

                  if (deep >= 1 && allow && !manual && child) {
                    // selector structure output depth
                    const D = deep - 1
                    treeSet(node, D, unset)
                  } else {
                    let mat = 'child'
                    //
                    // Set Element-Geometry "Final Grade"
                    mat = setMat(node, mat, manual, child)
                    setRect(rect, z, mat, unset)
                  }
                }
              }
            }
          }
        }
      }

      return treeSet(opts.selector, depth)
    },
    treeSort: function (grade) {
      const { atlas, rects } = grade

      //
      // Complete Preparation
      for (const [idx, rect] of rects) {
        if (rect.minor) {
          //rect.idx = Number(idx)
        } else {
          // free memory
          const node = document.querySelector('[data-idx="' + idx + '"]')
          node && node.removeAttribute('data-idx')
          rects.delete(idx)
        }
      }
      return
    },
    add: async function (selector, opts = {}) {
      const vars = mpos.var
      const { opt, tool, fov, geo, mat, mat_shader, mat_line, scene } = vars // grade needs attention pre/post
      const precept = this.precept

      //
      // Options
      opts.depth ||= opt.depth
      opts.parse ||= precept.parse
      // selector: term permits selector/element/uri, and opt default
      opts.selector = selector || opt.selector
      // grade:
      const grade = opts.grade || new this.treeGrade(opts)

      //
      // Document Element NodeIterator for Typed Geometry
      if (opts.grade) {
        const m = mpos.fnVar('march', opts.selector, {})
        opts.zSlot = m.root
        //
        // Lightweight addition using existing resources
        // no: wait, dispose, or new instanced
        this.treeFlat(grade, opts)
        this.treeDeep(grade, opts)
        this.treeSort(grade)
      } else {
        // Bad selector or busy?
        let element = document.querySelector(opts.selector)
        if (element === null || (!!grade.wait && element.isSameNode(grade_r.el))) {
          return
        }

        // Load external uri into object resource
        if (opts.custom) {
          await tool
            .src(element, opts.custom, 'data')
            .then((res) => {
              console.log('res', res)
              // use document contentDocument.body instead of CSS3D
              if (element.contentDocument) {
                element = element.contentDocument.body
              }
            })
            .catch((err) => {
              console.error('err: ', err) // CORS
              return
            })
        }

        // Dispose Memory: last batch is old
        grade.el = opts.selector = element
        grade.wait = Infinity
        await tool.old()

        //const atlasWide = { count: 0, average: 0 }
        this.treeFlat(grade)
        this.treeDeep(grade, opts)
        this.treeSort(grade)

        //
        // Texture Atlas: relative to grade
        const atlas = grade.atlas
        document.querySelector('#mp #atlas').appendChild(atlas.canvas)
        // note: if dynamic (atlas size, cellMip), update between treeDeep (elsMax++, areaAvg++) and treeSort (cellMip2, idxMip2)
        atlas.canvas.width = atlas.canvas.height = atlas.size
        atlas.canvas.title = `${grade.group.name}#${grade.batch} ${atlas.size}px/${atlas.cells}`
        // ... cellMip2 from average area ( & size & cellMip )

        const cellMap = atlas.size / atlas.cells
        // set MipMap pixel references
        let xColumn = atlas.uv['1.0'].span
        for (const [mip, uv] of Object.entries(atlas.uv)) {
          // resolution
          atlas.uv[mip].map = cellMap * mip
          // offset x column
          if (mip == '1.0') continue
          uv.xColumn = xColumn
          xColumn += uv.span
        }

        //
        // Atlas Key structure
        // note: high/low values disappear in THREE shader alphaTest: 'rgba( 0/64, 255, 255, 0.25/0.5 )'
        atlas.keyTest = { x: atlas.size - cellMap, y: atlas.size - (cellMap + 0.0001), alpha: 'rgba( 0, 128, 128, 0.125 )' } // empty structure (cyan)
        // context reset when loop interrupted
        atlas.ctx.fillStyle = atlas.keyTest.alpha
        atlas.ctx.fillRect(atlas.keyTest.x, atlas.keyTest.y, cellMap, cellMap)

        //
        // Instanced Mesh and
        const shader = mpos.set.shader(atlas.canvas, atlas.cells, mat_shader)
        const instanced = new THREE.InstancedMesh(geo, [mat, mat, mat, mat, shader, mat_line], grade.elsMax)
        instanced.layers.set(2)
        mpos.set.use(instanced)
        // Shader Atlas
        instanced.userData.shader = shader
        instanced.userData.el = grade.el
        instanced.name = [grade.batch, grade.el.tagName].join('_')
        atlas.instanced = instanced
        grade.group.add(instanced)

        // Atlas UV Buffer
        const uvOffset = new THREE.InstancedBufferAttribute(new Float32Array(grade.elsMax * 3).fill(-1), 3)
        uvOffset.setUsage(THREE.DynamicDrawUsage)
        instanced.geometry.setAttribute('uvOffset', uvOffset)

        atlas.uvOffset = instanced.geometry.getAttribute('uvOffset')

        //
        // OUTPUT
        vars.grade = grade
        if (scene) scene.add(grade.group)
        grade.wait = false
      }

      //
      // NOTE: await tree recursion is not complete (constants race)

      if (opt.delay && !mpos.ux.timers.delay.length) {
        console.log('delay', opt.delay)
        grade.major.queue.add('delay')
        mpos.ux.reflow({ type: 'delay', value: opt.delay })
      }

      mpos.step.sync(grade)
      return grade
    }
  },
  set: {
    inPolar: function (rect, control) {
      //
      // Visibility in Viewport
      const node = rect.el
      let vis = node && (node.tagName || node.textContent.trim()) ? 1 : false

      if (rect.css) {
        // Falsy LIFO Check: compare z-depth (onion skin) to depth slider
        const onion = typeof rect.z === 'number' ? rect.z <= mpos.var.opt.depth : false
        vis = vis && onion ? vis : 0
      }

      if (vis) {
        if (node.nodeName === '#text' && typeof control === 'object') {
          // Node relative in control plot
          vis = Object.values(control).some((tag) => {
            const parent = node.parentElement
            const unlist = parent && parent.offsetWidth && parent.offsetHeight
            return unlist && node.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_CONTAINS
          })
        } else {
          // 1: Node not empty
          if (node.tagName) {
            // 2: Node is tag
            vis++

            const bound = rect.bound
            const style = rect.css?.style || node.style

            const alphaTest =
              bound.width === 0 ||
              bound.height === 0 ||
              node.style.display === 'none' ||
              node.style.visibility === 'hidden' ||
              (style.opacity || Infinity) <= 0.25
            if (!alphaTest && node.checkVisibility()) {
              // 3: Tag is visible
              vis++
              const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
              const scroll = bound.bottom >= 0 && bound.top - viewHeight < 0
              if (scroll) {
                // 4: Tag in viewport
                vis++
              }
            }
          }
        }
      }

      rect.inPolar = vis
      return vis
    },
    key: function (grade, rect) {
      const _major_ = grade.major[rect.major]

      if (!_major_.has(rect.idx)) {
        grade.elsMin++

        if (rect.major === 'atlas') {
          if (rect.minor === 'poster' || rect.minor === 'native') {
            const atlas = grade.atlas
            const area = rect.el.offsetWidth * rect.el.offsetHeight
            let mip = '1.0'

            // FIFO, not sorted by area
            if (area > atlas.uv['2.0'].area) {
              // note: cumulative average requires async/await (deterministic)
              mip = '2.0' // or last?
            } else if (area < atlas.uv['0.5'].area) {
              mip = '0.5' // or first?
            }

            // note: structural elements (self, child) will not have a unique cell...?
            rect.uv = { mip: mip /*idx: atlas.uv['1.0'].idx++*/ } //idxMip:

            // for dynamic(?) sizes we're keeping an extra idx
            //if (mip !== '1.0') rect.uv.idxMip = atlas.uv[mip].idx++
          } else if (rect.minor === 'self') {
            //
            // support background images, with minimal mip (for performance and quantity)
            // ...but filter limit could be lifted to support bullets, or re-draw children elements (composite or registration?)
            const style = rect.css.style || window.getComputedStyle(rect.el) // ideally shared or saved, but no deep usage info yet
            const isStyled = style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)'

            if (isStyled) rect.uv = { mip: '0.5' }
          }
        } else if (rect.major === 'other') {
          // STATES:
          // 1: to be added, 2: being added, 3: added
          rect.add = 1
        }

        // add key
        _major_.set(_major_.size, rect.idx.toString())
      }
    },
    box: function (rect, opts = {}) {
      //if (!rect.ux.o && !rect.ux.u.size) {
      //  return false
      //}

      const { geo, mat_line, fov, opt, grade } = mpos.var

      //
      // Accumulate Transforms: frame differ
      const unset = mpos.set.css(rect, opts.frame)
      // css quirk: unset for type casting (compatibility, accessibility...)
      const bound = rect.unset ? unset : rect.bound

      //
      // TYPE OF MESH FROM ELEMENT
      let object
      if (rect.obj) {
        object = rect.obj
      } else if (rect.major === 'other') {
        const resource = grade.group.getObjectByName(rect.idx)
        if (resource) {
          // prevent duplicate resource from delayed response during loads
          // via status of async concurrent requests
          // native is old by frame 2, whereas loader may take time
          return
        } else {
          const group = new THREE.Group()
          group.name = rect.idx
          group.userData.el = rect.el
          group.userData.idx = rect.idx
          rect.obj = group

          if (rect.minor === 'native') {
            // todo: de-dupe all 'other' (loader) via rect.obj = Group && fit/use scene.getObjectByName
            //const loaded = mpos.var.rendererCSS.domElement.querySelector(`[data-batch="${grade.batch}"] [data-idx="${rect.idx}"]`)

            // note: element may not inherit some specific styles
            const el = rect.el.cloneNode(true)
            // wrap prevents overwritten transform, and inherits some attributes
            const stub = rect.el.parentElement
            const tag = stub.tagName !== 'BODY' ? stub.tagName : 'DIV'
            const wrap = document.createElement(tag)
            wrap.classList.add('mp-native')
            wrap.setAttribute('data-batch', grade.batch)
            wrap.append(el)
            wrap.style.zIndex = rect.css.style?.zIndex || ''

            // hack at some problems:
            // relative width and height
            // duplicate ids or data-idx
            wrap.style.width = stub.clientWidth + 'px'
            wrap.style.height = bound.height + 'px'

            const css3d = new CSS3DObject(wrap)

            // Out: most userData.el reference an original, not a clone
            css3d.userData.el = el

            object = css3d
          } else if (rect.minor === 'wire') {
            // Mesh unclassified (currently only root node)
            const mesh = new THREE.Mesh(geo, mat_line)
            mpos.set.use(mesh)
            mesh.animate = true
            // Out
            mesh.userData.el = rect.el

            object = mesh
          } else {
            // loader dummy
            object = new THREE.Object3D()
          }
        }
      } else {
        // Instanced Mesh
        object = new THREE.Object3D()
      }

      function transform(obj) {
        //
        // TRANSFORMS: apply accumulate for natural box model
        // note: boxes are positioned from center, so delay in update queue may seem stretched/misaligned

        // scale
        const w = unset.width
        const h = unset.height
        const d = fov.z
        // position
        let x = bound.width / 2
        let y = -bound.height / 2
        // scroll{0,0} is viewport, not document
        const scroll = opts.scroll || { x: 0, y: 0 }
        if (!scroll.fix) {
          x += scroll.x + bound.left
          y += scroll.y - bound.top
        }

        // z subset mimics DOM honor (not 100% faithful)
        // being expanded (for z-target ux) AND compressed (into view frustum)
        const zGrade = rect.z + 1 // NodeIterator index [ 1, 2, 3 ... ] from selector
        const zIndex = rect.css?.style?.zIndex || 'auto' // user-agent stylesheet
        let zDomain = zIndex === 'auto' // inheritance assigned (mimic DOM honor)
        const zSign = zDomain || zIndex >= 0 ? 1 : -1

        // SCALE domain => range
        let zRange = zGrade + (zDomain ? 0.5 : Math.abs(zIndex))
        const zScale = 1 - 1 / (zRange + 1)

        let z = zSign * zScale * (fov.z * 2)

        // extrude bias to cure z-fighting
        const extrude = rect.minor !== 'self' && rect.minor !== 'wire' ? fov.z / 2 + fov.z / 4 : 0
        z += extrude

        if (obj.isCSS3DObject) {
          obj.position.set(x, y, z)
          // element does not scale like group
          obj.userData.el.style.width = w
          obj.userData.el.style.height = h
          // note: actually using cumulative
          if (rect.css.transform) {
            const scale = 'scale(' + rect.css.scale + ')'
            const degree = 'rotate(' + rect.css.degree + 'deg)'
            obj.userData.el.style.transform = [scale, degree].join(' ')
          }
        } else {
          //Generic
          // group implies loader, with arbitrary scale
          const dummy = obj.isGroup ? new THREE.Object3D() : obj

          dummy.position.set(x, y, z)
          dummy.scale.set(w * rect.css.scale, h * rect.css.scale, d)
          obj.rotation.z = -rect.css.radian

          // note: group affects raycast events and click-targets
          if (obj.isGroup) mpos.set.fit(dummy, obj)
        }

        if (opt.arc) {
          // arc radial
          const damp = opt.arc
          const mid = fov.width / 2
          const rad = (mid - x) / mid
          const pos = mid * Math.abs(rad)
          // bulge from view center
          obj.rotation.y = rad * damp * 2
          obj.position.setZ(z + pos * damp)
        }

        obj.updateMatrix()
      }

      //
      // Matrix Frame Update
      transform(object)

      let res = object

      if (rect.add === 1) {
        rect.add = 2
        //rect.obj.visible = false
        // Load Additional Resource (async)
        if (rect.minor === 'loader') {
          res = rect.obj
          mpos.set.loader(rect, object)
        } else {
          grade.group.add(object)
          rect.obj = object
          // Generic types: (wire, native CSS3D) could set rect.add if needed
          //grade.group.add(object)
        }
      } else if (rect.add > 1 && !rect.obj) {
        // Object3D was detached by repeat attempts to add
        console.log('detached:', rect)
        rect.obj = mpos.var.scene.getObjectByName(rect.idx)
      }

      return res
    },
    css: function (rect, frame) {
      const { grade, tool, time } = mpos.var

      //
      // CSS Style Transforms: accumulate a natural box model
      // frame or ScrollEvent
      if (frame > rect.frame || frame === 0) {
        // css style: transform, transformOrigin, backgroundColor, zIndex, position
        const { css, ux } = rect

        //
        // Implicit: diffs reference
        const differ = { bound: rect.bound, degree: css.degree, scale: css.scale, pseudo: ux.u.has('pseudo'), tween: css.tween }
        // Reset diffs feature
        css.scale = 1
        css.transform = css.degree = css.radian = 0
        css.tween = {}
        const stateOld = ux.u.has('pseudo')
        ux.u.clear()

        // => rate()
        // ux.u transforms: need matrix up-front (> children)
        // => transforms() => box()
        // ux.u atlas: combined matrix pre/post (skew cell) and tween (draw cell)
        // => atlas()
        //
        // inPolar &&
        // transforms (box) :: frame-1, rotated/matrix, pre/post diff (boundingRect), manual/native
        // atlas (meta) :: rect/bound/matrix + css/tween/pseudo
        //
        //
        // Contrary to name, css

        //
        // Explicit: diffs feature
        let matrix = tool.diffs('matrix', { rect: rect })
        // style computed for feature lazily / progressively
        if (!css.style && (ux.i || matrix)) css.style = window.getComputedStyle(rect.el)
        // Priority ux: escalate
        if (rect.major === 'atlas') tool.diffs('pseudo', { rect: rect, capture: grade.capture })
        const priority = tool.diffs('tween', { rect: rect }) || ux.u.has('pseudo') || differ.pseudo || matrix
        ux.o = priority ? ux.i + 1 : ux.i
        ux.o += ux.u.size
        // compute qualified stylesheet (not inline)
        if (!css.style && ux.o) css.style = window.getComputedStyle(rect.el)

        //
        // Constants
        let el = rect.el
        let max = 8 // deep tree?
        let style, transform, scale, degree, radian
        const allow = mpos.mod.precept.allow

        const hover = stateOld || (rect.el.matches(':hover') && ux.o > 1 && ux.u.has('pseudo'))

        while (el && max--) {
          if (el.isSameNode(document.body) || el.isSameNode(document.documentElement) || !el.parentElement) {
            break
          }

          // Ancestors (top-down) have frame update
          // DOM traverse
          const _rect_ = grade.rects.get(el.getAttribute('data-idx'))
          if (_rect_?.ux.o) {
            // output (rect.o) was escalated, but matrix (rect.u) may be removed in post if no differ (to reduce atlas queue)
            // if (_rect_.ux.u.has('matrix')) { // matrix was removed if unchanged, but output was escalated
            // accumulate ancestor matrix
            style = _rect_.css.style || css.style // || window.getComputedStyle(el)

            if (style && style !== 'none' /*tool.diffs('matrix', { rect: rect })*/) {
              transform = style.transform.replace(/(matrix)|[( )]/g, '')
              // transform matrix
              const [a, b] = transform.split(',')
              if (a && b) {
                scale = Math.sqrt(a * a + b * b)
                degree = Math.round(Math.atan2(b, a) * (180 / Math.PI))
                radian = degree * (Math.PI / 180)
                // accrue transforms
                css.scale *= scale
                css.radian += radian
                css.degree += degree
                css.transform++
              }
            }
            //}
            if (hover) {
              // hover bubbles, but not focus/active
              // new experiment, maybe redundant with pseudo but not other contageous effects
              _rect_.ux.o++
            }
          }

          el = el.parentElement.closest(allow) // or [data-idx]
        }

        // update rect properties from frame
        // to reduce queue of atlas/transforms
        rect.css = css
        // curated shortlist of discrete style properties related to presentation
        mpos.mod.precept.tween.forEach((prop) => {
          if (css.style.hasOwnProperty(prop)) css.tween[prop] = css.style[prop]
        })

        // bound belongs in inPolar, but pre/post is more "live" here
        rect.bound = rect.el.getBoundingClientRect()
        rect.bound.symmetry = [rect.el.offsetWidth, rect.el.offsetHeight].join('_')

        //rect.bound = rect.el.getBoundingClientRect()

        // Implicit: compare frame result to detect change... i.e. parent had transform matrix?
        // deep
        const newTransform = differ.degree !== css.degree || differ.scale !== css.scale
        // shallow (but could be square rotated 90-degrees)
        const newBounding = differ.bound && JSON.stringify(differ.bound) !== JSON.stringify(rect.bound)
        // tween doesn't initialize with values
        const newTween = differ.tween && JSON.stringify(differ.tween) !== JSON.stringify(rect.css.tween)

        if (newTransform || newBounding) {
          ux.u.add('matrix')
        }
        if (ux.u.has('matrix')) {
          // Revoke explicit key for subjective sync (rate, atlas...)
          if (!newTransform) {
            // transformed, but not transforming (on frame)
            if (!newBounding) {
              // implies reference is unchanged (yet ux.o remains elevated by differs)
              ux.u.delete('matrix')
            } else if (differ.bound.width === rect.bound.width && differ.bound.height === rect.bound.height) {
              // only position change (on page scroll), which invalidates extension of priority (toSvg)
              ux.u.delete('matrix')
            }
          } else {
            // transform does not require style update, or user qualification may intervene
            // if no tweens and no i, we can reduce a lot of purely rotational redraws
            // users could easily specify i=1 (native) or add a animation name
            if (ux.o < 3 && ux.u.size < 2) {
              // ux.i === 0 && !ux.u.has('tweens')
              // ux.o < 3 && ux.u.size < 2
              ux.u.delete('matrix')
            }
          }
        }

        if (ux.u.has('tween') && !newTween) {
          // discard keyframes without change, unless a child of the element is tagged active
          const actors = rect.el.querySelector(allow)
          if (!actors && time.slice(4)) ux.u.delete('tween')
        } else if (newTween && !ux.u.has('tween')) {
          // detect incidental changes...?
          ux.u.add('tween')
        }

        if (ux.o)
          // ...

          // frame update
          rect.frame = frame

        if (frame === 0) {
          // mouseevents (0) provide some increments
          // note: rect/init values of -Infinity, -1, 0, 0.001 null may be interesting...
          const tick = 0.001
          rect.frame += tick
        }
      }

      return { width: rect.el.offsetWidth, height: rect.el.offsetHeight }
    },
    use: function (object, update) {
      // update usage manually
      if (!update) {
        object.matrixAutoUpdate = false
        if (object.isInstancedMesh) {
          object.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        }
      } else {
        object.matrixWorldNeedsUpdate = true
        //object.children.forEach((child) => {
        //  child.matrixWorldNeedsUpdate = true
        //})
        if (object.isInstancedMesh) {
          object.instanceMatrix.needsUpdate = true
          object.computeBoundingSphere()
        }
      }
    },
    shader: function (canvas, texStep, mat_shader) {
      //discourse.threejs.org/t/13221/17
      const texAtlas = new THREE.CanvasTexture(canvas)
      texAtlas.minFilter = THREE.NearestFilter
      // update
      const m = mat_shader
      m.uniforms.map.value = texAtlas
      m.uniforms.atlasSize.value = texStep
      // output
      m.userData.t = texAtlas
      return m
    },

    fit: function (dummy, group, opts = {}) {
      // Group Scale from Element Dummy

      if (opts.add) group.add(opts.add)

      if (group.children.length) {
        let s2 = group.userData.s2
        if (!s2) {
          const aabb = new THREE.Box3()
          aabb.setFromObject(group)
          s2 = Math.max(aabb.max.x, aabb.max.y)
          // original scale
          group.userData.s2 = s2
        }

        const s1 = Math.max(dummy.scale.x, dummy.scale.y)
        const scalar = s1 / s2
        group.scale.set(scalar, scalar * -1, scalar)

        // position
        group.position.copy(dummy.position)
        group.position.x -= dummy.scale.x / 2
        group.position.y += dummy.scale.y / 2
        // note: group may lack depth (SVG/OpenCV) or not (JSONLoader)
        group.translateZ(mpos.var.fov.z / 2)

        mpos.set.use(group, true)

        // mpos.ux.render()
      }
    },

    cache: function (asset, uri, data) {
      // Stash resource at uri, with flag for disposal
      if (data) asset.data = data
      console.log('set cache', asset)
      mpos.var.cache.set(uri, asset)
      // dispose...?
      Object.values(asset.flag).forEach((obj) => {
        if (obj.isObject3D && obj.userData) obj.userData.cache = true
      })
    },
    loader: function (rect, dummy) {
      //
      // Loaded check: async presentation, as dummy fits group with source

      const { cache, grade, reset, geo, mat, mat_shape, mat_line, tool } = mpos.var

      const source = rect.el
      // source is location or contains one
      let uri = typeof source === 'string' ? source : source.data || source.src || source.currentSrc || source.href
      // source is image
      let mime = uri && uri.match(/\.(json|gltf|glb|svg|gif|jpg|jpeg|png|avif|heif|hevc|heic|avc|webp|webm|mp4|mov|ogv)(\?|$)/gi)
      mime = mime ? mime[0].toUpperCase() : 'File'
      // tier: tags and extensions, supported THREE.Loader standard and callback
      let loader = !!((mime === 'File' && uri) || mime.match(/(JSON|GLTF|GLB|SVG|GIF)/gi))

      //
      // Cache: models (or whatever...?)
      let asset = cache.get(uri) || { mime: mime, data: false, flag: {} }

      //console.log(source, uri, mime, loader, dummy )
      let group = rect.obj

      if (mime.match(/^(.WEBM|.MP4|.OGV)$/gi)) {
        // HANDLER: such as VideoTexture, AudioLoader...
        const material = mat_shape.clone()
        const texture = new THREE.VideoTexture(source)
        material.map = texture
        const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])
        // unique overrides
        mesh.matrix.copy(dummy.matrix)
        grade.group.add(mesh)
        // ux
        rect.obj = mesh
        mesh.name = mesh.userData.idx = rect.idx
        mesh.userData.el = rect.el

        mesh.layers.set(2)
        //mpos.set.use(mesh)
        rect.add++
      } else if (mime.match('.GIF')) {
        const material = mat_shape.clone()
        const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])

        const promisedGif = fetch(uri)
          .then((resp) => resp.arrayBuffer())
          .then((buff) => {
            let gif = parseGIF(buff)
            let frames = decompressFrames(gif, true)

            // 0. parse meta
            let duration = 0
            frames.forEach((frame) => {
              duration += frame.delay
            })

            // 1. full gif canvas
            let gifCanvas = document.createElement('canvas')
            let gifCtx = gifCanvas.getContext('2d')

            gifCanvas.width = gif.lsd.width
            gifCanvas.height = gif.lsd.height
            // 2. patch gif canvas
            let tempCanvas = document.createElement('canvas')
            let tempCtx = tempCanvas.getContext('2d')

            //
            //
            // Draw Gif Frames to cache: for update in step>transforms
            // step>transformsmemory?
            const [width, height] = tool.pyr(gif.lsd.width, gif.lsd.height, 64)
            let frameImageData
            frames.forEach((frame) => {
              //
              //
              let dims = frame.dims

              // Render gif: update patch
              if (frame.disposalType === 2) {
                gifCtx.clearRect(0, 0, gifCtx.canvas.width, gifCtx.canvas.height)
              }

              if (!frameImageData || dims.width != frameImageData.width || dims.height != frameImageData.height) {
                tempCtx.canvas.width = dims.width
                tempCtx.canvas.height = dims.height
                frameImageData = tempCtx.createImageData(dims.width, dims.height)
              }

              // set the patch data as an override
              frameImageData.data.set(frame.patch)
              // draw the patch back over the canvas
              tempCtx.putImageData(frameImageData, 0, 0)
              gifCtx.drawImage(tempCtx.canvas, dims.left, dims.top)

              //
              // Thumbnail
              const cached = document.createElement('canvas')
              const ctx = cached.getContext('2d')
              cached.width = width
              cached.height = height
              // cache
              ctx.drawImage(gifCanvas, 0, 0, width, height)
              frame.cache = cached

              // release memory
              frame.pixels = frame.colorTable = frame.patch = frame.dims = frame.disposalType = null
            })

            console.log('load .GIF', frames)
            // release memory
            gif = gif.frames = gif.gct = gif.lsd = tempCtx = null

            // 3. THREE Texture
            gifCanvas.width = width
            gifCanvas.height = height
            material.map = new THREE.CanvasTexture(gifCanvas)
            mesh.animate = { gif: frames, duration: duration, gifCtx: gifCtx /*, tempCtx: tempCtx,frameImageData: false*/ }
            // Output: mesh (...but added to group it fits to a box)
            grade.group.add(mesh)
            rect.obj = mesh
            mesh.name = mesh.userData.idx = rect.idx
            // prioritize play state
            rect.ux.i = 1

            return gif
          })

        //
      } else {
        let gc

        if (!loader && ((mime !== 'File' && uri) || (mime === 'File' && !uri))) {
          //
          // LOAD Element: OpenCV

          if (uri && !dummy) {
            // source element from uri file
            gc = source = document.createElement('img')
            source.src = uri
            const osc = document.querySelector('#mp address.mp-offscreen')
            osc.appendChild(source)
            dummy = mpos.set.box({ el: source })
          }

          const [width, height] = tool.pyr(source.naturalWidth, source.naturalHeight, 128)

          toSvg(source, {
            style: { ...reset },
            width: width,
            height: height,
            pixelRatio: 1,
            preferredFontFormat: 'woff2',
            fontEmbedCSS: ''
          })
            .then((clone) => {
              let img = new Image()
              let load = img.addEventListener('load', (e) => {
                removeEventListener('load', load)
                // update progress and run module
                rect.add++
                mpos.set.opencv(e.target, group, dummy)
                // cleanup
                img.remove()
                img = null
              })

              // https://github.com/bubkoo/html-to-image/pull/146
              // v1.7.0 viewBox breaks SVG on Firefox (...output encode/decode replace is brittle)
              img.src = clone // clone.replace('viewBox%3D', 'preserveAspectRatio%3D%22none%22%20viewBox%3D')
              clone = null
            })
            .catch((error) => {
              console.log('src problem', error)
            })

          if (gc) {
            gc.parentElement.removeChild(gc)
            gc = source = null
          }
        } else {
          if (asset.data) {
            //
            // Cache Hit: opt-in to reuse assets (currently only JSON loader...)
            // todo: default type reuse/disposal for unique instances
            console.log('cache hit')
            callback(asset.data)
          } else {
            //
            // LOAD Custom: stage specific or generic
            if (mime.match('.GIF')) {
              //gc = source.cloneNode()
              //document.querySelector('#custom').appendChild(gc)
              //
              //
            }

            //mime.match(/^(GLTF|GLB)$/gi)
            //cdn.jsdelivr.net/npm/three-gltf-loader@1.111.0/index.min.js
            //import data from "//cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/loaders/GLTFLoader.js" with { type: "json" };

            loader = mime.match('.SVG')
              ? new SVGLoader()
              : //: mime.match('.GIF')
              //? new SuperGif({ gif: gc, max_width: 64, auto_play: false })
              mime.match('.JSON')
              ? new THREE.ObjectLoader()
              : mime.match(/^(GLTF|GLB)$/gi)
              ? new THREE.GLTFLoader()
              : new THREE.FileLoader()

            const params = loader instanceof THREE.Loader ? uri : callback
            const res = loader.load(
              params,
              callback,
              (xhr) => {
                console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`)
              },
              (error) => {
                console.log('error', error)
              }
            )
          }

          function callback(data) {
            rect.add++
            console.log('load', mime, data)

            if (mime === 'File') {
              // file is not image (XML?)
            } else if (mime.match('.JSON')) {
              // Object.data Extension: Object/Scene Format
              // todo: assign scene values from data-idx

              // Output

              mpos.set.fit(dummy, group, { add: data })
              if (!asset.data) mpos.set.cache(asset, uri, data)
            } else if (mime.match(/^(.GLTF|.GLB)$/gi)) {
              console.log('setPath, decompress, and parse', data)
            } else if (mime.match('.SVG')) {
              // Object.data Extension: Scalable Vector Graphics Format
              const paths = data.paths || []

              for (let i = 0; i < paths.length; i++) {
                const path = paths[i]
                const material = mat_shape.clone()
                material.color = path.color

                const shapes = SVGLoader.createShapes(path)
                for (let j = 0; j < shapes.length; j++) {
                  const shape = shapes[j]
                  const geometry = new THREE.ShapeGeometry(shape, 2)
                  const mesh = new THREE.Mesh(geometry, material)
                  // out
                  group.add(mesh)
                }
              }

              // Output
              mpos.set.fit(dummy, group)
              if (!asset.data) mpos.set.cache(asset, uri, data)
            } /* else if (mime.match('.GIF')) {
              // File Extension: Graphics Interchange Format
              const canvas = loader.get_canvas()
              // SuperGif aka LibGif aka JsGif
              // todo: manual frame index from delta (investigate negative order bug?)
              const material = mat_shape.clone()
              material.map = new THREE.CanvasTexture(canvas)
              const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])

              // Output: mesh (added to group it fits to a box)
              grade.group.add(mesh)
              rect.obj = mesh
              mesh.name = mesh.userData.idx = rect.idx
              //material.userData.SuperGif = loader
              // prioritize play state
              rect.ux.i = 1
              mesh.animate = { gif: loader }
              mesh.animate.gif.pause()
              //mpos.set.use(mesh)
              //mesh.layers.set(2)

              if (gc) {
                gc = null
                // resized
                const gifs = document.querySelectorAll('#custom .libgif, #custom .jsgif')
                gifs.forEach((gif) => {
                  let c = gif.querySelector('canvas')
                  c.parentElement.removeChild(c)
                  c = null
                  gif.innerHTML = ''
                  gif.parentElement.removeChild(gif)
                })
              }

              // Cache TBD
              //asset.flag.loader = loader
              //asset.flag.material = material
            }*/

            // set.use
          }
        }

        grade.group.add(group)
      }

      //return group
    },
    opencv: function (image, group, dummy) {
      let kmeans = {}
      let Module = {
        _stdin: { image: image, kmeans: kmeans },
        wasmBinaryFile: './opencv_js.wasm',
        preRun: [
          function (e) {
            //console.log('preRun')
          }
        ],
        _main: function (c, v, o) {
          //console.log('_main', c, v, o)
          const cv = this
          let image = this._stdin.image
          let kmeans = this._stdin.kmeans

          try {
            const clusters = 16
            function release(mat) {
              //cv.setTo([0, 0, 0, 0]) // <- pre-optimizes kmeans result to {}
              cv.resize(mat, mat, new cv.Size(1, 1), 0, 0, cv.INTER_NEAREST)
              mat.delete()
            }

            const src = cv.imread(image)
            image = null
            const size = src.size()

            // KMEANS
            const pyr = src.clone()
            const [width, height] = mpos.var.tool.pyr(pyr.cols, pyr.rows, clusters * 8)
            cv.resize(pyr, pyr, new cv.Size(width, height), 0, 0, cv.INTER_NEAREST) //AREA,LINEAR,NEAREST

            const sample = new cv.Mat(pyr.rows * pyr.cols, 3, cv.CV_32F)
            for (let y = 0; y < pyr.rows; y++) {
              for (let x = 0; x < pyr.cols; x++) {
                for (let z = 0; z < 3; z++) {
                  sample.floatPtr(y + x * pyr.rows)[z] = pyr.ucharPtr(y, x)[z]
                }
              }
            }
            release(pyr)

            const labels = new cv.Mat()
            const criteria = new cv.TermCriteria(cv.TermCriteria_MAX_ITER + cv.TermCriteria_EPS, 4, 0.8)
            const centers = new cv.Mat()
            cv.kmeans(sample, clusters, labels, criteria, 4, cv.KMEANS_PP_CENTERS, centers)
            release(sample)

            // kmeans colors
            for (let i = 0; i < labels.size().height; i++) {
              const idx = labels.intAt(i, 0)
              if (kmeans[idx] === undefined) {
                let alpha = centers.floatAt(idx, 3)
                if (alpha < 0) {
                  // alpha may be -0 or lost precision at -3e+39
                  // remap, or black material is grey/transparent
                  alpha = alpha === -0 ? 0 : 255
                }

                alpha = alpha < 128 ? Math.max(alpha, 0) : Math.min(alpha, 255)

                kmeans[idx] = {
                  count: 0,
                  rgba: {
                    r: Math.round(centers.floatAt(idx, 0)),
                    g: Math.round(centers.floatAt(idx, 1)),
                    b: Math.round(centers.floatAt(idx, 2)),
                    a: Math.round(alpha)
                  }
                }
              }
              kmeans[idx].count++
            }
            labels.delete()
            centers.delete()

            // inrange
            const lo = new cv.Mat(size, cv.CV_8UC4)
            const hi = new cv.Mat(size, cv.CV_8UC4)
            for (const key in kmeans) {
              const label = kmeans[key]
              const rgba = label.rgba
              // skip transparent
              if (rgba.a < 2) {
                delete kmeans[key]
                return
              }

              // INRANGE
              function level(rgba, range = 0, target = 255) {
                // sample dilate/erode for mask, except alpha (from thumb)
                const bands = {}
                const factor = range < 0 ? 0.66 : 1.33

                for (const channel in rgba) {
                  if (channel !== 'a') {
                    let band = rgba[channel] + range
                    band *= factor
                    band = band < 128 ? Math.max(band, 0) : Math.min(band, 255)
                    bands[channel] = band
                  }
                }

                return [bands.r, bands.g, bands.b, target]
              }

              const mask = new cv.Mat.zeros(size, 0)
              const range = 32 // rather greedy
              lo.setTo(level(rgba, -range, 16)) // 16 remove some text alpha
              hi.setTo(level(rgba, range, 255))
              cv.inRange(src, lo, hi, mask)
              // inrange

              // CONTOURS
              const contours = new cv.MatVector()
              const poly = new cv.MatVector()
              const hierarchy = new cv.Mat()
              cv.findContours(mask, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1)
              release(mask)

              // simplify path
              for (let i = 0; i < contours.size(); ++i) {
                const tmp = new cv.Mat()
                const cnt = contours.get(i)
                cv.approxPolyDP(cnt, tmp, 0.5, true)
                poly.push_back(tmp)
                cnt.delete()
                release(tmp)
              }

              // HIERARCHY
              label.retr = {}
              for (let i = 0; i < contours.size(); ++i) {
                const cnt = poly.get(i)
                // minimum area
                const area = cv.contourArea(cnt)
                const min = area > (Math.min(size.width, size.height) / 16) ** 2
                if (min) {
                  // relationship
                  const hier = Array.from(hierarchy.intPtr(0, i))
                  const parent = hier[3]
                  const rel = parent >= 0 ? parent : i
                  // add shape or holes
                  if (label.retr[rel] === undefined) {
                    label.retr[rel] = { shape: [], holes: [] }
                  }
                  const retr = label.retr[rel]
                  const points = Array.from(cnt.data32S)
                  if (parent >= 0) {
                    retr.holes.push(points)
                  } else {
                    retr.shape = points
                  }
                }
                cnt.delete()
              }
              // path
              contours.delete()
              poly.delete()
              release(hierarchy)

              if (!Object.keys(label.retr).length) {
                delete kmeans[key]
              }
            }
            release(src)
            release(lo)
            release(hi)
            // release memory: Int32Array, Mat, pointer...
          } catch (error) {
            console.warn(error)
          }
        },
        postRun: [
          function (e) {
            try {
              console.log('load CV', Object.keys(kmeans).length, group.userData.el.getAttribute('data-idx'))

              let counts = []
              Object.values(kmeans).forEach((label) => counts.push(label.count))
              counts.sort((a, b) => a - b)
              const mean = counts.reduce((sum, num) => sum + num, 0) / counts.length

              // is it line art
              //const n1 = counts[Math.round(counts.length * 0.33)] / mean
              //const n2 = mean / counts[Math.round(counts.length * 0.66)]
              //const n = n1 / n2
              //const evenDist = n < 2 && n > 0.5

              function path(curve, points) {
                for (let cp = 0; cp < points.length; cp += 2) {
                  const vec = { x: points[cp], y: points[cp + 1] }
                  if (cp === 0) {
                    curve.moveTo(vec.x, vec.y)
                  } else {
                    curve.lineTo(vec.x, vec.y)
                  }
                }
              }

              //
              // Shape from label contours
              Object.values(kmeans).forEach((label) => {
                let mergedGeoms = []
                if (label.retr) {
                  Object.values(label.retr).forEach((retr) => {
                    // hierarchy shape
                    const shape = new THREE.Shape()
                    path(shape, retr.shape)
                    // hierarchy holes
                    shape.holes = []
                    for (let i = 0; i < retr.holes.length; i++) {
                      const hole = new THREE.Path()
                      path(hole, retr.holes[i])
                      shape.holes.push(hole)
                    }
                    // label contour
                    // in-out: element > reduced canvas > pyr sample (kmeans/inrange) > approxPoly
                    // ShapeGeometry path is not curve
                    let geometry = new THREE.ShapeGeometry(shape, 0.5)
                    // mergeVertices tolerance was crunched through opencv pyrdown
                    geometry = mergeVertices(geometry, 1)
                    mergedGeoms.push(geometry)
                  })
                }

                if (mergedGeoms.length) {
                  // label color
                  const rgba = label.rgba
                  const color = new THREE.Color('rgb(' + [rgba.r, rgba.g, rgba.b].join(',') + ')')
                  const material = mpos.var.mat_shape.clone()

                  material.color = color

                  if (rgba.a > 128) {
                    material.alphaHash = false
                  } else if (rgba.a > 1 && rgba.a < 32) {
                    // alphaTest: alpha has been through a lot!
                    material.opacity = rgba.a / 255
                  }

                  // label contours
                  // todo: cv.copyMakeBorder reduce triangles near corners
                  const mergedBoxes = mergeGeometries(mergedGeoms)
                  const mesh = new THREE.Mesh(mergedBoxes, material)

                  mpos.set.use(mesh)
                  group.add(mesh)
                }
              })

              kmeans = null
              mpos.set.fit(dummy, group)
              //mesh.layers.set(2)
            } catch (error) {
              console.warn(error)
            }
          }
        ]
      }

      //huningxin.github.io/opencv.js/samples/index.html
      // vars into Module._main:{} via Module._stdin:{ module: scope }
      opencv(Module)
    }
  },
  step: {
    rate: function (grade, step) {
      const { tool, time, opt } = mpos.var
      const { major } = grade
      const { frame, queue } = step

      //deepest pseudo match (frame cache)
      const root = grade.el.parentElement

      if (time.slice(8) & root)
        grade.capture = {
          hover: [...root.querySelectorAll('[data-idx]:hover')].pop(),
          active: [...root.querySelectorAll('[data-idx]:active')].pop(),
          focus: [...root.querySelectorAll('[data-idx]:focus')].pop()
        }

      //
      // Traverse: style transforms (set/unset), view settings, and qualify ux

      const gate = time.slice(4) || step.syncFPS === 0
      const isFrame = step.frame > 0

      for (const [idx, rect] of grade.rects) {
        //const rect = grade.rects.get(idx)
        //
        // ux.u (pre/post) is needed before css (pre/post) updates it
        const { ux } = rect
        // probably "batch" features inexhaustively comprehension shiv
        const stateOld = ux.u.has('pseudo')

        // pseudo: check parent/child (like matrix) primarily for cascade style, but also bubble transforms
        // ...

        if (time.slice(4) || step.syncFPS === 0) mpos.set.css(rect, step.frame)
        if (time.slice(16)) mpos.set.inPolar(rect)
        const inPolar = rect.inPolar >= grade.inPolar

        if (stateOld || (inPolar && rect.major === 'atlas' && time.slice(16))) {
          // && inPolar && isFrame
          if (rect.el.tagName === 'BODY') {
            // no propagate
            step.queue.add(idx)
          } else {
            // note: css should do this, but it is tied to rate pre/post and not a major feature (UNLESS PSEUDO IS THE WRONG TERM ~~ OTHER)???
            // should diffs apply the prop directly?

            if (stateOld || ux.u.size > 2 || ux.o) {
              // time.slice(2)
              // element ux changed or elevated
              // note: pseudo evaluates first, so atlas unset has consistent off-state
              step.queue.add(idx)

              if (stateOld || ux.u.has('pseudo')) {
                // note: pseudo is (active), or was (blur), so enqueue (with children)
                // ... to update atlas/transform by forcing ux.u="all"
                // todo: set ux.o++ priority (if ux.p), and use ux.u correctly
                // ... compare, inherit?

                //ux.u.add('all')// BAD

                if (rect.major === 'atlas' && (rect.minor === 'self' || rect.minor === 'child')) {
                  // enqueue children (ignore types which terminate)
                  if (!rect.hasOwnProperty('child')) {
                    // cache a static list
                    rect.child = new Set()

                    for (const [idx, child] of grade.rects) {
                      // add children from full list (ignore major.other, which propagation lacks support)
                      if (child.major === 'other') continue

                      //rect.css.pseudo = true
                      // force child on frame, for atlas/transform
                      // since top-down, we don't know if we can just do box
                      //rect_cap.ux.u = 'all'
                      if (rect.el.contains(child.el)) rect.child.add(idx)
                    }
                  }

                  // child evaluate
                  for (const idx of rect.child) {
                    // Frame capture: non-linear, but less brutal than ux.u=all
                    // may accrue frame ticks from multiple parents :)
                    const rect_cap = grade.rects.get(idx)
                    mpos.set.inPolar(rect_cap)
                    mpos.set.css(rect_cap, step.frame)

                    // boost priority
                    //rect_cap.ux.u.add('pseudo')
                    // stateOld/pseudo effect (hover or otherwise) should attempt to curate children
                    // by tween, or inPolar, or stylesheet pre/post... what is contageous in the bubble?
                    // users COULD be FORCED to add an EMPTY ANIMATION to trigger TWEEN
                    if (rect_cap.ux.u.has('pseudo') && rect_cap.ux.o > 1) step.queue.add(idx)
                  }
                }
              }
              //}
            }
          }
        }
        if (opt.arc) {
          // mokeypatch a update
          // bug: trigger once like 'move', and update minor.other
          rect.ux.u.add('matrix')
        }
      }
    },
    sync: async function (grade, pointer) {
      if (document.hidden || !grade || !!grade?.wait || !grade?.atlas?.canvas || (pointer && !grade?.major.queue.size)) {
        // skip frame
        return
      }

      const { opt, time, tool } = mpos.var
      const { major, atlas } = grade

      grade.wait = true
      grade.inPolar = opt.inPolar
      // Frame Sync and Feedback: render may invoke targets to collocate
      const syncFPS = pointer !== undefined ? time.slice(1, true) : 0
      // Framerate Limit: pivot sFenceSync describes execution priority, since event queue is indeterminate
      let sFenceSync = 1 / ((time.sFenceDelta - time.sFenceFPS) / (time.sFenceFPS / 2))
      sFenceSync *= 2
      let sPhaseSync = 0.5

      const step = { frame: 0, queue: new Set(major.queue), syncFPS: syncFPS, quality: 1 }

      //
      // HARD-update: viewport
      if (!pointer) {
        // new helper for document
        const idx = '9999'
        const rect = new mpos.mod.rect(document.body, { idx: idx, major: 'other', minor: 'wire', z: -9, fix: true, add: 1 })
        rect.ux.i = 1

        // output
        grade.rects.set(idx, rect)
        mpos.set.key(grade, rect)
        //major.other.add(idx)
      }

      //
      // SOFT-update: Observer or frame
      let reflow = false
      //step.queue = new Set(major.queue)

      major.queue.clear()
      for (const idx of step.queue) {
        if (isFinite(idx)) {
          // new from Observer
          const rect = grade.rects.get(idx)
          if (rect) mpos.set.key(grade, rect)
        } else if (idx === 'delay' || idx === 'move' || idx === 'trim') {
          reflow = true
          if (idx === 'delay') {
            const delay = opt[idx]
            const timer = mpos.ux.timers[idx]
            step.frame = timer[timer.length - 1]
            // quality limits pixelRatio of html-to-image
            const now = time.sFence.oldTime
            const elapsed = now - time.sPhaseLast || delay
            time.sPhaseLast = now
            // deviation from nominal
            sPhaseSync = Math.abs(0.5 - delay / elapsed)
          }
        }
      }

      //
      // Nominal Time Partition: real deviation
      step.quality = Math.max(Math.min(sFenceSync + sPhaseSync, 1), 0.5)
      //console.log('?:', [+sFenceSync.toFixed(3), +sPhaseSync.toFixed(3), +quality.toFixed(3)].join('   __   '))

      if (!pointer || reflow) {
        //
        // Emulate page flow: reduce and detect changes
        this.rate(grade, step) // reflow && time.slice(1, true)
      }

      //
      // Pass state to recursive loops

      if (!time.slice(2) || syncFPS || syncFPS === 0) {
        this.atlas(grade, step)
      } else {
        this.transforms(grade, step)
      }

      if (syncFPS) {
        //let extraframes = time.slice(2)
        //this.atlas(grade, step)
      } else {
        // Feedback Sample: state boundary value analysis
        // ramp (not gate) early exit
        //this.transforms(grade, step)
        // todo: is [...accumulate average] beneficial?
      }

      //
      // WebWorker
      /*
      mpos.var.worker.postMessage(
        {
          msg: 'atlas',
          origin: 'worker.js',
          opts: { rect: false }
        },
        []
      )
      */
    },
    atlas: function (grade, step = {}) {
      const { tool, fov, reset } = mpos.var
      const { atlas, major } = grade
      let { frame, queue, syncFPS, quality } = step

      // Constants for element/cell

      const inline = {
        style: { ...reset },
        canvasWidth: atlas.uv['1.0'].map,
        canvasHeight: atlas.uv['1.0'].map,
        pixelRatio: 1,
        preferredFontFormat: 'woff2',
        fontEmbedCSS: atlas.fontEmbedCSS,
        filter: grade.filter
        //const includeStyleProperties = ['background', 'color', 'margin', 'padding', 'border', 'font']
      }

      //
      // Queue settings
      if (step.syncFPS === 0) step.queue = new Set(major.atlas.values())
      let index = step.queue.size
      // breakpoints to paint
      step.paint = step.syncFPS === 0 && index >= 24 ? [index, Math.floor(index * 0.5)] : []

      //console.log('atlas queue', step.queue.size)

      //
      function meta(rect) {
        const { ux } = rect
        //console.log(rect.el, ux)
        //
        // Composition of features: is change explicit, inherited, or unset?
        //const shallow = ux.o === 0 && ux.u.size === 1 && ux.u.has('matrix')
        //const vis = step.syncFPS === 0 || rect.inPolar >= grade.inPolar
        const lowpass = ux.o > 0 && (ux.o > 1 || ux.u.size > 0 || step.syncFPS === 0)

        return step.syncFPS === 0 || (rect.inPolar >= grade.inPolar && (step.syncFPS === 0 || lowpass))

        //return vis || lowpass
      }

      for (const idx of step.queue) {
        let rect = grade.rects.get(idx)

        //
        // Bottleneck: limit... or FPS will drop and skew artefacts will appear

        if (rect && rect.hasOwnProperty('uv') && meta(rect)) {
          const uv = rect.uv

          //console.log('rect', rect.frame, rect.el, rect.ux)
          // Clone Options: unset or override element box style
          let options = structuredClone(inline)
          // tile scale
          //const wSize = uv.hasOwnProperty('idxMip') ? atlas.uv[uv.mip].map : atlas.uv['1.0'].map
          options.canvasWidth = options.canvasHeight = atlas.uv[uv.mip].map // a little speculative presumption that our mip will be honored by inventory space?
          // distance * performance
          const pixelRatio = rect.ux.o || rect.ux.u.size ? quality : 0.8
          options.pixelRatio = fov.dpr * pixelRatio

          if (!rect.hasOwnProperty('matrix')) {
            //slow frame?
          }

          // Feature tests
          if (rect.css && rect.css.style) {
            if (tool.diffs('flow', { rect: rect })) {
              options.style.top = options.style.right = options.style.bottom = options.style.left = 'initial'
            }
          }

          //if (tool.diffs('rect', { rect: rect })) {
          if (!rect.el.clientWidth || !rect.el.clientHeight) {
            // naturalWidth, naturalHeight
            //options.style.display = 'inline-block' // tame pop-in
            options.width = rect.el.offsetWidth // force size
            options.height = rect.el.offsetHeight // force size
          }

          //const isMatrix = tool.diffs('matrix', { style: rect.css.style })
          //if (isMatrix) {
          //  options.style.transform = 'initial'
          //}

          //
          // 1. step size even (atlas cells %0 no sub-pixels i.e. odd ~11)
          // canvas width/height pyr/step
          // *dpr (dpr on pixelratio causes font subpixel jitter)

          if (rect.minor === 'self') {
            //
            // draw background of container, but exclude child elements
            // may be tweaked for sizes, media sliders, bullets, etc...
            //
            // route 1: hide children and preserve whitespace
            //options.style['*'] = { visibility: 'hidden', opacity: '0' }
            // route 2: filter children and rely on width/height
            options.filter = function (clone) {
              return clone.isSameNode(rect.el)
            }
          }

          toSvg(rect.el, options)
            .then((clone) => {
              // svg preserves detail and is smaller file (but are canvas clones released from memory?)
              let img = new Image()
              let load = img.addEventListener('load', (e) => {
                //console.log(clone, img.src)

                removeEventListener('load', load)

                // no box
                // if (clone.width === 0 || clone.height === 0) {}

                // canvas xy, from top (FIFO)
                let mm = atlas.uv[uv.mip]

                if (uv.w === undefined) {
                  // assign scale
                  const cellsMipMax = ((mm.span / uv.mip) * atlas.cells) / uv.mip // minus 1 slot for keyTest

                  // 1. w == mip, but it's a number (shader) not a string (key)
                  // 2. mip is suggested scale, but space must be available
                  if (uv.mip != '1.0' && cellsMipMax > atlas.uv[uv.mip].idx) {
                    // cell mip 2x: quota is async/indeterminate
                    uv.w = uv.mip * 1
                    uv.idxMip = atlas.uv[uv.mip].idx++
                  } else {
                    // cell mip 1x
                    uv.w = 1
                    uv.mip = '1.0'
                    uv.idx = atlas.uv[uv.mip].idx++
                  }

                  // slots for key (or 2x) reserved/offset (also note idx==0 is falsy)
                  // all mips may use idx, but idxMip (!==1) may be less confusing (multiple 0's) and support layering or swapping
                  const _idx_ = uv.w === 1 ? uv.idx : uv.idxMip
                  let x, y

                  mm = atlas.uv[uv.mip]
                  if (uv.w === 1) {
                    // cell mip 1x (left)
                    x = (_idx_ % mm.span) * mm.map
                    y = Math.floor(_idx_ / mm.span) * mm.map
                  } else {
                    // cell mip 2x (right)
                    //
                    //const mSpan = atlas.cellMip / 2 // at half-count, the 2x size will reach limit appropriately
                    //x = atlas.size - cMap2 * ((Math.floor(_idx_ / mSpan) % mSpan) + 1)
                    //y = cMap2 * (_idx_ % mSpan)
                    //
                    // alternate:
                    // start at x-offset: -"gutter:

                    const xColumn = atlas.uv['1.0'].map * mm.xColumn
                    x = xColumn + (_idx_ % (mm.span / uv.mip)) * mm.map
                    y = Math.floor(_idx_ / (mm.span / uv.mip)) * mm.map
                  }
                  // canvas rounding trick, bitwise or
                  x = (0.5 + x) | 0
                  y = (0.5 + y) | 0

                  uv.x = x
                  uv.y = y

                  // shader xy, from bottom
                  // avoid 0 edge, so add 0.0001
                  uv.wX = (0.0001 + x) / atlas.size
                  uv.wY = (0.0001 + y + mm.map) / atlas.size
                }

                atlas.ctx.clearRect(uv.x, uv.y, mm.map, mm.map)
                atlas.ctx.drawImage(e.target, uv.x, uv.y, mm.map, mm.map)
                //}

                img.remove()
                img = null
              })

              // https://github.com/bubkoo/html-to-image/pull/146
              // v1.7.0 viewBox breaks SVG on Firefox (...output encode/decode replace is brittle)
              img.src = clone.replace('viewBox%3D', 'preserveAspectRatio%3D%22none%22%20viewBox%3D')
              options = clone = null
            })
            .catch((error) => {
              // image source bad or unsupported type
              // or unexpected content (xml load/unload)
              console.log('source error:', error)
            })
            .finally(() => {
              next()
            })
        } else {
          // trim, move...
          next()
        }
      }

      function next() {
        // breakpoints
        const paint = step.paint.indexOf(index) > -1
        index--

        if (paint || index === 0) {
          mpos.step.transforms(grade, step, paint)
        }
      }
    },
    transforms: function (grade, step, paint) {
      const { atlas, major } = grade
      const { frame, queue, syncFPS } = step
      const instanced = atlas.instanced
      const { time } = mpos.var

      //
      // Update Meshes from queue
      // note: queue.size===0 is from mod>add, versus a reflow>pointer

      //
      // Ray whitelist atlas/other
      // - more similar to inPolar than layout reflow
      // atlas :: instanceId (from ROIs) => intersect (ray) => rect (by dataIdx) => synthetic dispatch (element)
      // other :: ?=> intersect (ray) ?=> Mesh.userData.el ?=> rect (by dataIdx) => ...ditto
      // Example: synthetic dispatch
      // 0: { rect: {}, uv: {} } ...instanceId/dataIdx, element, uv, mat, position, bound
      const targets = []

      let newGeo, newMap
      //const myPromise = new Promise((resolve, reject) => {
      //
      const gate = time.slice(2) || step.syncFPS === 0

      if (!paint && gate) {
        //
        // Meshes other (matches Loader) update on tail
        //grade.scroll = { x: window.scrollX, y: window.scrollY }

        for (const [count, idx] of major.other) {
          const rect = grade.rects.get(idx)

          let scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
          const dummy = mpos.set.box(rect, { scroll: scroll, frame: frame })
          //if (dummy || rect.obj)

          if (rect.obj) {
            if (dummy) mpos.set.use(rect.obj, true)
            // Ray whitelist data-idx
            targets.push('r_idx_' + rect.idx)

            // update visibility if loaded
            // off-screen boxes may "seem" more visible than instancedMesh because they don't have a third state
            let vis = rect.fix ? true : rect.inPolar >= grade.inPolar
            rect.obj.visible = vis
            //if ( rect.add === 3 ) {
            //  rect.add = 4
            // ( while rect.obj.children.length-- ) show/hide nested groups }

            //
            // Update Animated Gif
            const keyframes = rect.obj.animate
            if (keyframes?.gif && time.slice(8)) {
              //7.5fps
              let { gif, duration, gifCtx /*, tempCtx, frameImageData*/ } = keyframes

              // Offset time and frame
              const relative = time.sFence.oldTime % duration
              let index,
                elapsed = 0
              for (let i = 0; i < gif.length; i++) {
                elapsed += gif[i].delay
                if (elapsed >= relative) {
                  index = i
                  break
                }
              }

              // Draw cache
              // todo: or from atlas index
              const cache = gif[index].cache
              gifCtx.drawImage(cache, 0, 0, gifCtx.canvas.width, gifCtx.canvas.height)

              // Perform Manipulation..?
              //https://matt-way.github.io/gifuct-js/javascripts/main.js

              // Update THREE
              rect.obj.material[4].map.needsUpdate = true
            }
          }
        }
      }

      //
      // Meshes atlas (general Instance) update priority and raycast

      if (gate) {
        const color = new THREE.Color()
        for (const [count, idx] of major.atlas) {
          const rect = grade.rects.get(idx)

          //let uxForce = rect.ux.i || rect.ux.o || rect.ux.u
          const inPolar = rect.inPolar >= grade.inPolar

          const dummy = mpos.set.box(rect, { frame: frame })
          if (dummy) instanced.setMatrixAt(count, dummy.matrix)

          //
          // Update feature difference (support background)
          // ...ad-hoc experiments like tooltip, catmull heatmap
          const meta = rect.ux.o || rect.ux.u.has('tween') || rect.ux.u.has('pseudo')
          if (inPolar && meta) {
            newMap = true
            const style = rect.css.style || rect.el.style
            // Instance Color (first-run)
            let bg = style.backgroundColor
            let rgba = bg.replace(/[(rgba )]/g, '').split(',')
            const alpha = rgba[3]
            if (alpha === '0') {
              // hidden: dom default, but could be user-specified
              bg = 'cyan'
            } else if (alpha > 0.0 || alpha === undefined) {
              // color no alpha channel
              bg = 'rgb(' + rgba.slice(0, 3).join() + ')'
            }
            instanced.setColorAt(count, color.setStyle(bg))
          }

          //
          // Update atlas uv and visibility
          let vis = -1
          let x, y, z
          const uv = rect.uv
          if (meta || dummy || rect.ux.u.has('matrix')) {
            if (uv || rect.minor === 'self') {
              // top-tier bracket
              if (uv && inPolar) {
                x = uv.wX
                y = 1 - uv.wY
                z = uv.w
              } else if (inPolar || grade.inPolar === 4) {
                // partial update from split frame (trim), due to scroll delay
                x = atlas.keyTest.x
                y = 1 - atlas.keyTest.y
              }
            }

            // bug frame: force inPolar/css, update instance.count, update render/texture, 3rd condition
            atlas.uvOffset.setXY(count, x || vis, y || vis)
            atlas.uvOffset.setZ(count, z || 1)
          }

          // Ray whitelist instanceId
          if (uv && inPolar /*&& rect.minor !== 'self'*/) {
            // note: event/raycast is strongly bound (like capture/bubble)
            // propagation quirks are thrown further by curating hierarchy (mat.self)
            targets.push(Number(count))
            //targets: { instanceId:0, dataIdx: 0, rect: rect ... uv }
          }
        }

        // Apply Updates
        instanced.count = major.atlas.size

        //instanced.computeBoundingSphere() // cull and raycast
        //instanced.instanceMatrix.needsUpdate = true
        if (newMap) instanced.instanceColor.needsUpdate = true
        atlas.uvOffset.needsUpdate = true // if buffer has new atlas positions (for example, hover works despite)
        // Atlas Postprocessing...?
        //ctxC.drawImage(OffscreenCanvas, 0, 0)
        mpos.set.use(instanced, true)
      }

      if (!paint) {
        const target = mpos.ux.events.target
        target.clear()
        targets.forEach((item) => target.add(item))
        // frame done
        grade.wait = false
      }

      // resolve('foo')
      //})
      //myPromise.then((res) => {
      mpos.ux.render(syncFPS)
      //})
      //
    }
  },
  ux: {
    timers: {
      reflow: [],
      delay: [],
      clear: function (key) {
        const timers = this[key]
        for (let i = timers.length - 1; i >= 0; i--) {
          clearTimeout(timers[i])
          timers[i] = null
          timers.splice(i, 1)
        }
      }
    },
    events: {
      target: new Set(),
      synthetic: {},
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2()
    },
    reflow: function (e) {
      // balance lag of input versus update
      const { grade } = mpos.var
      if (!grade) {
        return
      }
      const queue = grade.major.queue

      function enqueue(pointer) {
        // add unique
        queue.add(pointer)

        if (pointer === 'delay') {
          // immediate schedule, unless manually called -1
          if (e.value > 0) {
            // schedule next frame (but 0 doesnt, and -1 clears without update)
            mpos.ux.reflow({ type: e.type, value: e.value })
          }
          if (!grade.wait) {
            // update current queue
            mpos.step.sync(grade, pointer)
          }
        } else {
          // debounce concurrent
          requestIdleCallback(
            function () {
              if (queue.size) {
                mpos.step.sync(grade, pointer)
              }
            },
            { time: 125 }
          )
        }
      }

      if (e.isIntersecting) {
        // enqueue visible element
        const pointer = e.target.getAttribute('data-idx')
        enqueue(pointer)
      } else {
        // event schedule or throttle
        const [timer, timeout] = e.type === 'delay' ? ['delay', e.value] : ['reflow', 62.5]

        mpos.ux.timers.clear(timer)
        if (e.value === -1) {
          // user can clear a timer...?
          return
        }

        mpos.ux.timers[timer].push(
          setTimeout(() => {
            const { opt, fov, camera, renderer, rendererCSS } = mpos.var
            // setTimeout is global scope, so strictly re-declare vars

            if (e.type === 'resize') {
              // ...recalculate inPolar and update?
              const container = renderer.domElement.parentElement
              fov.width = container.offsetWidth
              fov.height = container.offsetHeight

              camera.aspect = fov.width / fov.height
              camera.updateProjectionMatrix()

              renderer.setSize(fov.width, fov.height)
              rendererCSS.setSize(fov.width, fov.height)

              mpos.ux.render()
            } else {
              let pointer = e.type
              if (e.type === 'scroll') {
                // update visibility?
                pointer = opt.inPolar === 4 ? 'trim' : 'move'
              }
              enqueue(pointer)
            }
          }, timeout)
        )
      }
    },
    render: function (gate) {
      const { grade, mat_shader, scene, camera, renderer, rendererCSS, tool, time } = mpos.var

      if (document.hidden) {
        // todo: visibilitychange prevent 300fps
        return
      }

      //
      // Sync Boundary: junction of mapcontrols and transform updates
      const slice = time.sFenceFPS_slice
      if (gate) {
        // syncFPS complete from updated transforms
        slice.gate = Infinity
      }

      time.sFenceDelta += time.sFence.getDelta()
      const syncFPS = time.sFenceDelta > time.sFenceFPS
      if (syncFPS) {
        // syncFPS aligned and ramp reset
        slice.gate = true
        slice.ramp = 0

        //
        // Framerate Monitor: Forward Performance Trail
        //
        // Render calls are non-contiguous (time), and slice boundaries are non-continuous (gate).
        // - syncFPS power: notional resolution of bitmask slice([1,2,4...]) indicates lossiness
        // - boundary: time slice composed of gate and 1+ ramp
        // - gate: notional fps
        // - ramp: subframe call to render
        // - quota: average indicator of continuous frames (low is better)
        //
        //  -- preventing lag == not having lag -- > -+ > ++ >
        //  mixin: ramp exceeds 3 (++) or quota exceeds 3 (--)
        //  - quota 4 @60fps sync indicates 15fps
        //  - update return early (like grade.wait)
        //  - compute something else (gc, re-build atlas, hard refresh...)
        //
        //
        // - To modulate more against render queue (delay/interval), sync high sFenceFPS (120fps > moderate > 15fps)
        // - For denser slice alignment, shift gate boundary if odd (!(quota%2))
        //   after comparison (of time to gate), so resolution power "resets" (after delay).
        // - Quota may also be "reset" after a fault or period.
        //
        // ..||.|:..
        //

        const quota = Math.floor(time.sFenceDelta / time.sFenceFPS)
        slice.boundary += quota // Math.floor((.6) / .3)

        if (slice.boundary % 1000 === 0) slice.quota.count /= 2
        mpos.var.tool.avg(quota, slice.quota)

        //stackoverflow.com/questions/11285065/#answer-51942991
        time.sFenceDelta %= time.sFenceFPS
      }

      // if this reaches 5, the next sync may only reach 1
      slice.ramp++

      //console.log(slice.boundary, slice.ramp, slice.quota)
      // [3,4,5,7,9],[1,2,3,4,1,1,1],[2,3,3,3,4,4]

      // ###
      //if (time.slice(4)) {
      //console.log('60+30+15')
      //} else if (time.slice(2)) {
      //console.log('60+30')
      //} else if (time.slice(1)) {
      //console.log('60')
      //}
      // ###

      if (time.slice(1, true) || gate === 0) {
        // gate if init or just force a frame?????
        //
        // FPS slice minimum (60fps?)
        if (grade) {
          // animation step
          grade.group.traverse((obj) => {
            if (obj.animate) {
              if (obj.animate === true) {
                const animationTime = Date.now() / 50
                // wiggle root
                obj.rotation.x = Math.sin(animationTime) / 100
                obj.rotation.y = Math.cos(animationTime) / 200
                obj.position.z = -9
              } else if (obj.animate.gif) {
                // refresh SuperGif
                //obj.material.map.needsUpdate = true
              }
            }
          })

          // Controls events can stack up render calls outside of frameloop timer
          tool.dpr()
        }

        // instanced elements need texture update
        const texture = mat_shader.userData.t
        if (texture) texture.needsUpdate = true
        //instanced.instanceColor.needsUpdate = true

        // Compile
        scene.updateMatrixWorld()
        renderer.render(scene, camera)
        rendererCSS.render(scene, camera)

        stats.update()
      }

      //requestAnimationFrame(this)
    },
    raycast: function (e) {
      const { grade, camera, caret } = mpos.var
      let synthetic = {}

      //
      // Align Event to Pair (atlas/other) for Delegation
      // note: update queue > transforms > inPolar > events.target[] > raycast (group > layer 2)
      if (grade && grade.wait !== Infinity) {
        const events = mpos.ux.events
        events.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        events.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1

        events.raycaster.setFromCamera(events.pointer, camera)
        let intersects = events.raycaster.intersectObjects(grade.group.children, false)
        intersects = intersects.filter((hit) => {
          const useId = hit.object.isInstancedMesh
          const target = useId ? hit.instanceId : 'r_idx_' + hit.object.userData.idx

          // todo: align userDatas idx for atlas to map instanceId
          // ...so rects[...hit.idx]
          // PRO: consistent (atlas/other), fewer lookup, ensure key/index position
          // CON: another list, another data-idx record, per-frame vs on-demand

          return events.target.has(target)
        })

        //
        // Synthetic Event: bottom phase (Native and Three)
        if (intersects.length) {
          const hit = intersects[0]

          //console.log('hit', hit)
          const useId = hit.object.isInstancedMesh

          //tool.dpr(hit.distance)

          //
          //if (hit.object) {
          // Synthetic Dispatch Event
          // Set lacks array index:idx for atlas instanced element... map keeps an extra reference... array can be fine (if slower?)
          const rect = useId ? grade.rects.get(grade.major.atlas.get(hit.instanceId)) : grade.rects.get(hit.object.userData.idx)
          synthetic = { rect: rect, uv: hit.uv }

          //
          // minimap debug
          caret.title = rect.idx + rect.el.nodeName
          const caretROI = caret.style
          // visibility
          const color = rect.inPolar >= 4 ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)'
          caretROI.backgroundColor = color
          // location
          if (rect.uv?.hasOwnProperty('w')) {
            const cell = 100 * (1 / grade.atlas.cells) * rect.uv.w
            caretROI.width = caretROI.height = cell + '%'
            caretROI.left = 100 * rect.uv.wX + '%'
            caretROI.bottom = 100 * (1 - rect.uv.wY) + '%'
            caretROI.right = 'inherit'
          } else {
            // child container
            //caretROI.width = '100%'
            caretROI.backgroundColor = 'transparent'
            caretROI.left = caretROI.bottom = 'inherit'
            caretROI.right = 0
          }
          // }
        } else {
          // synthetic = synthetic[delay.length-1]
          // todo: use last events within timerange or proximity?
          // todo: fallback events for special interactions
        }

        events.synthetic = synthetic // preserve last user event?
      }
      return synthetic
    },
    event: function (e) {
      const { controls } = mpos.var

      //
      // Raycaster Targets
      // note: events are decoupled from update queue
      // todo: synchronize trailing/current click-target... and multi-sample?
      controls.enablePan = true

      const { rect, uv } = mpos.ux.raycast(e)
      if (!rect || !uv) return

      if (rect.minor === 'native') {
        // form, video, draggable ( || rect.ux.o || THREE.STATE.PAN )
        controls.enablePan = false
      }

      //if (e.type === 'mousemove' || e.type === 'mousedown') {
      //}

      //github.com/mrdoob/three.js/blob/dev/examples/jsm/interactive/HTMLMesh.js#L512C1-L563C2
      //  -+  ++  //  --  +-  //
      //    uv    //    xy    //
      //  --  +-  //  -+  ++  //

      // Position on Texture
      const element = rect.el

      // Position on Element
      const offsetX = uv.x * element.offsetWidth
      const offsetY = (1 - uv.y) * element.offsetHeight
      //console.log('element', offsetX, offsetY)

      // Position on Window
      // we know target element (uv/xy) at depth of mpos
      // but native form may have finer control elements
      const style = rect.css.style || rect.el.style
      const position = style.position || 'auto'
      const [scrollX, scrollY] = position === 'fixed' ? [0, 0] : [window.scrollX, window.scrollY]
      const x = offsetX + rect.bound.left
      const y = offsetY + rect.bound.top
      //console.log('window', x, y)

      //
      // Event Candidate(s) to emit
      let emit
      const blacklist = '[data-engine^=three], section#mp, body, html'
      const emits = document.elementsFromPoint(x, y).filter((el) => {
        return !el.matches(blacklist)
      })

      if (emits.length) {
        // NodeWalking...
        emit = emits[0]
      } else {
        // note: quirk, such as scroll overflow
        console.log('no ux target')
      }

      // Synthetic Event
      const MouseEventInit = {
        view: element.ownerDocument.defaultView,
        bubbles: true,
        cancelable: true
      }

      // Synthetic Propagate: delegate quirks (e.relatedTarget, xyz <= parent, nodeType==widget)
      let NodeWalker
      if (emit) {
        // Dispatch Specific
        MouseEventInit.screenX = x //pageX, screenX, clientX
        MouseEventInit.screenY = y //pageY, screenY, clientY
        NodeWalker = emit
      } else {
        // Dispatch General
        MouseEventInit.offsetX = offsetX
        MouseEventInit.offsetY = offsetY
        NodeWalker = element
      }

      //
      // Event Dispatch
      const event = new MouseEvent(e.type, MouseEventInit)
      NodeWalker.dispatchEvent(event)
      //console.log(rect, uv, emits, NodeWalker)
    }
  }
}

window.mpos = mpos

/**
 * window.requestIdleCallback()
 * version 0.0.0
 * Browser Compatibility:
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback#browser_compatibility
 */
if (!window.requestIdleCallback) {
  window.requestIdleCallback = function (callback, options) {
    var options = options || {}
    var relaxation = 1
    var timeout = options.timeout || relaxation
    var start = performance.now()
    return setTimeout(function () {
      callback({
        get didTimeout() {
          return options.timeout ? false : performance.now() - start - relaxation > timeout
        },
        timeRemaining: function () {
          return Math.max(0, relaxation + (performance.now() - start))
        }
      })
    }, relaxation)
  }
}

export default mpos
