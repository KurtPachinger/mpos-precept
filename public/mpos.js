import './mpos.css'
import { toSvg, toCanvas, getFontEmbedCSS } from 'html-to-image'
// ...OpenCV, SuperGif

import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import Stats from 'three/examples/jsm/libs/stats.module.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'

const mpos = {
  fnVar: function (tool, value, opts = {}) {
    // Syntactic Suger: allow keys and map variable scope
    const vars = this.var
    switch (tool) {
      //case 'find':
      //  opts.grade = vars.grade
      //  break
      case 'march':
        opts.selector ||= vars.opt.selector
        opts.depth ||= vars.opt.depth
        opts.precept = this.mod.precept
        break
      default:
        opts.var = vars
    }
    const promise = new Promise((resolve, reject) => {
      //
      const fnvar = vars.tool[tool]
      const response = fnvar ? fnvar(value, opts) : 'no fnVar'
      console.log(`tool ${tool} ${value}:`, response)
      resolve(response)
      reject('err' + tool)
    })

    //console.log('fnVar:', promise)
    return promise
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
      selector: 'main',
      custom: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 8,
      inPolar: 3,
      arc: 0,
      delay: 0,
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

      chain: function (selector, opts = {}) {
        // chain of elements
        let nodeName = opts.nodeName || 'mp'
        let chains = document.createElement(nodeName)
        chains.classList.add('mp-allow', 'march')
        let last = chains
        while (--opts.count) {
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
        last.innerHTML += opts.symbol
        document.querySelector(selector)?.prepend(chains)

        return chains
      },
      find: function (term, opts = {}) {
        // find rects by key
        let rect
        const grade = opts.var.grade

        if (term === 'first' || term === 'last') {
          let position = term === 'first' ? 0 : rects.length - 1
          rect = Object.values(grade.rects)[position]
        } else if (term === 'atlas' || term === 'other') {
          rect = grade.major[term].rects
        } else {
          rect = grade.rects[term]
        }

        return rect
      },
      march: function (selector, opts = {}) {
        // chain to depth under cutoff
        let outer = document.querySelector(opts.selector)
        let inner = document.querySelector(selector)
        let depth = 0
        while (inner) {
          if (inner.isSameNode(outer) || !inner.parentElement || ++depth > 32) {
            break
          }
          inner = inner.closest(opts.precept.allow)
        }

        // (-2): extend (child) to depth -1, and head (poster) -1
        depth += (opts.depth || mpos.var.opt.depth) - depth - 2

        return depth
      },
      diffs: function (type, opts = {}) {
        let differ = false
        const rect = opts.rect
        const style = rect.css.style || rect.el.style // computed or direct if not priority

        //
        // Different from Baseline Generic Primitive

        if (type === 'rect') {
          differ = !rect.el.clientWidth || !rect.el.clientHeight
          // note: opts.whitelist quirks ( || el.matches('a, img, object, span, xml, :is(:empty)' )
        } else if (type === 'matrix') {
          // note: style may be version from css frame accumulating
          rect.css.rotated = rect.bound.width / rect.bound.height !== rect.el.offsetWidth / rect.el.offsetHeight
          differ = rect.css.rotated || style.transform?.startsWith('matrix')
        } else if (type === 'tween') {
          // note: loose definition
          // ...transform, filter, overlay, allow-discrete
          differ =
            (style.transitionProperty !== '' && parseFloat(style.transitionDuration) > 0) ||
            (style.animationName !== 'none' && style.animationPlayState === 'running')
        } else if (type === 'flow') {
          // note: if position overflows scrollOffset, canvas may not draw
          differ = style.zIndex >= 9 && (style.position === 'fixed' || style.position === 'absolute')
          //&& !!(parseFloat(style.top) || parseFloat(style.right) || parseFloat(style.bottom) || parseFloat(style.left))
        } else if (type === 'pseudo') {
          // note: get pseudo capture once per frame for all rects
          let css = rect.css
          if (css) {
            let capture = opts.capture || {
              // deepest pseudo match
              hover: [...opts.el.querySelectorAll(':hover')].pop(),
              active: [...opts.el.querySelectorAll(':active')].pop(),
              focus: [...opts.el.querySelectorAll(':focus')].pop()
            }

            // note: pseudo (or unset prior frame) enqueued for atlas
            differ = css.pseudo
            css.pseudo = rect.el === capture.active || rect.el === capture.focus || (rect.el === capture.hover && rect.minor === 'poster')
            differ = differ || css.pseudo

            rect.ux.p = differ
          }
        }

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
                    obj.animate.gif.pause()
                    obj.animate.gif = null
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
            grade.atlas.ctx.reset()
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
                  ;['src', 'data'].forEach(function (attr) {
                    let els = document.querySelectorAll(`[${attr}$="${name}"]`)
                    if (els.length) {
                      //console.log('some:', els)
                      els.forEach(function (el) {
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
      }
    }
  },

  init: function (opts = {}) {
    const vars = mpos.var
    const { opt, fov } = vars

    const promise = new Promise((resolve, reject) => {
      //
      // Mode: Proxy or Standalone
      const proxy = !!(opts.scene && opts.camera && opts.renderer)

      vars.scene = opts.scene || new THREE.Scene()
      vars.scene.autoUpdate = vars.scene.matrixAutoUpdate = vars.scene.matrixWorldAutoUpdate = false
      vars.renderer =
        opts.renderer ||
        new THREE.WebGLRenderer({
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
      events.forEach(function (event) {
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
      Object.keys(opt).forEach(function (key) {
        const params = {
          selector: [['body', 'main', '#native', '#text', '#loader', '#media', '#live', 'custom']],
          depth: [0, 32, 1],
          inPolar: [1, 4, 1],
          delay: [0, 133.333, 8.333],
          arc: [0, 1, 0.25]
        }
        const param = params[key] || []
        const controller = gui.add(opt, key, ...param).listen()

        if (key === 'delay') {
          controller.onFinishChange(function (v) {
            ux.reflow({ type: 'delay', value: v })
          })
        }
      })

      resolve(opts)
      reject('err')
    })

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
        this.el = node
      }
      el = {}
      idx
      bound = {}
      css = {
        // style: {},
        degree: 0,
        pseudo: false,
        radian: 0,
        rotated: false,
        scale: 1,
        transform: 0
      }
      frame
      inPolar
      major
      minor
      ux = { i: 0, o: 0, u: 0 /*p:*/ }
      z = 0
    },
    treeGrade: class {
      //
      // Build DOM Tree Structure

      // Template Isolate
      group = new THREE.Group()
      batch = ++mpos.var.batch // unique group identifier
      atlas = {
        idxMip: 0, // implies poster++ (from depth/type) and not other
        idxMip2: 0,
        // configure
        size: 2_048,
        cellMip: 14,
        cellMip2: 4
      }
      elsMin = 0 // inPolar or Observer
      elsMax = 0 // data-idx
      inPolar = mpos.var.opt.inPolar
      // sets and subsets
      txt = []
      rects = {}
      major = {
        // live values
        queue: [],
        atlas: new Set(),
        other: new Set()
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
        this.group.name = opts.selector
        this.atlas.fontEmbedCSS = /*await getFontEmbedCSS(grade.el)*/ ''
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
              if (mpos.set.inPolar(rect, grade.rects) && sibling(node.parentNode)) {
                // sanitize #text orphan (semantic or list) with parent visible
                const wrap = document.createElement('span')
                wrap.classList.add('mp-poster')
                node.parentNode.insertBefore(wrap, node)
                wrap.appendChild(node)

                rect.el = wrap
                mpos.set.inPolar(rect)
                grade.txt.push(node)
              }
            }

            if (rect.inPolar >= 2) {
              // Element in Document
              const idx = grade.elsMax++
              rect.idx = idx
              rect.el.setAttribute('data-idx', idx)
              grade.rects[idx] = rect
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
    treeDeep: function (grade, opts) {
      const precept = this.precept
      const depth = opts.depth

      function setRect(rect, z, mat, unset) {
        //
        // Qualify Geometry Usage
        if (rect) {
          rect.minor = mat
          rect.z = z

          //
          // Assign Archetype
          // note: atlas excludes rect.minor type "native" that matches CORS... to CSS3D
          // ... atlas "poster" became first-class, so the logic is !!BetterLate
          const other = rect.minor === 'loader' || rect.minor === 'wire' || rect.el.matches([precept.cors, precept.native3d])
          rect.major = other ? 'other' : 'atlas'

          // elevate priority for ux update (not hyperlinks or CSS3D)
          const uxin = rect.minor === 'native' && rect.el.tagName !== 'A' && rect.major !== 'other' ? 1 : 0
          rect.ux = { i: uxin, o: 0, u: false }

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
          precept.manual.every(function (classMat) {
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
        const rect = grade.rects[sel.getAttribute('data-idx')]

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

            const rect = grade.rects[node.getAttribute('data-idx')]
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
      return treeSet(grade.el, depth)
    },
    treeSort: function (grade) {
      const { atlas, rects } = grade
      let cellMip2Max = (atlas.cellMip / 2) * (atlas.cellMip2 / 2)
      const areaAvg = (atlas.size / atlas.cellMip) ** 2

      //
      // Complete Preparation
      Object.keys(rects).forEach((idx) => {
        const rect = rects[idx]

        if (rect.minor) {
          //rect.idx = Number(idx)

          const area = rect.el.offsetWidth * rect.el.offsetHeight
          if ((rect.minor === 'poster' || (rect.major === 'atlas' && rect.minor === 'native')) && area > areaAvg && 0 < cellMip2Max) {
            // note: cumulative average requires async/await (deterministic)
            //console.log('atlasW', rect)
            rect.idxMip2 = atlas.idxMip2++
            cellMip2Max--
          }
        } else {
          // free memory
          const node = document.querySelector('[data-idx="' + idx + '"]')
          node && node.removeAttribute('data-idx')
          rects[idx] = null
          delete rects[idx]
        }
      })
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
            .then(function (res) {
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
        grade.el = element
        grade.wait = Infinity
        await tool.old()

        //const atlasWide = { count: 0, average: 0 }
        this.treeFlat(grade)
        this.treeDeep(grade, opts)
        this.treeSort(grade)

        //
        // Texture Atlas: relative to grade
        const atlas = grade.atlas
        const canvas = document.createElement('canvas')
        document.querySelector('#mp #atlas').appendChild(canvas)
        atlas.canvas = canvas
        // note: if dynamic (atlas size, cellMip), update between treeDeep (elsMax++, areaAvg++) and treeSort (cellMip2, idxMip2)
        canvas.width = canvas.height = atlas.size
        canvas.title = `${grade.group.name}#${grade.batch} ${atlas.size}px/${atlas.cellMip}`
        // ... cellMip2 from average area ( & size & cellMip )
        atlas.cMap = atlas.size / atlas.cellMip
        atlas.cMap2 = atlas.cMap * 2
        atlas.keyTest = { x: 0, y: 0.0001, alpha: 'rgba( 0, 255, 255, 0.125 )' } // empty structure (cyan)

        //
        // Instanced Mesh and
        const shader = mpos.set.shader(canvas, atlas.cellMip, mat_shader)
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
      mpos.step.sync(grade)
      return opts || grade
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
          vis = Object.values(control).some(function (tag) {
            const parent = node.parentElement
            const unlist = parent && parent.offsetWidth && parent.offsetHeight
            return unlist && node.compareDocumentPosition(tag.el) & Node.DOCUMENT_POSITION_CONTAINS
          })
        } else {
          // 1: Node not empty
          if (node.tagName) {
            // 2: Node is tag
            vis++
            rect.bound = node.getBoundingClientRect()
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
        if (rect.minor === 'poster' || (rect.major === 'atlas' && rect.minor === 'native')) {
          // Instanced
          rect.idxMip = grade.atlas.idxMip++
        } else if (rect.major === 'other') {
          // STATES:
          // 1: to be added, 2: being added, 3: added
          rect.add = 1
        }

        // add key
        _major_.add(rect.idx)
        //_major_.count++
      }
    },
    box: function (rect, opts = {}) {
      if (rect.frame && rect.ux.u === false) {
        return false
      }

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
        } else if (obj.isGroup) {
          // group implies loader, with arbitrary scale
          const dummy = new THREE.Object3D()
          dummy.position.set(x, y, z)
          dummy.scale.set(w * rect.css.scale, h * rect.css.scale, d)
          obj.rotation.z = -rect.css.radian

          // note: group affects raycast events and click-targets
          mpos.set.fit(dummy, obj)
        } else {
          // generic dummy, i.e. atlas
          obj.position.set(x, y, z)
          obj.scale.set(w * rect.css.scale, h * rect.css.scale, d)
          obj.rotation.z = -rect.css.radian
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

      rect.ux.u = false
      return res
    },
    css: function (rect, frame) {
      const { grade, tool } = mpos.var

      //
      // CSS Style Transforms: accumulate a natural box model

      if (!rect.frame || frame > rect.frame) {
        // css style: transform, transformOrigin, backgroundColor, zIndex, position

        const css = rect.css
        //
        // ux frame change pre/post calculable? (imperative)
        let differ = { bound: rect.bound, scale: css.scale, degree: css.degree }
        rect.ux.u = false
        // reset transforms
        css.scale = 1
        css.radian = 0
        css.degree = 0
        css.transform = 0

        //
        // ux priority may escalate (declarative)
        const rotated = tool.diffs('matrix', { rect: rect })
        if (!css.style && (rect.ux.i || rotated)) css.style = window.getComputedStyle(rect.el)
        // style computed for feature lazily / progressively
        const priority = rect.css.pseudo || rotated || tool.diffs('tween', { rect: rect })
        rect.ux.o = priority ? rect.ux.i + 1 : rect.ux.i

        if (!css.style && rect.ux.o) css.style = window.getComputedStyle(rect.el)

        let el = rect.el
        let max = 8 // deep tree?
        let style, transform, scale, degree, radian

        while (el && max--) {
          if (el.isSameNode(document.body) || el.isSameNode(document.documentElement) || !el.parentElement) {
            break
          }

          const _rect_ = grade.rects[el.getAttribute('data-idx')]
          if (_rect_?.ux.o) {
            // accumulate ancestor matrix
            style = _rect_.css.style || css.style // || window.getComputedStyle(el)
            if (style && style !== 'none' && rotated /*tool.diffs('matrix', { rect: rect })*/) {
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
          }

          el = el.parentElement.closest('[data-idx]')
        }

        // update rect properties from frame
        rect.css = css
        rect.bound = rect.el.getBoundingClientRect()

        rect.bound.symmetry = [rect.el.offsetWidth, rect.el.offsetHeight].join('_')

        // compare frame result to detect change
        let newBound = JSON.stringify(differ.bound) !== JSON.stringify(rect.bound)
        let newMatrix = differ.scale !== rect.css.scale || differ.degree !== rect.css.degree
        if (newBound || newMatrix || rect.ux.o) {
          // feature testing
          let update = 'all'
          if (newBound) {
            // deeper comparison stub
            newBound = differ.bound.symmetry !== rect.bound.symmetry
          }
          if (!newBound || !newMatrix) {
            update = newBound ? 'box' : 'css'
          }
          // to reduce queue of atlas/transforms
          rect.ux.u = update
        }
      }

      //
      // Frame or Mouseevent
      if (frame > rect.frame || !rect.hasOwnProperty('frame')) {
        // frame update
        rect.frame = frame || 0
      } else {
        // mouseevents (0) provide some increment
        const tick = 0.001
        rect.frame += tick
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
      let mime = uri && uri.match(/\.(json|svg|gif|jpg|jpeg|png|webp|webm|mp4|ogv)(\?|$)/gi)
      mime = mime ? mime[0].toUpperCase() : 'File'
      let loader = !!((mime === 'File' && uri) || mime.match(/(JSON|SVG|GIF)/g))

      //
      // Cache: models (or whatever...?)
      let asset = cache.get(uri) || { mime: mime, data: false, flag: {} }

      //console.log(source, uri, mime, loader, dummy )
      let group = rect.obj

      if (mime.match(/(WEBM|MP4|OGV)/g)) {
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
        mesh.layers.set(2)
        //mpos.set.use(mesh)
        rect.add++
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

          toCanvas(source, { style: { ...reset }, width: width, height: height, pixelRatio: 1 })
            .then(function (clone) {
              rect.add++
              mpos.set.opencv(clone, group, dummy)
              clone = null
            })
            .catch(function (error) {
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
              gc = source.cloneNode()
              document.querySelector('#custom').appendChild(gc)
            }

            loader = mime.match('.SVG')
              ? new SVGLoader()
              : mime.match('.GIF')
              ? new SuperGif({ gif: gc, max_width: 128 })
              : mime.match('.JSON')
              ? new THREE.ObjectLoader()
              : new THREE.FileLoader()

            const params = loader instanceof THREE.Loader ? uri : callback
            const res = loader.load(
              params,
              callback,
              function (xhr) {
                console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`)
              },
              function (error) {
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
            } else if (mime.match('.GIF')) {
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
              // prioritize play state
              rect.ux.i = 1
              mesh.animate = { gif: loader }
              mesh.animate.gif.play()
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
            }

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
            Object.keys(kmeans).forEach(function (key) {
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

                Object.keys(rgba).forEach(function (channel) {
                  if (channel !== 'a') {
                    let band = rgba[channel] + range
                    band *= factor
                    band = band < 128 ? Math.max(band, 0) : Math.min(band, 255)
                    bands[channel] = band
                  }
                })

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
            })
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
              console.log('load cv', Object.keys(kmeans).length, group.userData.el.getAttribute('data-idx'))

              let counts = []
              Object.values(kmeans).forEach((label) => counts.push(label.count))
              counts.sort((a, b) => a - b)
              const mean = counts.reduce((sum, num) => sum + num, 0) / counts.length

              // is it line art
              //const n1 = counts[Math.round(counts.length * 0.33)] / mean
              //const n2 = mean / counts[Math.round(counts.length * 0.66)]
              //const n = n1 / n2
              //const evenDist = n < 2 && n > 0.5

              // Shape from label contours
              Object.values(kmeans).forEach(function (label) {
                let mergedGeoms = []
                if (label.retr) {
                  Object.values(label.retr).forEach(function (retr) {
                    // hierarchy shape
                    const points = retr.shape
                    const poly = new THREE.Shape()
                    for (let p = 0; p < points.length; p += 2) {
                      const pt = { x: points[p], y: points[p + 1] }
                      if (p === 0) {
                        poly.moveTo(pt.x, pt.y)
                      } else {
                        poly.lineTo(pt.x, pt.y)
                      }
                    }
                    // hierarchy holes
                    poly.holes = []
                    for (let i = 0; i < retr.holes.length; i++) {
                      const path = new THREE.Path()
                      const hole = retr.holes[i]
                      for (let p = 0; p < hole.length; p += 2) {
                        let pt = { x: hole[p], y: hole[p + 1] }
                        if (p === 0) {
                          path.moveTo(pt.x, pt.y)
                        } else {
                          path.lineTo(pt.x, pt.y)
                        }
                      }
                      poly.holes.push(path)
                    }
                    // label contour
                    // in-out: element > reduced canvas > pyr sample (kmeans/inrange) > approxPoly
                    // ShapeGeometry path is not curve
                    let geometry = new THREE.ShapeGeometry(poly, 0.5)
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

                  if (rgba.a > 192) {
                    //material.alphaHash = false
                  } else if (rgba.a < 128) {
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
    rate: function (grade, rFrame, capture, reQueue) {
      const { tool, time, opt } = mpos.var
      const { major } = grade
      //const rects = major[type].rects

      // update element rect
      Object.keys(grade.rects).forEach(function (idx) {
        const rect = grade.rects[idx]
        // update visibility
        if (time.slice(2)) mpos.set.inPolar(rect)
        //
        // Traverse: style transforms (set/unset), view settings, and qualify ux
        if (time.slice(1, true)) mpos.set.css(rect, rFrame)

        if (rect.major === 'atlas' && reQueue) {
          if (rect.inPolar >= grade.inPolar) {
            if (rect.el.tagName === 'BODY') {
              // no propagate
              major.queue.push(idx)
            } else {
              let pseudo = tool.diffs('pseudo', { rect: rect, el: grade.el, capture: capture }) && (rect.ux.p || time.slice(2))
              if (pseudo || rect.ux.o || rect.ux.u) {
                // element ux changed or elevated
                // note: pseudo evaluates first, so atlas unset has consistent off-state
                if (major.queue.indexOf(idx) === -1) {
                  major.queue.push(idx)
                }

                if (rect.ux.p) {
                  // note: pseudo is (active), or was (blur), so enqueue (with children)
                  // ... to update atlas/transform by forcing ux.u="all"
                  // todo: set ux.o++ priority (if ux.p), and use ux.u correctly
                  // ... compare, inherit?
                  rect.ux.u = 'all'
                  rect.ux.p = false

                  // children propagate
                  if (!rect.hasOwnProperty('child')) {
                    let idx,
                      child = []
                    // cache a static list
                    rect.el.querySelectorAll('[data-idx]').forEach((el) => {
                      idx = el.getAttribute('data-idx')
                      let rect = rects[idx]
                      //rect.css.pseudo = true
                      if (rect && rect.minor === 'poster') {
                        rect.ux.u = 'all' // force child on frame, for atlas/transform...?
                        child.push(idx)
                      }
                    })
                    rect.child = child
                  }

                  if (time.slice(2)) major.queue.push(...rect.child)
                }
              }
            }
          }
        }
        if (opt.arc) {
          // mokeypatch a update
          // bug: trigger once like 'move', and update minor.other
          rect.ux.u = !rect.ux.u || rect.ux.u === 'css' ? 'css' : 'all'
        }
      })
    },
    sync: async function (grade, rType) {
      if (document.hidden || !grade || !!grade?.wait || !grade?.atlas?.canvas || (rType && !grade?.major.queue.length)) {
        // skip frame
        return
      }

      const { opt, time } = mpos.var
      const { atlas, major } = grade

      //
      // Emulate Page Flow: reduce and detect changes
      grade.wait = true
      grade.inPolar = opt.inPolar
      let rFrame = 0
      let quality = 1

      //
      // Frame Sync and Feedback: render may invoke targets to collocate
      let sPhaseSync = 0.5
      // Framerate Limit: pivot sFenceSync describes execution priority, since event queue is indeterminate
      let sFenceSync = 1 / ((time.sFenceDelta - time.sFenceFPS) / (time.sFenceFPS / 2))
      sFenceSync *= 2
      // Beacon to render
      let syncFPS = time.slice(1, true)

      if (rType) {
        // SOFT-update: Observer or frame
        let reflow = false
        for (let i = major.queue.length - 1; i >= 0; i--) {
          const idx = major.queue[i]
          if (isFinite(idx)) {
            // new from Observer
            const rect = grade.rects[idx]
            if (rect) mpos.set.key(grade, rect)
          } else if (idx === 'delay' || idx === 'move' || idx === 'trim') {
            reflow = true

            if (idx === 'delay') {
              const timers = mpos.ux.timers
              rFrame = timers[idx][timers[idx].length - 1]
              // quality limits pixelRatio of html-to-image
              const now = time.sFence.oldTime
              const elapsed = now - time.sPhaseLast
              time.sPhaseLast = now

              //quality = Math.max(opt[idx] / elapsed, sPhaseSync).toFixed(2)
              sPhaseSync = Math.abs(0.5 - opt[idx] / elapsed)
            }
          }
        }

        //
        // Nominal Time Partition: real deviation
        quality = Math.max(Math.min(sFenceSync + sPhaseSync, 1), 0.5)
        //console.log('?:', [+sFenceSync.toFixed(3), +sPhaseSync.toFixed(3), +quality.toFixed(3)].join('      __      '))

        if (reflow && time.slice(1, true)) {
          const capture = {
            // deepest pseudo match
            hover: [...grade.el.querySelectorAll(':hover')].pop(),
            active: [...grade.el.querySelectorAll(':active')].pop(),
            focus: [...grade.el.querySelectorAll(':focus')].pop()
          }

          const reQueue = rFrame > 0
          this.rate(grade, rFrame, capture, reQueue)
        }
      } else {
        // HARD-update: viewport
        const root = document.body
        const idx = root.getAttribute('data-idx') || 9999
        const rect = new mpos.mod.rect(root, {})
        rect.idx = idx
        rect.major = 'other'
        rect.minor = 'wire'
        rect.z = -idx
        rect.fix = true
        rect.add = 1
        rect.ux.i = 1
        mpos.set.key(grade, rect)
        grade.rects[idx] = rect

        major.other.add(idx)
      }

      //console.log('queue', major.queue.length)

      //
      // Pass state to recursive loops
      let step = { rType: rType, rFrame: rFrame, syncFPS: syncFPS, quality: quality }
      if (time.slice(1, false)) {
        // Feedback Sample: state boundary value analysis
        // ramp (not gate) early exit
        this.transforms(grade, step)
        // todo: is [...accumulate average] beneficial?
      } else {
        //let extraframes = time.slice(2)

        this.atlas(grade, step)
      }
    },
    atlas: function (grade, step = {}) {
      const { tool, fov, reset } = mpos.var
      const { atlas, major } = grade
      const { rType, rFrame, syncFPS, quality } = step

      //
      // Atlas constants
      const cMap = atlas.cMap
      const cMap2 = atlas.cMap2

      let ctxC = atlas.ctx
      if (!ctxC) {
        //
        // Offscreen Canvas
        //devnook.github.io/OffscreenCanvasDemo/use-with-lib.html
        //developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas

        // etc: offscreen, transfercontrols, multiple readback
        let options = { willReadFrequently: true, alpha: true }
        ctxC = atlas.ctx = atlas.canvas.getContext('2d', options)
        ctxC.imageSmoothingEnabled = false

        //
        // atlas key structure
        // context reset when loop interrupted
        //ctxC.reset()
        ctxC.fillStyle = atlas.keyTest.alpha
        ctxC.fillRect(atlas.keyTest.x, atlas.size - atlas.keyTest.y - cMap, cMap, cMap)
      }

      if (step.queue === undefined) {
        // update queue, SOFT or HARD
        step.queue = rType ? major.queue : [...major.atlas]
        step.idx = step.queue.length
        // paint breakpoints [0,50%], unless frame
        // ...via transforms, which also calls loaders!
        step.paint = step.idx >= 24 && rFrame === 0 ? [0, Math.floor(step.idx * 0.5)] : []
      }

      function queue() {
        if (rType) {
          // reduce queue
          step.queue = step.queue.splice(step.queue.length - step.idx, step.queue.length)
        }

        if (step.idx > 0) {
          // Recurse

          if (step.paint.indexOf(step.idx) > -1) {
            // breakpoint
            console.log('...paint')
            mpos.step.transforms(grade, step, true)
          }

          step.idx--
          mpos.step.atlas(grade, step)
        } else {
          // Resolve
          mpos.step.transforms(grade, step)
        }
      }

      function shallow(ux) {
        return ux.i !== 1 && ux.u === 'css'
      }
      // queue indexes from end, but in reverse
      const rect = grade.rects[step.queue[step.queue.length - step.idx]]

      if (rect && rect.hasOwnProperty('idxMip') && !shallow(rect.ux)) {
        // Unset or override element box style

        const wSize = rect.hasOwnProperty('idxMip2') ? cMap2 : cMap
        // note: rect.idxMip2 may not be honored if atlas.idxMip2 is full
        const pixelRatio = rect.ux.o || rect.ux.u ? quality : 0.8

        //const includeStyleProperties = ['background', 'color', 'margin', 'padding', 'border', 'font']
        const options = {
          style: { ...reset },
          canvasWidth: wSize,
          canvasHeight: wSize,
          pixelRatio: pixelRatio * fov.dpr,
          preferredFontFormat: 'woff2',
          fontEmbedCSS: atlas.fontEmbedCSS,
          filter: grade.filter
        }

        if (!rect.hasOwnProperty('css')) {
          //slow frame?
        }

        // Feature tests
        if (rect.css && rect.css.style) {
          const float = tool.diffs('flow', { rect: rect })
          if (float) {
            options.style.top = options.style.right = options.style.bottom = options.style.left = 'initial'
          }
        }

        const noBox = tool.diffs('rect', { rect: rect })
        if (noBox) {
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

        toSvg(rect.el, options)
          .then(function (clone) {
            //
            let img = new Image()
            let load = img.addEventListener('load', (e) => {
              removeEventListener('load', load)

              // if (clone.width === 0 || clone.height === 0) {
              // no box
              // } else {
              // canvas xy, from top (FIFO)

              if (rect.x === undefined || rect.y === undefined) {
                // texture scale
                rect.w = rect.hasOwnProperty('idxMip2') && atlas.idxMip2-- ? 2 : 1

                // edge was padded and reserved
                let x, y

                if (rect.w === 1) {
                  // cell mip 1x (left)
                  const mSpan = atlas.cellMip - atlas.cellMip2
                  x = (rect.idxMip % mSpan) * cMap
                  y = Math.floor(rect.idxMip / mSpan) * cMap
                } else {
                  // cell mip 2x (right)
                  let mSpan = atlas.cellMip / 2
                  x = atlas.size - cMap2 * ((Math.floor(rect.idxMip2 / mSpan) % mSpan) + 1)
                  y = cMap2 * (rect.idxMip2 % mSpan)
                }
                // canvas rounding trick, bitwise or
                x = (0.5 + x) | 0
                y = (0.5 + y) | 0

                rect.x = x
                rect.y = y

                // shader xy, from bottom
                // avoid 0 edge, so add 0.0001
                const wSize = rect.w > 1 ? cMap2 : cMap
                rect.wX = (0.0001 + x) / atlas.size
                rect.wY = (0.0001 + y + wSize) / atlas.size
              }

              const wSize = rect.w > 1 ? cMap2 : cMap
              ctxC.clearRect(rect.x, rect.y, wSize, wSize)
              ctxC.drawImage(e.target, rect.x, rect.y, wSize, wSize)
              //}

              img.remove()
              img = null
            })
            img.src = clone
            //console.log(canvas, domtoimage.impl, domtoimage.toSvg)

            // recurse

            clone = null

            queue()
          })
          .catch(function (error) {
            // image source bad or unsupported type
            console.log(error)
            queue()
          })
      } else {
        queue()
      }
    },
    transforms: function (grade, step, paint) {
      const { atlas, major } = grade
      const { rType, rFrame, syncFPS } = step
      const instanced = atlas.instanced
      //
      // Update Meshes from queue

      //
      // Ray whitelist atlas/other
      // - more similar to inPolar than layout reflow
      // atlas :: instanceId (from ROIs) => intersect (ray) => rect (by dataIdx) => synthetic dispatch (element)
      // other :: ?=> intersect (ray) ?=> Mesh.userData.el ?=> rect (by dataIdx) => ...ditto
      // Example: synthetic dispatch
      // 0: { rect: {}, uv: {} } ...instanceId/dataIdx, element, uv, mat, position, bound
      const targets = []
      let count = 0
      let newGeo, newMap
      //const myPromise = new Promise((resolve, reject) => {
      //

      if (!paint) {
        //
        // Meshes other (matches Loader) update on tail
        //grade.scroll = { x: window.scrollX, y: window.scrollY }
        major.other.forEach(function (idx) {
          const rect = grade.rects[idx]

          let scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
          const dummy = mpos.set.box(rect, { scroll: scroll, frame: rFrame })
          //if (dummy || rect.obj)

          if (rect.obj) {
            if (dummy) mpos.set.use(rect.obj, true)
            // update visibility if loaded
            // off-screen boxes may "seem" more visible than instancedMesh because they don't have a third state
            let vis = rect.fix ? true : rect.inPolar >= grade.inPolar
            rect.obj.visible = vis
            //if (rect.add === 3) {
            //  rect.add = 4
            //  // todo: once loaded (like expose children) would not apply to other CSS3D
            //
            //}

            // Ray whitelist data-idx
            targets.push('r_idx_' + rect.idx)
          }

          if (rect.obj && rect.obj.animate && rect.obj.animate.gif) {
            // refresh SuperGif
            rect.obj.material[4].map.needsUpdate = true
          }
        })
      }

      //
      // Meshes atlas (general Instance) update priority and raycast

      const color = new THREE.Color()

      major.atlas.forEach(function (idx) {
        const rect = grade.rects[idx]
        //let uxForce = rect.ux.i || rect.ux.o || rect.ux.u
        let inPolar = rect.inPolar >= grade.inPolar

        const dummy = mpos.set.box(rect, { frame: rFrame })
        if (dummy) instanced.setMatrixAt(count, dummy.matrix)

        //
        // Update feature difference (support background)
        // ...ad-hoc experiments like tooltip, catmull heatmap
        if (rType === undefined || rect.ux.o) {
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
        if (rType === undefined || dummy) {
          if (rect.hasOwnProperty('idxMip') || rect.minor === 'self') {
            // top-tier bracket
            if (inPolar) {
              x = rect.wX || atlas.keyTest.x
              y = 1 - rect.wY || atlas.keyTest.y
              z = rect.w
            } else if (grade.inPolar === 4) {
              // partial update from split frame (trim), due to scroll delay
              x = atlas.keyTest.x
              y = atlas.keyTest.y
            }
          }

          // bug frame: force inPolar/css, update instance.count, update render/texture, 3rd condition
          atlas.uvOffset.setXY(count, x || vis, y || vis)
          atlas.uvOffset.setZ(count, z || 1)
        }

        // Ray whitelist instanceId
        if (rect.hasOwnProperty('idxMip') && inPolar /*&& rect.minor !== 'self'*/) {
          // note: event/raycast is strongly bound (like capture/bubble)
          // propagation quirks are thrown further by curating hierarchy (mat.self)
          targets.push(Number(count))
          //targets: { instanceId:0, dataIdx: 0, rect: rect ... uv }
        }

        count++
      })

      // Apply Updates
      instanced.count = count

      //instanced.computeBoundingSphere() // cull and raycast
      //instanced.instanceMatrix.needsUpdate = true
      if (newMap) instanced.instanceColor.needsUpdate = true
      atlas.uvOffset.needsUpdate = true // if buffer has new atlas positions (for example, hover works despite)
      // Atlas Postprocessing...?
      //ctxC.drawImage(OffscreenCanvas, 0, 0)
      mpos.set.use(instanced, true)
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

      function enqueue(rType) {
        if (queue.indexOf(rType) === -1) {
          // add unique
          queue.push(rType)
        }

        if (rType === 'delay') {
          // immediate schedule, unless manually called -1
          if (e.value > 0) {
            // schedule next frame (but 0 doesnt, and -1 clears without update)
            mpos.ux.reflow({ type: e.type, value: e.value })
          }
          if (!grade.wait) {
            // update current queue
            mpos.step.sync(grade, rType)
          }
        } else {
          // debounce concurrent
          requestIdleCallback(
            function () {
              if (queue.length) {
                mpos.step.sync(grade, rType)
              }
            },
            { time: 125 }
          )
        }
      }

      if (e.isIntersecting) {
        // enqueue visible element
        const rType = e.target.getAttribute('data-idx')
        enqueue(rType)
      } else {
        // event schedule or throttle
        const [timer, timeout] = e.type === 'delay' ? ['delay', e.value] : ['reflow', 62.5]

        mpos.ux.timers.clear(timer)
        if (e.value === -1) {
          // user can clear a timer...?
          return
        }

        mpos.ux.timers[timer].push(
          setTimeout(function () {
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
              let rType = e.type
              if (e.type === 'scroll') {
                // update visibility?
                rType = opt.inPolar === 4 ? 'trim' : 'move'
              }
              enqueue(rType)
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

        if (slice.boundary % 1000 == 0) slice.quota.count /= 2
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

      if (time.slice(1, true)) {
        //
        // FPS slice minimum (60fps?)
        if (grade && time.slice(2, true)) {
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
                obj.material.map.needsUpdate = true
              }
            }
          })

          // Controls events can stack up render calls outside of frameloop timer
          tool.dpr()
        }

        // instanced elements need texture update
        mat_shader.userData.t.needsUpdate = true
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
        intersects = intersects.filter(function (hit) {
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
          const rect = useId ? Object.values(grade.rects)[hit.instanceId] : grade.rects[hit.object.userData.idx]
          synthetic = { rect: rect, uv: hit.uv }

          //
          // minimap debug
          caret.title = rect.idx + rect.el.nodeName
          const caretROI = caret.style
          // visibility
          const color = rect.inPolar >= 4 ? 'rgba(0,255,0,0.66)' : 'rgba(255,0,0,0.66)'
          caretROI.backgroundColor = color
          // location
          const cell = 100 * (1 / grade.atlas.cellMip) * rect.w
          caretROI.width = caretROI.height = cell + '%'
          caretROI.left = 100 * rect.wX + '%'
          caretROI.bottom = 100 * (1 - rect.wY) + '%'
          caretROI.right = 'inherit'
          if (!rect.hasOwnProperty('idxMip')) {
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
      const emits = document.elementsFromPoint(x, y).filter(function (el) {
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
