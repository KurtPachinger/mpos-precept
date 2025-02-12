import './mpos.css'
import { toCanvas } from 'html-to-image'
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
        opts.selector = opts.selector || vars.opt.selector
        opts.depth = opts.depth || vars.opt.depth
        break
      default:
        opts.var = vars
    }

    const promise = new Promise((resolve, reject) => {
      //
      let fnvar = this.var.tool[tool]
      let response = fnvar ? this.var.tool[tool](value, opts) : 'no fnVar'
      resolve(response)
      reject('err' + tool)
    })

    //console.log('fnVar:', promise)
    return promise
  },
  var: {
    batch: 0,
    cache: {},
    time: {
      sFence: new THREE.Clock(), // update (interval) and share (with nominal) via oldTime
      sFenceDelta: 0,
      sFenceFPS: 1 / 60, // 60 fps
      sFenceFPS_slice: { boundary: 0, gate: Infinity, ramp: 0, quota: { count: 0, average: 0 } },
      slice(boundary, gate) {
        // bitmask power: %1==60fps || %2==30fps || %4==15fps
        const slice = this.sFenceFPS_slice

        boundary = slice.boundary % boundary === 0
        // gate of boundary 1:  not a ramp
        if (gate !== undefined) {
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
      inPolar: 4,
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

        mpos.add(selector, options).then((res) => {
          mpos.update(res)
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
      find: function (idx, opts = {}) {
        // find rects by key
        let rect
        const grade = opts.var.grade
        const rects = Object.values(grade.rects)

        if (idx === 'first' || idx === 'last') {
          let position = idx === 'first' ? 0 : rects.length - 1
          rect = rects[position]
        } else if (idx === 'atlas' || idx === 'other') {
          rect = grade.r_[idx].rects
        } else {
          rect = rects[idx]
        }

        console.log('find', idx, rect)
        return rect
      },
      march: function (selector, opts = {}) {
        // chain to depth under cutoff
        const find = document.querySelector(opts.selector || mpos.var.opt.selector)
        let nest = document.querySelector(selector)
        let depth = 0
        while (nest) {
          if (nest.isSameNode(find) || !nest.parentElement || ++depth > 32) {
            break
          }
          nest = nest.closest(mpos.precept.allow)
        }

        // (-2): extend (child) to depth -1, and head (poster) -1
        depth += (opts.depth || mpos.var.opt.depth) - depth - 2

        return depth
      },
      diffs: function (type, opts = {}) {
        let differ = false
        let style = opts.style || {}

        //
        // Different from Baseline Generic Primitive

        if (type === 'rect') {
          differ = !opts.node.clientWidth || !opts.node.clientHeight
          // note: opts.whitelist quirks ( || el.matches('a, img, object, span, xml, :is(:empty)' )
        } else if (type === 'matrix') {
          // note: style may be version from css frame accumulating
          differ = style.transform?.startsWith('matrix')
        } else if (type === 'tween') {
          // note: loose definition
          differ =
            style.transform !== 'none' ||
            style.transitionDuration !== '0s' ||
            (style.animationName !== 'none' && style.animationPlayState === 'running')
        } else if (type === 'flow') {
          // note: if position overflows scrollOffset, canvas may not draw
          differ = style.zIndex >= 9 && (style.position === 'fixed' || style.position === 'absolute')
          //&& !!(parseFloat(style.top) || parseFloat(style.right) || parseFloat(style.bottom) || parseFloat(style.left))
        } else if (type === 'pseudo') {
          // note: get pseudo capture once per frame for all rects
          let rect = opts.rect
          let css = rect.css
          if (css) {
            let capture = opts.capture
            capture = capture || {
              // deepest pseudo match
              hover: [...opts.sel.querySelectorAll(':hover')].pop(),
              active: [...opts.sel.querySelectorAll(':active')].pop(),
              focus: [...opts.sel.querySelectorAll(':focus')].pop()
            }

            // note: pseudo (or unset prior frame) enqueued for atlas
            differ = css.pseudo
            css.pseudo = rect.el === capture.active || rect.el === capture.focus || (rect.el === capture.hover && rect.mat === 'poster')
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
      old: function (selector) {
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
                        cache = mat.userData.cache
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
                    cache = material.userData.cache
                    // front
                    if (!cache) {
                      material.map && material.map.dispose()
                      material.dispose()
                    }
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

          if (grade) {
            //
            // Canvas
            const ctxC = grade.atlas.ctx
            ctxC.clearRect(0, 0, ctxC.width, ctxC.height)
            // note: more grades would destroy canvases
            //grade.atlas.canvas = grade.ctx = null

            // CSS3D

            const css3d = mpos.var.rendererCSS.domElement
            //const clones = css3d.querySelectorAll(':not(.mp-block)')

            css3d.querySelectorAll('[data-batch]').forEach((el) => {
              el.parentElement.removeChild(el)
              el = null
            })
          }

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
  precept: {
    //
    // Types for NodeIterator
    manual: `.mp-loader,.mp-poster,.mp-native`.split(','),
    allow: `.mp-allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
    block: `.mp-block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template,iframe:not([src])`.split(
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
      opts.container = proxy ? domElement.parentElement : document.body

      fov.width = opts.container.offsetWidth
      fov.height = opts.container.offsetHeight
      const frustum = fov.basis * opt.depth
      vars.camera = opts.camera || new THREE.PerspectiveCamera(45, fov.width / fov.height, fov.z / 2, frustum * 4)

      //
      // Inject Stage
      const template = document.createElement('template')
      template.innerHTML = `
    <section id='mp'>
      <div class='tool mp-offscreen' id='custom'>
        <object alt='OSC'></object>
        <template></template>
      </div>
      <aside class='tool' id='atlas'>
        <canvas></canvas>
        <hr id='caret' />
      </aside>
      <div id='css3d'></div>
    </section>`

      opts.container.appendChild(template.content)
      mpos.var.atlas = document.querySelector('#atlas canvas')
      vars.caret = document.getElementById('caret')
      const mp = proxy ? container : document.getElementById('mp')
      mp.classList.add('mp-block')

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
        threshold: [0.125, 0.875]
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
  add: async function (selector, opts = {}) {
    const vars = mpos.var
    const { opt, tool, fov, geo, mat, mat_shader, mat_line, scene } = vars // grade needs attention pre/post
    const precept = mpos.precept

    //
    // Document Element NodeIterator for Typed Geometry

    // Options
    selector = selector || opt.selector
    const depth = opts.depth || opt.depth
    const parse = opts.parse || precept.parse

    // Progress
    let sel = document.querySelector(selector)
    const grade_r = vars.grade
    if (sel === null || (grade_r && grade_r.wait === Infinity && sel.isSameNode(grade_r.el))) {
      // bad selector or busy
      return
    } else if (opts.custom) {
      // load resource from external uri (into object)

      await tool
        .src(sel, opts.custom, 'data')
        .then(function (res) {
          console.log('res', res)
          // use document contentDocument.body instead of CSS3D
          if (sel.contentDocument) {
            sel = sel.contentDocument.body
          }
        })
        .catch((err) => {
          console.error('err: ', err) // CORS
          return
        })
    }

    // Old Group
    await tool.old(selector)
    // New Group
    const group = new THREE.Group()
    group.name = selector

    //
    // Build DOM Tree Structure
    vars.grade = { wait: Infinity }
    const grade = {
      // Template Isolate
      el: sel,
      group: group,
      batch: vars.batch++, // unique group identifier
      atlas: {
        canvas: vars.atlas, // || document.createElement('canvas'),
        idx: 0, // implies poster++ (from depth/type) and not other
        idxW: 0,
        size: 2_048
      },
      elsMin: 0, // implies view range (inPolar++) of Observers
      elsMax: 0, // instance
      inPolar: opt.inPolar,
      // sets and subsets
      txt: [],
      rects: {},
      r_: {
        // live values
        queue: [],
        atlas: { count: 0, rects: {} },
        other: { count: 0, rects: {} }
      }

      //ray: {}
      //scroll: { x: window.scrollX, y: -window.scrollY }
    }

    const atlas = grade.atlas
    const atlasWide = { count: 0, average: 0 }

    //
    // Flat-Grade: filter, grade, sanitize
    const ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
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
        const rect = { el: node, inPolar: null }

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
            const idx = grade.elsMax
            rect.el.setAttribute('data-idx', idx)
            grade.rects[idx] = rect
            grade.elsMax++

            // Atlas subBin test 1
            const area = rect.el.offsetWidth * rect.el.offsetHeight
            tool.avg(area, atlasWide)
          }
        }
      }

      node = ni.nextNode()
    }

    function setRect(rect, z, mat, unset) {
      //
      // Qualify Geometry Usage
      if (rect) {
        rect.mat = mat
        rect.z = z
        // elevate priority for ux update
        const uxin = rect.mat === 'native' && rect.el.tagName !== 'A' ? 1 : 0
        rect.ux = { i: uxin, o: 0, u: false }

        // note: counter logic duplicated in update queue (r_, priority)
        if (rect.inPolar >= grade.inPolar) {
          grade.elsMin++
          if (rect.mat === 'poster' || rect.mat === 'native') {
            // Instanced Atlas
            rect.atlas = atlas.idx++
          }
        } else {
          // OffScreen Element
          //mpos.ux.observer?.observe(rect.el)
        }

        // Class to unset quirks (inherit transform, details...)
        unset = unset || rect.el.matches(precept.unset)
        if (unset) {
          rect.unset = true
          rect.ux.i = 1
        }

        // note: atlas excludes rect.mat type "native" that matches CORS... to CSS3D
        // ... atlas "poster" became first-class, so the logic is !!BetterLate
        const other = rect.mat === 'loader' || rect.mat === 'wire' || rect.el.matches([precept.cors, precept.native3d])
        rect.r_ = other ? 'other' : 'atlas'

        // Atlas subBin test 1
        if (rect.mat === 'poster' || rect.mat === 'native' /* || rect.mat === 'child' */) {
          const area = rect.el.offsetWidth * rect.el.offsetHeight
          tool.avg(area, atlasWide)
        }
      }
      return unset
    }
    function setMat(node, mat, manual, layer) {
      //
      // Qualify Geometry Type
      if (manual) {
        // priority score
        mpos.precept.manual.every(function (classMat) {
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

    function struct(sel, deep, unset) {
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
            const abortAtlas = atlas.idx >= 128 // || grade.atlas > grade.elsMin
            //const abort = abortEls || abortAtlas
            if (block || abortEls) {
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
                  struct(node, D, unset)
                } else {
                  let mat = 'child'
                  //
                  // Set Element-Geometry "Final Grade"
                  mat = abortAtlas ? mat : setMat(node, mat, manual, child)
                  setRect(rect, z, mat, unset)
                }
              }
            }
          }
        }
      }
    }

    struct(sel, depth)

    //
    // Atlas Ration: relative device
    atlas.sub = 14
    atlas.subBin = 4
    atlas.canvas.width = atlas.canvas.height = atlas.size
    atlas.canvas.title = [atlas.sub, atlas.size].join('_')

    let subBinMax = (atlas.sub / 2) * (atlas.subBin / 2)
    Object.keys(grade.rects).forEach((idx) => {
      //
      // Complete Preparation
      const rect = grade.rects[idx]

      if (rect.mat) {
        rect.idx = Number(idx)
        if (rect.inPolar >= grade.inPolar) {
          // Begin Subsets: atlas || other
          const r_type = grade.r_[rect.r_]
          r_type.rects[idx] = rect
          r_type.count++
        } else {
          // note: observe off-screen (!inPolar) elements...?
        }

        const area = rect.el.offsetWidth * rect.el.offsetHeight
        if (subBinMax-- && (rect.mat === 'poster' || rect.mat === 'native') && area > atlasWide.average) {
          //console.log('atlasW', rect)
          rect.idxW = atlas.idxW++
        }

        // note: observe greedily on pageLoad...?
        mpos.ux.observer?.observe(rect.el)
      } else {
        // free memory
        rect.el = rect.bound = null
        delete grade.rects[idx]
        const node = document.querySelector('[data-idx="' + idx + '"]')
        node && node.removeAttribute('data-idx')
      }
    })

    //
    // Instanced Mesh and
    const shader = mpos.set.shader(atlas.canvas, atlas.sub, mat_shader)
    const instanced = new THREE.InstancedMesh(geo, [mat, mat, mat, mat, shader, mat_line], grade.elsMax)
    instanced.layers.set(2)
    mpos.set.use(instanced)
    // Shader Atlas
    instanced.userData.shader = shader
    instanced.userData.el = grade.el
    instanced.name = [grade.batch, grade.el.tagName].join('_')
    grade.instanced = instanced
    grade.mapKey = { x: 0, y: 0.0001 } // empty structure (cyan)

    // Atlas UV Buffer
    const uvOffset = new THREE.InstancedBufferAttribute(new Float32Array(grade.elsMax * 3).fill(-1), 3)
    uvOffset.setUsage(THREE.DynamicDrawUsage)
    instanced.geometry.setAttribute('uvOffset', uvOffset)

    //
    // OUTPUT
    group.add(instanced)
    scene && scene.add(group)

    vars.grade = grade
    mpos.update(grade)
    return grade
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
            if (bound.width > 0 && bound.height > 0 && node.checkVisibility()) {
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
    box: function (rect, opts = {}) {
      if (rect.frame && rect.ux.u === false) {
        return false
      }

      const { geo, mat_line, fov, opt, grade } = mpos.var

      // css: accumulate transforms
      mpos.set.css(rect, opts.frame)

      // css: unset for box scale
      let unset = mpos.set.css(rect, true)
      let bound = rect.unset ? unset : rect.bound

      //
      // TYPE OF MESH FROM ELEMENT
      let object
      if (rect.obj) {
        object = rect.obj
      } else if (rect.r_ === 'other') {
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

          if (rect.mat === 'native') {
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
            wrap.style.zIndex = rect.css.style.zIndex

            // hack at some problems:
            // relative width and height
            // duplicate ids or data-idx
            wrap.style.width = stub.clientWidth + 'px'
            wrap.style.height = bound.height + 'px'

            const css3d = new CSS3DObject(wrap)
            // note: most userData.el reference an original, not a clone
            css3d.userData.el = el
            object = css3d
            //group.add(object)
            grade.group.add(css3d)
            rect.obj = css3d
          } else if (rect.mat === 'wire') {
            // Mesh unclassified (currently only root node)
            const mesh = new THREE.Mesh(geo, mat_line)
            mpos.set.use(mesh)
            mesh.userData.el = rect.el
            mesh.animate = true
            object = mesh
            group.add(object)
            grade.group.add(group)
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
        const extrude = rect.mat !== 'self' && rect.mat !== 'wire' ? fov.z / 2 + fov.z / 4 : 0
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

          // dummy from element fits group
          // ###
          // fit the OpenCV but not video
          mpos.set.fit(dummy, obj)
          // ###
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

      // Matrix Frame Update
      transform(object)

      let res = object
      if (opts.add) {
        rect.add = false

        // Load Additional Resource
        if (rect.mat === 'loader') {
          // Async: dummy fits group with source
          res = rect.obj
          mpos.set.loader(rect, object)
        } else {
          // Generic: (wire, native CSS3D)
          //grade.group.add(object)
          //object.name = rect.idx
        }
      }

      rect.ux.u = false
      return res
    },
    css: function (rect, progress) {
      const { grade, tool } = mpos.var

      //
      // CSS Style Transforms: accumulate a natural box model

      let el = rect.el
      const frame = typeof progress === 'number'
      // css style: transform, transformOrigin, backgroundColor, zIndex, position
      const css = rect.css || { style: window.getComputedStyle(el) }

      let uxout = {}
      if (progress === undefined || frame) {
        // ux frame change pre/post calculable? (imperative)
        rect.ux.u = false
        uxout = { bound: rect.bound, scale: css.scale, degree: css.degree }

        if (!rect.hasOwnProperty('css') || rect.frame < progress) {
          // ux priority may escalate (declarative)
          const priority = css.pseudo || tool.diffs('tween', { style: css.style })
          rect.ux.o = priority ? rect.ux.i + 1 : rect.ux.i

          // reset transforms
          css.scale = 1
          css.radian = 0
          css.degree = 0
          css.transform = 0
        }
      } else {
        // rect.unset
      }

      let unset
      const rects = grade.rects
      function accumulate(progress) {
        let el = rect.el
        //let els = []
        let max = 8 // deep tree?

        while (el && max--) {
          if (el.isSameNode(document.body) || el.isSameNode(document.documentElement) || !el.parentElement) {
            break
          }

          const r_ = rects[el.getAttribute('data-idx')]

          if (r_?.ux.o) {
            if (progress === undefined || frame) {
              if (!rect.hasOwnProperty('css') || rect.frame < progress) {
                // accumulate ancestor matrix
                const style = r_.css?.style || css.style //|| window.getComputedStyle(el)

                if (style && tool.diffs('matrix', { style: style })) {
                  const transform = style.transform.replace(/(matrix)|[( )]/g, '')
                  // transform matrix
                  const [a, b] = transform.split(',')
                  const scale = Math.sqrt(a * a + b * b)
                  const degree = Math.round(Math.atan2(b, a) * (180 / Math.PI))
                  const radian = degree * (Math.PI / 180)
                  // accrue transforms
                  css.scale *= scale
                  css.radian += radian
                  css.degree += degree
                  css.transform++
                }
              }
            } else {
              // unset ancestor style transforms
              //if (tweens(rect.css) || el.classList.contains('mp-unset')) {
              el.classList.toggle('mp-unset', progress)
              //}
            }
          }
          //els.unshift(el)
          el = el.parentElement
          //el = el.closest('.mp-unset')
        }

        if (progress === true) {
          unset = rect.el.getBoundingClientRect()
          accumulate(!progress)
        } else {
          if (progress === undefined || frame) {
            // update rect properties from frame
            rect.css = css
            rect.bound = rect.el.getBoundingClientRect()

            rect.bound.symmetry = [rect.el.offsetWidth, rect.el.offsetHeight].join('_')
            if (frame) {
              if (rect.frame < progress) {
                // compare frame result to detect change
                let newBox = JSON.stringify(uxout.bound) !== JSON.stringify(rect.bound)
                let newCss = uxout.scale !== rect.css.scale || uxout.degree !== rect.css.degree
                if (newBox || newCss || rect.ux.o) {
                  // feature testing
                  let update = 'all'
                  if (newBox) {
                    // deeper comparison stub
                    newBox = uxout.bound.symmetry !== rect.bound.symmetry
                  }
                  if (!newBox || !newCss) {
                    update = newBox ? 'box' : 'css'
                  }
                  // to reduce queue of atlas/transforms
                  rect.ux.u = update
                }
              }
              rect.frame = progress
            }
          }
        }
      }
      accumulate(progress)

      return unset || rect.ux.u
    },
    use: function (object, update) {
      // update usage manually
      if (!update) {
        object.matrixAutoUpdate = false
        //object.matrixWorldAutoUpdate = false // makes stale meshes from slow loader on init
        if (object.isInstancedMesh) {
          object.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        }
      } else {
        object.matrixWorldNeedsUpdate = true
        //object.children.forEach((child) => {
        //child.matrixWorldNeedsUpdate = true
        //})
        // note: instanceColor and uvOffset is udpated elsewhere
        //object.updateMatrix()
        //object.updateMatrixWorld()
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
      if (group.children.length) {
        let s2 = group.userData.s2
        if (!s2) {
          //const grade = mpos.var.grade
          //grade.group.add(group)

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
        // note: currently, group implies SVG/OpenCV which lack depth
        group.translateZ(mpos.var.fov.z / 2)

        mpos.set.use(group, true)
        mpos.ux.render()
      }
    },

    cache: function (asset, uri, data) {
      // Stash resource at uri, with flag for disposal
      if (data) asset.data = data
      console.log('set cache', asset)
      mpos.var.cache[uri] = asset
      // dispose...?
      Object.values(asset.flag).forEach((obj) => {
        if (obj.isObject3D && obj.userData) obj.userData.cache = true
      })
    },
    loader: function (rect, dummy) {
      //const vars = mpos.var
      const { cache, grade, reset, geo, mat, mat_shape, mat_line, tool } = mpos.var

      //
      // deduplicate check: hard to prevent before async box, or after callback parse
      //const loaded = grade.group.getObjectByName(rect.idx)
      //if (loaded) {
      //console.log('loader loaded:',rect)
      //  return rect.obj
      //}

      const source = rect.el
      // source is location or contains one
      let uri = typeof source === 'string' ? source : source.data || source.src || source.currentSrc || source.href
      // source is image
      let mime = uri && uri.match(/\.(json|svg|gif|jpg|jpeg|png|webp|webm|mp4|ogv)(\?|$)/gi)
      mime = mime ? mime[0].toUpperCase() : 'File'
      let loader = !!((mime === 'File' && uri) || mime.match(/(JSON|SVG|GIF)/g))
      //console.log(loader, mime, uri)

      //
      // Cache: models (or whatever...?)
      let asset = cache[uri] || { mime: mime, data: false, flag: {} }

      //console.log(mime, uri, source, dummy, dummy.matrix)
      let group = rect.obj
      group.layers.set(2)

      if (mime.match(/(WEBM|MP4|OGV)/g)) {
        // HANDLER: such as VideoTexture, AudioLoader...
        const material = mat_shape.clone()
        const texture = new THREE.VideoTexture(source)
        material.map = texture
        const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])
        // unique overrides
        mesh.name = rect.idx
        mesh.matrix.copy(dummy.matrix)
        grade.group.add(mesh)
        rect.obj = mesh
        //mpos.set.use(mesh)
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
            .then(function (canvas) {
              mpos.set.opencv(canvas, group, dummy)
              canvas = null
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
            console.log('load', mime, data)

            if (mime === 'File') {
              // file is not image (XML?)
            } else if (mime.match('.JSON')) {
              // Object.data Extension: Object/Scene Format
              // todo: assign scene values from data-idx

              // ###
              mpos.set.use(data)
              group.add(data)
              mpos.set.fit(group, dummy, { add: true })
              // ###

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

                  // ###
                  mpos.set.use(mesh)
                  group.add(mesh)
                  // ###
                }
              }

              // ###
              mpos.set.fit(dummy, group)
              // ###

              if (!asset.data) mpos.set.cache(asset, uri, data)
            } else if (mime.match('.GIF')) {
              // File Extension: Graphics Interchange Format
              const canvas = loader.get_canvas()
              // SuperGif aka LibGif aka JsGif
              // todo: manual frame index from delta (investigate negative order bug?)
              const material = mat_shape.clone()
              material.map = new THREE.CanvasTexture(canvas)
              const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])
              // unique overrides
              mesh.name = rect.idx
              grade.group.add(mesh)
              rect.obj = mesh

              //NOTE: finding a route for special type
              // after loaded, boost priority, re-enqueue, force update
              rect.ux.i = 1
              mesh.animate = { gif: loader }
              grade.r_.queue.push(rect.idx)
              mpos.update(grade, 'trim')
              mesh.animate.gif.play()

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

            //
          }
        }
      }

      //rect.obj.matrix.copy(object.matrix)
      //rect.obj.matrixWorldNeedsUpdate = true
      grade.group.add(group)

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

                  // ###
                  //mesh.layers.set(2)
                  //mpos.set.use(mesh)
                  //mesh.matrix.copy(dummy.matrix)
                  group.add(mesh)
                  // ###
                }
              })
              kmeans = null

              //group.name = rect.idx

              // ###
              mpos.set.fit(dummy, group)
              // ###
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
  update: function (grade, rType) {
    const { opt, reset, time, fov, tool } = mpos.var
    const { atlas, instanced, r_ } = grade
    const { atlas: r_atlas, other: r_other, queue: r_queue } = r_
    //const vars = mpos.var

    if ((rType && !r_queue.length) || !!grade?.wait || !atlas.canvas || document.hidden) {
      // skip frame
      return
    }

    //
    // Emulate Page Flow: reduce and detect changes
    grade.wait = true
    grade.inPolar = opt.inPolar

    let r_frame = 0
    let quality = 1
    let capture = false

    //
    // Instanced Mesh
    const uvOffset = instanced.geometry.getAttribute('uvOffset')

    //
    // Frame Sync and Feedback: render may invoke targets to collocate
    let sPhaseSync = 0.5
    // Framerate Limit: pivot sFenceSync describes execution priority, since event queue is indeterminate
    let sFenceSync = 1 / ((time.sFenceDelta - time.sFenceFPS) / (time.sFenceFPS / 2))
    sFenceSync *= 2
    // Beacon to render
    const syncFPS = time.slice(1)

    if (rType) {
      // SOFT-update: Observer or frame
      let reflow = false
      for (let i = r_queue.length - 1; i >= 0; i--) {
        const idx = r_queue[i]
        if (isFinite(idx)) {
          // new Observer
          const rect = grade.rects[idx]
          const r_type = grade.r_[rect.r_]

          if (!r_type.rects[idx]) {
            if (rect.mat === 'poster' || (rect.mat === 'native' && rect.r_ === 'atlas')) {
              // Instanced
              rect.atlas = atlas.idx++
            } else if (rect.r_ === 'other') {
              // CSS3D or Loader
              rect.add = true
            }
            // add key
            r_type.rects[idx] = rect
            r_type.count++
            grade.elsMin++
          }
        } else if (idx === 'delay' || idx === 'move' || idx === 'trim') {
          reflow = true

          if (idx === 'delay') {
            const timers = mpos.ux.timers
            r_frame = timers[idx][timers[idx].length - 1]
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
        function vis(rects, reQueue) {
          // update element rect
          Object.keys(rects).forEach(function (idx) {
            const rect = rects[idx]
            //
            // Traverse: style transforms (set/unset), view settings, and qualify ux
            mpos.set.css(rect, r_frame)
            // update visibility
            mpos.set.inPolar(rect)

            if (reQueue) {
              if (rect.inPolar >= opt.inPolar) {
                if (rect.el.tagName === 'BODY') {
                  // no propagate
                  r_queue.push(idx)
                } else {
                  let pseudo = tool.diffs('pseudo', { rect: rect, sel: grade.el, capture: capture }) && (rect.ux.p || time.slice(2))
                  if (pseudo || rect.ux.u || rect.ux.o) {
                    // element ux changed or elevated
                    // note: pseudo evaluates first, so atlas unset has consistent off-state
                    if (r_queue.indexOf(idx) === -1) {
                      r_queue.push(idx)
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
                          if (rect && rect.mat === 'poster') {
                            rect.ux.u = 'all' // force child on frame, for atlas/transform...?
                            child.push(idx)
                          }
                        })
                        rect.child = child
                      }

                      if (time.slice(2)) r_queue.push(...rect.child)
                    }
                  }
                }
              }
            }
            if (opt.arc) {
              // mokeypatch a update
              // bug: trigger once like 'move', and update r_other
              rect.ux.u = !rect.ux.u || rect.ux.u === 'css' ? 'css' : 'all'
            }
          })
        }
        const reQueue = r_frame > 0
        vis(r_atlas.rects, reQueue)
        vis(r_other.rects)
      }
    } else {
      // HARD-update: viewport
      const root = document.body
      const idx = root.getAttribute('data-idx') || 9999
      const rect = { el: root, mat: 'wire', z: -idx, fix: true, ux: { i: 1, o: 0 }, idx: idx }

      r_other.rects[idx] = rect
    }

    //console.log('queue', r_queue.length, dataIdx, r_frame)

    //
    // common constants
    const wSub = atlas.size / atlas.sub
    const wSub2 = wSub * 2
    const size = atlas.size - wSub2
    // ... subBin from average area ( & size & sub )

    //
    // Offscreen Canvas
    //devnook.github.io/OffscreenCanvasDemo/use-with-lib.html
    //developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
    let ctx = atlas.ctx
    if (!ctx) {
      // etc: offscreen, transfercontrols, multiple readback
      let options = { willReadFrequently: true, alpha: true }
      atlas.ctx = atlas.canvas.getContext('2d', options)
      atlas.ctx.imageSmoothingEnabled = false

      //
      // atlas key structure
      atlas.ctx.clearRect(0, 0, atlas.size, atlas.size)
      atlas.ctx.fillStyle = 'rgba(0,255,255,0.125)'
      atlas.ctx.fillRect(0, atlas.size - wSub, wSub, wSub)
    }
    const ctxC = atlas.ctx

    function atlasQueue(grade, opts = {}) {
      if (opts.queue === undefined) {
        // update queue, SOFT or HARD
        opts.queue = rType ? r_queue : Object.keys(r_atlas.rects)

        opts.idx = opts.queue.length
        // paint breakpoints [0,50%], unless frame
        // ...via transforms, which also calls loaders!
        opts.paint = opts.idx >= 24 && r_frame === 0 ? [0, Math.floor(opts.idx * 0.5)] : []
      }

      function next() {
        if (rType) {
          // reduce queue
          opts.queue = opts.queue.splice(opts.queue.length - opts.idx, opts.queue.length)
        }

        if (opts.idx > 0) {
          // Recurse

          if (opts.paint.indexOf(opts.idx) > -1) {
            // breakpoint
            console.log('...paint')
            transforms(grade, true)
          }

          opts.idx--
          atlasQueue(grade, opts)
        } else {
          // Resolve

          transforms(grade)
        }
      }

      function shallow(ux) {
        return ux.i !== 1 && ux.u === 'css'
      }
      // queue indexes from end, but in reverse
      const rect = r_atlas.rects[opts.queue[opts.queue.length - opts.idx]]

      if (rect && rect.hasOwnProperty('atlas') && !shallow(rect.ux)) {
        // Unset or override element box style

        const wSize = rect.hasOwnProperty('idxW') ? wSub2 : wSub // note: rect.idxW may not be honored if atlas.idxW is full
        const pixelRatio = rect.ux.o || rect.ux.u ? quality : 0.8
        const options = {
          style: { ...reset },
          canvasWidth: wSize,
          canvasHeight: wSize,
          pixelRatio: pixelRatio * fov.dpr,
          preferredFontFormat: 'woff'
          //filter: function (node) {
          //  todo: test clone children for diffs
          //  return node
          //}
        }

        if (!rect.hasOwnProperty('css')) {
          //slow frame?
        }

        // Feature tests
        if (rect.css && rect.css.style) {
          const float = tool.diffs('flow', { style: rect.css.style })
          if (float) {
            options.style.top = options.style.right = options.style.bottom = options.style.left = 'initial'
          }
        }

        const noBox = tool.diffs('rect', { node: rect.el })
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

        toCanvas(rect.el, options)
          .then(function (canvas) {
            if (canvas.width === 0 || canvas.height === 0) {
              // no box
            } else {
              // canvas xy, from top (FIFO)

              if (rect.x === undefined || rect.y === undefined) {
                // texture scale
                rect.w = rect.hasOwnProperty('idxW') && atlas.idxW-- ? 2 : 1

                // edge was padded and reserved
                let x, y

                if (rect.w === 1) {
                  const sub = atlas.sub - atlas.subBin
                  x = (rect.atlas % sub) * wSub
                  y = Math.floor(rect.atlas / sub) * wSub
                } else {
                  // Wide sub on right-edge
                  //
                  let sub2 = atlas.sub / 2
                  x = atlas.size - wSub2 * ((Math.floor(rect.idxW / sub2) % sub2) + 1)

                  y = wSub2 * (rect.idxW % sub2)
                }
                // canvas rounding trick, bitwise or
                x = (0.5 + x) | 0
                y = (0.5 + y) | 0

                rect.x = x
                rect.y = y

                // shader xy, from bottom
                // avoid 0 edge, so add 0.0001
                const wSize = rect.w > 1 ? wSub2 : wSub
                rect.wX = (0.0001 + x) / atlas.size
                rect.wY = (0.0001 + y + wSize) / atlas.size
              }

              const wSize = rect.w > 1 ? wSub2 : wSub
              ctxC.clearRect(rect.x, rect.y, wSize, wSize)
              ctxC.drawImage(canvas, rect.x, rect.y, wSize, wSize)
            }
            // recurse
            canvas = null

            next()
          })
          .catch(function (error) {
            // image source bad or unsupported type
            //console.log(error)
            next()
          })
      } else {
        next()
      }
    }

    if (time.slice(1, false)) {
      // Feedback Sample: state boundry value analysis
      // ramp (not gate) early exit
      return transforms(grade)
      // todo: is [...accumulate average] beneficial?
    } else {
      let extraframes = time.slice(2)
      atlasQueue(grade)
    }

    function transforms(grade, paint) {
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
        Object.values(r_other.rects).forEach(function (rect) {
          let newGeo = !rect.hasOwnProperty('obj') && (rType === undefined || rect.add)
          let scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
          const dummy = mpos.set.box(rect, { add: newGeo, scroll: scroll, frame: r_frame })
          //if (dummy || rect.obj)

          if (rect.obj) {
            if (dummy) mpos.set.use(rect.obj, true)
            // update visibility if loaded
            // off-screen boxes may "seem" more visible than instancedMesh because they don't have a third state
            let vis = rect.fix ? true : rect.inPolar >= grade.inPolar
            rect.obj.visible = vis

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

      for (const [idx, rect] of Object.entries(r_atlas.rects)) {
        let uxForce = rect.ux.i || rect.ux.o || rect.ux.u
        let inPolar = uxForce ? mpos.set.inPolar(rect) >= grade.inPolar : rect.inPolar >= grade.inPolar

        const dummy = mpos.set.box(rect, { frame: r_frame })
        if (dummy) instanced.setMatrixAt(count, dummy.matrix)

        //
        // Update feature difference (support background)
        // ...ad-hoc experiments like tooltip, catmull heatmap
        if (rType === undefined || rect.ux.o) {
          newMap = true
          // Instance Color (first-run)
          let bg = rect.css.style.backgroundColor
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
        if (rType === undefined || dummy || uxForce) {
          if (rect.hasOwnProperty('atlas') || rect.mat === 'self') {
            // top-tier bracket
            if (inPolar) {
              x = rect.wX || grade.mapKey.x
              y = 1 - rect.wY || grade.mapKey.y
              z = rect.w
            } else if (grade.inPolar === 4) {
              // partial update from split frame (trim), due to scroll delay
              x = grade.mapKey.x
              y = grade.mapKey.y
            }
          }

          // bug frame: force inPolar/css, update instance.count, update render/texture, 3rd condition
          uvOffset.setXY(count, x || vis, y || vis)
          uvOffset.setZ(count, z || 1)
        }

        // Ray whitelist instanceId
        if (rect.hasOwnProperty('atlas') && inPolar /*&& rect.mat !== 'self'*/) {
          // note: event/raycast is strongly bound (like capture/bubble)
          // propagation quirks are thrown further by curating hierarchy (mat.self)
          targets.push(Number(count))
          //targets: { instanceId:0, dataIdx: 0, rect: rect ... uv }
        }

        count++
      }

      // Apply Updates
      instanced.count = count

      //instanced.computeBoundingSphere() // cull and raycast
      //instanced.instanceMatrix.needsUpdate = true
      if (newMap) instanced.instanceColor.needsUpdate = true
      grade.instanced.geometry.getAttribute('uvOffset').needsUpdate = true // if buffer has new atlas positions (for example, hover works despite)
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
      const queue = grade.r_.queue

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
            mpos.update(grade, rType)
          }
        } else {
          // debounce concurrent
          requestIdleCallback(
            function () {
              if (queue.length) {
                mpos.update(grade, rType)
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
    render: function (timeslice) {
      const { grade, mat_shader, scene, camera, renderer, rendererCSS, tool, time } = mpos.var

      const slice = time.sFenceFPS_slice
      if (document.hidden) {
        // todo: visibilitychange prevent 300fps
        return
      }

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

      if (timeslice) {
        // syncFPS complete from updated transforms
        time.sFenceFPS_slice.gate = Infinity
      }

      //
      // Timeslice Boundry: junction of mapcontrols and transform updates
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
          const rect = useId ? Object.values(grade.r_.atlas.rects)[hit.instanceId] : grade.r_.other.rects[hit.object.userData.idx]
          synthetic = { rect: rect, uv: hit.uv }

          //
          // minimap debug
          caret.title = rect.idx + rect.el.nodeName
          const caretROI = caret.style
          // visibility
          const color = rect.inPolar >= 4 ? 'rgba(0,255,0,0.66)' : 'rgba(255,0,0,0.66)'
          caretROI.backgroundColor = color
          // location
          const cell = 100 * (1 / grade.atlas.sub) * rect.w
          caretROI.width = caretROI.height = cell + '%'
          caretROI.left = 100 * rect.wX + '%'
          caretROI.bottom = 100 * (1 - rect.wY) + '%'
          caretROI.right = 'inherit'
          if (!rect.hasOwnProperty('atlas')) {
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

      if (rect.mat === 'native') {
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
      const position = rect.css?.style.position || 'auto'
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
