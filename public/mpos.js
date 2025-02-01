import './mpos.css'

import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'

import { toCanvas } from 'html-to-image'
// ...OpenCV, SuperGif

const mpos = {
  var: {
    batch: 0,
    cache: {},
    time: {
      clock: new THREE.Clock(),
      delta: 0,
      interval: 1 / 30 // 30 fps
    },
    fov: {
      w: window.innerWidth,
      h: window.innerHeight,
      z: 8,
      max: 1024
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
            selector = '#custom object'
            options.custom = this.custom
          } else {
            selector = this.custom
          }
        }

        mpos.add(selector, options)
      }
    },
    reset: {
      margin: 'initial',
      transform: 'initial'
      //display: 'block',
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
      attribute vec2 uvOffset;

      uniform float atlasSize;
      varying vec2 vUv;

      void main()
      {
        vUv = uvOffset + (uv / atlasSize);
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
    })
  },
  precept: {
    //
    // Types for NodeIterator
    manual: `.mp-loader,.mp-poster,.mp-native`.split(','),
    allow: `.mp-allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
    block: `.mp-block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template,iframe:not([src])`.split(
      ','
    ),
    poster: `.mp-poster,canvas,picture,img,h1,h2,h3,h4,h5,h6,p,ul,ol,li,th,td,summary,caption,dt,dd,code,span,root`.split(','),
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
  init: function (opts = {}) {
    const vars = this.var
    const { opt, fov } = vars

    //
    // Mode: Proxy or Standalone
    const proxy = !!(opts.scene && opts.camera && opts.renderer)

    let dpr = Math.min(devicePixelRatio, 1)
    vars.scene = opts.scene || new THREE.Scene()
    vars.renderer =
      opts.renderer ||
      new THREE.WebGLRenderer({
        //antialias: false,
        //precision: 'lowp',
        //powerPreference: 'low-power',
      })

    vars.renderer.setPixelRatio(devicePixelRatio)
    const domElement = vars.renderer.domElement
    const container = proxy ? domElement.parentElement : document.body

    fov.w = container.offsetWidth
    fov.h = container.offsetHeight
    const frustum = fov.max * opt.depth
    vars.camera = opts.camera || new THREE.PerspectiveCamera(45, fov.w / fov.h, fov.z / 2, frustum * 4)

    //
    // Inject Stage
    const template = document.createElement('template')
    template.innerHTML = `
    <section id='mp'>
      <div class='tool mp-offscreen' id='custom'>
        <object></object>
      </div>
      <aside class='tool' id='atlas'>
        <canvas></canvas>
        <hr id='caret' />
      </aside>
      <div id='css3d'></div>
    </section>`

    container.appendChild(template.content)
    mpos.var.atlas = document.querySelector('#atlas canvas')
    vars.caret = document.getElementById('caret')
    const mp = proxy ? container : document.getElementById('mp')
    mp.classList.add('mp-block')

    vars.camera.layers.enableAll()
    if (!proxy) {
      vars.camera.position.z = frustum / 8
      vars.renderer.setSize(fov.w * dpr, fov.h * dpr)
      mp.appendChild(domElement)
      vars.renderer.setClearColor(0x00ff00, 0)
      // helpers
      const axes = new THREE.AxesHelper(fov.max)
      vars.scene.add(axes)
    }

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(fov.w * dpr, fov.h * dpr)
    css3d.appendChild(vars.rendererCSS.domElement)
    css3d.querySelectorAll('div').forEach((el) => el.classList.add('mp-block'))

    const controls = new MapControls(vars.camera, domElement)
    controls.screenSpacePanning = true
    controls.maxDistance = frustum

    const halfHeight = -(fov.h / 2)
    vars.camera.position.setY(halfHeight + 0.125)
    controls.target.setY(halfHeight)
    controls.update()
    vars.controls = controls

    //
    // Enable UX
    const ux = mpos.ux
    window.stats = new Stats()
    mp.appendChild(stats.dom)

    // First Paint
    ux.events.raycaster.layers.set(2)
    ux.render()

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
    ux.observer = new IntersectionObserver(callback)

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
        delay: [0, 300, 5],
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
  },
  add: async function (selector, opts = {}) {
    const vars = mpos.var
    const { opt, fov, atlas, geo, mat, mat_line, scene } = vars // grade needs attention pre/post
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
      await mpos.set
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
    console.log('grade_r', grade_r)
    await mpos.set.old(selector)
    // New Group
    const group = new THREE.Group()
    group.name = selector

    //
    // Build DOM Tree Structure
    vars.grade = { wait: Infinity }
    grade = {
      // Template Isolate
      el: sel,
      group: group,
      canvas: atlas, // || document.createElement('canvas'),
      batch: vars.batch++, // unique group identifier
      atlas: 0, // implies poster++ (from depth/type) and not other
      elsMin: 0, // implies view range (inPolar++) of Observers
      elsMax: 0, // instance
      mapMin: 256, // texture
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

    const boxSize = { count: 0, average: 0 }
    function avg(val, acc) {
      // moving average
      let avg = acc.average + (val - acc.average) / (1 + acc.count)
      // moving average
      acc.average = avg
      acc.count++
    }

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
            // Atlas Cell
            const avgRect = (rect.el.offsetWidth + rect.el.offsetHeight) / 2
            avg(avgRect, boxSize)
          }
        }
      }

      node = ni.nextNode()
    }

    //
    // Atlas Ration: relative device
    grade.mapMin = Math.pow(2, Math.ceil((boxSize.average * 2) / fov.max)) * 64
    grade.mapCell = Math.floor(Math.sqrt(grade.elsMax / 2))
    grade.mapMax = Math.min(grade.mapMin * grade.mapCell, 2_048)
    grade.canvas.width = grade.canvas.height = grade.mapMax

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
            rect.atlas = grade.atlas++
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
            const abort = grade.atlas > grade.mapMax
            if (block || abort) {
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
                  mat = setMat(node, mat, manual, child)
                  setRect(rect, z, mat, unset)
                }
              }
            }
          }
        }
      }
    }

    struct(sel, depth)

    Object.keys(grade.rects).forEach((idx) => {
      //
      // Complete Preparation
      let rect = grade.rects[idx]

      if (rect.mat) {
        rect.idx = Number(idx)
        if (rect.inPolar >= grade.inPolar) {
          // Begin Subsets: atlas || other
          const type = rect.r_
          const r_ = grade.r_[type]
          r_.rects[idx] = rect
          r_.count++
        } else {
          // note: observe off-screen (!inPolar) elements...?
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
    // Instanced Mesh and Shader Atlas
    const shader = mpos.set.shader(grade.canvas, grade.mapCell)
    const instanced = new THREE.InstancedMesh(geo, [mat, mat, mat, mat, shader, mat_line], grade.elsMax)

    instanced.layers.set(2)
    instanced.userData.shader = shader
    instanced.userData.el = grade.sel
    instanced.name = [grade.count, selector.tagName].join('_')
    grade.instanced = instanced
    grade.mapKey = { x: 1 - 1 / grade.mapCell, y: 0.0001 } // empty structure (cyan)

    // Atlas UV Buffer
    const uvOffset = new THREE.InstancedBufferAttribute(new Float32Array(grade.elsMax * 2).fill(-1), 2)
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
            let bound = rect.bound || node.getBoundingClientRect()
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
      } else if (rect.mat === 'native' && rect.r_ === 'other') {
        // note: element may not inherit some specific styles
        const el = rect.el.cloneNode(true)
        // wrap prevents overwritten transform, and inherits some attributes
        const stub = rect.el.parentElement
        const tag = stub.tagName !== 'BODY' ? stub.tagName : 'DIV'
        const wrap = document.createElement(tag)
        wrap.classList.add('mp-native')
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
      } else if (rect.mat === 'wire') {
        // Mesh unclassified (currently only root node)
        const mesh = new THREE.Mesh(geo, mat_line)
        mesh.userData.el = rect.el
        mesh.animate = true
        object = mesh
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
        let zRange = zGrade + (zDomain ? 0 : Math.abs(zIndex))
        const zScale = 1 - 1 / (zRange + 1)

        let z = zSign * zScale * fov.z

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
          const mid = fov.w / 2
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
          res = mpos.set.loader(rect.el, object)
          res.userData.el = rect.el
          res.userData.idx = rect.idx
        } else {
          // Generic: (wire, native CSS3D)
          grade.group.add(object)
        }

        const name = [rect.z, rect.mat, rect.el.nodeName].join('_')
        res.name = name
        rect.obj = res
      }

      rect.ux.u = false
      return res
    },
    css: function (rect, progress) {
      const { grade } = mpos.var

      //
      // CSS Style Transforms: accumulate a natural box model

      let el = rect.el
      const frame = typeof progress === 'number'
      // css style: transform, transformOrigin, backgroundColor, zIndex, position
      const css = rect.css || { style: window.getComputedStyle(el) }

      function getBound(element) {
        let bound = element.getBoundingClientRect()
        //bound.width = element.clientWidth;
        //bound.height= element.clientHeight;
        return bound
      }

      let uxout = {}
      if (progress === undefined || frame) {
        // ux frame change pre/post calculable? (imperative)
        rect.ux.u = false
        uxout = { bound: rect.bound, scale: css.scale, degree: css.degree }

        if (!rect.hasOwnProperty('css') || rect.frame < progress) {
          // ux priority may escalate (declarative)
          const priority = css.pseudo || mpos.diffs('tween', { style: css.style })
          rect.ux.o = priority ? rect.ux.i + 1 : rect.ux.i

          // reset transforms
          css.scale = 1
          css.radian = 0
          css.degree = 0
          css.transform = 0
        }
      } else {
        // rect.unset
        // quirks of DOM
        //if (el.matches('details')) {
        //  el.open = progress
        //}
        //if (el.matches('.mp-offscreen')) {
        //  rect.z = css.style.zIndex
        //}
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

                if (style && mpos.diffs('matrix', { style: style })) {
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
          unset = getBound(rect.el)
          accumulate(!progress)
        } else {
          if (progress === undefined || frame) {
            // update rect properties from frame
            rect.css = css
            rect.bound = getBound(rect.el)

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
    shader: function (canvas, texStep) {
      //discourse.threejs.org/t/13221/17
      const texAtlas = new THREE.CanvasTexture(canvas)
      texAtlas.minFilter = THREE.NearestFilter
      // update
      const m = mpos.var.mat_shader
      m.uniforms.map.value = texAtlas
      m.uniforms.atlasSize.value = texStep
      // output
      m.userData.t = texAtlas
      return m
    },
    src: function (el, url, attr) {
      return new Promise((resolve, reject) => {
        el.onload = (e) => resolve(e)
        el.onerror = (e) => reject(e)
        el.setAttribute(attr, url)
      })
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

        //
        // Canvas
        const vars = mpos.var
        if (grade) {
          const ctxC = grade.ctx
          ctxC.clearRect(0, 0, ctxC.width, ctxC.height)
          // note: more grades would destroy canvases
          //grade.canvas = grade.ctx = null
        }

        // CSS3D
        /*
        const css3d = mpos.var.rendererCSS.domElement
        const clones = css3d.querySelectorAll(':not(.mp-block)')
        clones.forEach(function (el) {
        el.parentElement.removeChild(el)
        })
        */

        // Shader Atlas
        //let atlas = document.getElementById('atlas').children
        //for (let c = atlas.length - 1; c >= 0; c--) {
        // atlas[c].parentElement.removeChild(atlas[c])
        //}
        document.querySelectorAll('[data-idx]').forEach((el) => el.setAttribute('data-idx', ''))
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

        resourceUse()

        resolve('clear')
        reject('no')
      })
    },
    fit: function (dummy, group, opts = {}) {
      // Group Scale from Element Dummy
      if (group.children.length) {
        let s2 = group.userData.s2
        if (!s2) {
          const grade = mpos.var.grade
          grade.group.add(group)

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

        mpos.ux.render()
      }
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
    loader: function (source, dummy) {
      //const vars = mpos.var
      const { cache, grade, reset, geo, mat, mat_shape, mat_line } = mpos.var

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
      let object
      if (mime.match(/(WEBM|MP4|OGV)/g)) {
        // HANDLER: such as VideoTexture, AudioLoader...
        const material = mat_shape.clone()
        const texture = new THREE.VideoTexture(source)
        material.map = texture
        const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])
        mesh.layers.set(2)
        mesh.matrix.copy(dummy.matrix)
        mesh.name = uri
        // unique overrides

        grade.group.add(mesh)
        object = mesh
      } else {
        let group = new THREE.Group()
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

          const [width, height] = mpos.set.pyr(source.naturalWidth, source.naturalHeight, 128)

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
              group.add(data)
              mpos.set.fit(dummy, group, { add: true })
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

                  group.add(mesh)
                }
              }

              group.name = mime
              mpos.set.fit(dummy, group, { add: true })
              if (!asset.data) mpos.set.cache(asset, uri, data)
            } else if (mime.match('.GIF')) {
              // File Extension: Graphics Interchange Format
              const canvas = loader.get_canvas()
              // SuperGif aka LibGif aka JsGif
              // todo: manual frame index from delta (investigate negative order bug?)
              const material = mat_shape.clone()
              material.map = new THREE.CanvasTexture(canvas)

              const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])
              mesh.matrix.copy(dummy.matrix)
              mesh.name = uri

              // unique overrides
              grade.group.add(mesh)
              const idx = source.getAttribute('data-idx')
              const rect = grade.rects[idx]
              rect.obj = mesh

              //NOTE: finding a route for special type
              // after loaded, boost priority, re-enqueue, force update
              rect.ux.i = 1
              mesh.animate = { gif: loader }
              grade.r_.queue.push(idx)
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
        object = group
      }

      return object
    },
    opencv: function (img, group, dummy) {
      let kmeans = {}
      let Module = {
        _stdin: { img: img, kmeans: kmeans },
        wasmBinaryFile: './opencv_js.wasm',
        preRun: [
          function (e) {
            //console.log('preRun')
          }
        ],
        _main: function (c, v, o) {
          //console.log('_main', c, v, o)
          const cv = this
          let img = this._stdin.img
          let kmeans = this._stdin.kmeans

          try {
            const clusters = 16
            function release(mat) {
              //cv.setTo([0, 0, 0, 0]) // <- pre-optimizes kmeans result to {}
              cv.resize(mat, mat, new cv.Size(1, 1), 0, 0, cv.INTER_NEAREST)
              mat.delete()
            }

            const src = cv.imread(img)
            img = null
            const size = src.size()

            // KMEANS
            const pyr = src.clone()
            const [width, height] = mpos.set.pyr(pyr.cols, pyr.rows, clusters * 8)
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
                  mesh.layers.set(2)
                  group.add(mesh)
                }
              })
              kmeans = null

              group.name = 'OpenCV'

              mpos.set.fit(dummy, group, { add: true })
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
    const { opt, reset } = mpos.var
    //const vars = mpos.var

    //
    // Emulate Page Flow: reduce and detect changes

    let r_queue = grade.r_.queue
    if ((rType && !r_queue.length) || grade.wait === true || grade.wait === Infinity || !grade.canvas || document.hidden) {
      // skip frame
      return
    }

    grade.wait = true
    const r_atlas = grade.r_.atlas
    const r_other = grade.r_.other
    let r_frame = 0
    let quality = 1
    let capture = false

    grade.inPolar = opt.inPolar
    if (rType) {
      // SOFT-update: Observer or frame
      let reflow = false
      for (let i = r_queue.length - 1; i >= 0; i--) {
        const idx = r_queue[i]
        if (isFinite(idx)) {
          // new Observer
          const rect = grade.rects[idx]
          const type = rect.r_
          const r_ = grade.r_[type]

          if (!r_.rects[idx]) {
            if (rect.mat === 'poster' || (rect.mat === 'native' && rect.r_ === 'atlas')) {
              // Instanced
              rect.atlas = grade.atlas++
            } else if (type === 'other') {
              // CSS3D or Loader
              rect.add = true
            }
            // add key
            r_.rects[idx] = rect
            r_.count++
            grade.elsMin++
          }
        } else if (idx === 'delay' || idx === 'move' || idx === 'trim') {
          reflow = true

          if (idx === 'delay') {
            const timers = mpos.ux.timers
            r_frame = timers[idx][timers[idx].length - 1]
            // quality limits pixelRatio of html-to-image
            const now = performance.now()
            const elapsed = now - timers.last
            timers.last = now

            quality = Math.max(mpos.var.opt[idx] / elapsed, 0.8).toFixed(2)
          }
        }
      }

      if (reflow) {
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
              if (rect.inPolar >= mpos.var.opt.inPolar) {
                if (rect.el.tagName === 'BODY') {
                  // no propagate
                  r_queue.push(idx)
                } else {
                  let pseudo = mpos.diffs('pseudo', { rect: rect, sel: grade.el, capture: capture })
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

                      r_queue.push(...rect.child)
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
      const idx = root.getAttribute('data-idx') || 999
      const rect = { el: root, mat: 'wire', z: -idx, fix: true, ux: { i: 1, o: 0 }, idx: idx }

      r_other.rects[idx] = rect
    }

    //console.log('queue', r_queue.length, dataIdx, r_frame)
    const promise = new Promise((resolve, reject) => {
      //if (!grade.canvas) {
      //  console.log(grade)
      //  resolve(grade)
      //}

      //
      // Instanced Mesh
      const instanced = grade.instanced
      const uvOffset = instanced.geometry.getAttribute('uvOffset')
      const step = grade.mapMax / grade.mapCell

      //
      // Offscreen Canvas
      //devnook.github.io/OffscreenCanvasDemo/use-with-lib.html
      //developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
      let ctx = grade.ctx
      if (!ctx) {
        // etc: offscreen, transfercontrols, multiple readback
        let options = { willReadFrequently: true, alpha: true }
        grade.ctx = grade.canvas.getContext('2d', options)
        grade.ctx.imageSmoothingEnabled = false
      }
      const ctxC = grade.ctx

      function atlas(grade, opts = {}) {
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
            atlas(grade, opts)
          } else {
            // Resolve

            if (!rType) {
              // atlas key structure
              ctxC.clearRect(grade.mapMax - step, grade.mapMax - step, step, step)
              ctxC.fillStyle = 'rgba(0,255,255,0.125)'
              ctxC.fillRect(grade.mapMax - step, grade.mapMax - step, step, step)
            }

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
          const pixelRatio = rect.ux.o ? quality : 0.8
          const options = {
            style: { ...reset },
            canvasWidth: step,
            canvasHeight: step,
            pixelRatio: pixelRatio,
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
            const float = mpos.diffs('flow', { style: rect.css.style })
            if (float) {
              options.style.top = options.style.right = options.style.bottom = options.style.left = 'initial'
            }
          }

          const noBox = mpos.diffs('rect', { node: rect.el })
          if (noBox) {
            //options.style.display = 'inline-block' // tame pop-in
            options.width = rect.el.offsetWidth // force size
            options.height = rect.el.offsetHeight // force size
          }

          //const isMatrix = mpos.diffs('matrix', { style: rect.css.style })
          //if (isMatrix) {
          //  options.style.transform = 'initial'
          //}

          toCanvas(rect.el, options)
            .then(function (canvas) {
              if (canvas.width === 0 || canvas.height === 0) {
                // no box
              } else {
                // canvas xy, from top (FIFO)
                let x = (rect.atlas % grade.mapCell) * step
                let y = (Math.floor(rect.atlas / grade.mapCell) % grade.mapCell) * step
                // canvas rounding trick, bitwise or
                x = (0.5 + x) | 0
                y = (0.5 + y) | 0
                r_frame && ctxC.clearRect(x, y, step, step)
                ctxC.drawImage(canvas, x, y, step, step)
                // shader xy, from bottom
                // avoid 0 edge, so add 0.0001
                rect.x = (0.0001 + x) / grade.mapMax
                rect.y = (0.0001 + y + step) / grade.mapMax
              }
              // recurse
              canvas = null

              next()
            })
            .catch(function (error) {
              console.log(error)
              next()
            })
        } else {
          next()
        }
      }

      atlas(grade)

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

        if (!paint) {
          //
          // Meshes other (matches Loader) update on tail
          //grade.scroll = { x: window.scrollX, y: window.scrollY }
          Object.values(r_other.rects).forEach(function (rect) {
            let newGeo = !rect.hasOwnProperty('obj') && (rType === undefined || rect.add)
            let scroll = rect.fix ? { x: 0, y: 0, fix: true } : false

            const dummy = mpos.set.box(rect, { add: newGeo, scroll: scroll, frame: r_frame })

            if (rect.obj) {
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

        let count = 0
        const color = new THREE.Color()
        let newGeo, newMap

        for (const [idx, rect] of Object.entries(r_atlas.rects)) {
          let uxForce = rect.ux.i || rect.ux.o || rect.ux.u
          let inPolar = uxForce ? mpos.set.inPolar(rect) >= grade.inPolar : rect.inPolar >= grade.inPolar

          const dummy = mpos.set.box(rect, { frame: r_frame })
          dummy && instanced.setMatrixAt(count, dummy.matrix)

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
          let x, y
          if (rType === undefined || dummy || uxForce) {
            if (rect.hasOwnProperty('atlas') || rect.mat === 'self') {
              // top-tier bracket
              if (inPolar) {
                x = rect.x || grade.mapKey.x
                y = 1 - rect.y || grade.mapKey.y
              } else if (grade.inPolar === 4) {
                // partial update from split frame (trim), due to scroll delay
                x = grade.mapKey.x
                y = grade.mapKey.y
              }
            }

            // bug frame: force inPolar/css, update instance.count, update render/texture, 3rd condition
            uvOffset.setXY(count, x || vis, y || vis)
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
        instanced.computeBoundingSphere() // cull and raycast
        instanced.computeBoundingBox()
        instanced.instanceMatrix.needsUpdate = true
        if (newMap) instanced.instanceColor.needsUpdate = true
        // Atlas Postprocessing...?
        //ctxC.drawImage(OffscreenCanvas, 0, 0)
        mpos.ux.render()

        if (!paint) {
          const target = mpos.ux.events.target
          target.clear()
          targets.forEach((item) => target.add(item))
          // frame done
          grade.wait = false
          resolve(grade)
          reject(grade)
        }
      }
    })

    promise.catch((error) => console.log(error))
    promise.then(function (grade) {
      //console.log('update', grade)
      return promise
    })
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
        const [timer, timeout] = e.type === 'delay' ? ['delay', e.value] : ['reflow', 250]

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
              fov.w = container.offsetWidth
              fov.h = container.offsetHeight

              camera.aspect = fov.w / fov.h
              camera.updateProjectionMatrix()

              renderer.setSize(fov.w, fov.h)
              rendererCSS.setSize(fov.w, fov.h)

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
    render: function () {
      const { grade, time, mat_shader, scene, camera, renderer, rendererCSS } = mpos.var

      time.delta += time.clock.getDelta()
      if (time.delta > time.interval) {
        // The draw or time dependent code are here
        time.delta %= time.interval
      }

      if (grade) {
        // animation step
        grade.group.traverse((obj) => {
          if (obj.animate) {
            if (obj.animate === true) {
              const animationTime = Date.now() / 100
              // wiggle root
              obj.rotation.x = Math.sin(animationTime) / 100
              obj.rotation.y = Math.cos(animationTime) / 100
              obj.position.z = -9
            } else if (obj.animate.gif) {
              // refresh SuperGif
              obj.material.map.needsUpdate = true
            }
          }
        })

        // instanced elements need texture update
        grade.instanced.geometry.getAttribute('uvOffset').needsUpdate = true
        mat_shader.userData.t.needsUpdate = true
        //instanced.instanceColor.needsUpdate = true
      }

      renderer.render(scene, camera)
      rendererCSS.render(scene, camera)

      stats.update()

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
          const cell = 100 * (1 / grade.mapCell)
          caretROI.width = caretROI.height = cell + '%'
          caretROI.left = 100 * rect.x + '%'
          caretROI.bottom = 100 * (1 - rect.y) + '%'
          if (!rect.hasOwnProperty('atlas')) {
            // child container
            caretROI.width = '100%'
            caretROI.left = caretROI.bottom = 0
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
      //console.log(synthetic, emits, NodeWalker)
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
