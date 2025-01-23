import './mpos.css'
// OpenCV and SuperGif
import { toCanvas } from 'html-to-image'
import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'
//

const mpos = {
  var: {
    opt: {
      selector: 'main',
      address: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 16,
      inPolar: 3,
      arc: 0,
      delay: 0,
      update: function () {
        mpos.add.dom(this.selector, { depth: this.depth })
      }
    },
    fov: {
      w: window.innerWidth,
      h: window.innerHeight,
      z: 8,
      max: 1024
    },
    unset: {
      diffs: function (type, opts = {}) {
        let differ = false

        if (type === 'rect') {
          differ = !opts.node.clientWidth || !opts.node.clientHeight
          // note: opts.whitelist for quirks..?
          //&& el.matches('a, img, object, span, xml, :is(:empty)')
        } else if (type === 'matrix') {
          // note: style may be the frame copy uninitialized or accumulating
          differ = opts.style.transform?.startsWith('matrix')
        } else if (type === 'tween') {
          differ =
            opts.style.transform !== 'none' ||
            opts.style.transitionDuration !== '0s' ||
            (opts.style.animationName !== 'none' && opts.style.animationPlayState === 'running')
        } else if (type === 'pseudo') {
          // note: let pseudo update rect frame (before return)
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

            // pseudo (or prior frame) enqueued for atlas
            differ = css.pseudo
            css.pseudo = rect.el === capture.active || rect.el === capture.focus || (rect.el === capture.hover && rect.mat === 'poster')
            differ = differ || css.pseudo

            rect.ux.p = differ
          }
        }

        if (opts.node) {
          // node may be set manually
          // check on tail, so other updates (like pseudo) bubble to queue
          differ = differ || opts.node.classList.contains('mp-diff')
        }

        return differ
      },
      style: {
        margin: 'initial',
        transform: 'initial'
        //display: 'block',
      }
    },
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({
      transparent: true,
      wireframe: true,
      color: 'cyan',
      side: THREE.FrontSide
    }),
    mat_line: new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.5,
      color: 'cyan',
      depthWrite: false,
      side: THREE.FrontSide
    }),
    mat_shader: new THREE.RawShaderMaterial({
      transparent: true,
      depthWrite: false,
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
    }),
    mat_shape: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2()
  },
  init: function (opts = {}) {
    const vars = this.var
    vars.proxy = !!(opts.scene && opts.camera && opts.renderer)

    // proxy mode or standalone
    vars.scene = opts.scene || new THREE.Scene()
    vars.renderer =
      opts.renderer ||
      new THREE.WebGLRenderer({
        // no impact
        precision: 'lowp',
        powerPreference: 'low-power',
        stencil: false,
        depth: false,
        antialias: false
      })
    vars.renderer.setPixelRatio(1)
    const domElement = vars.renderer.domElement
    const container = vars.proxy ? domElement.parentElement : document.body
    //
    window.stats = new Stats()
    container.appendChild(stats.dom)

    vars.fov.w = container.offsetWidth
    vars.fov.h = container.offsetHeight
    vars.camera = opts.camera || new THREE.PerspectiveCamera(45, vars.fov.w / vars.fov.h, 0.001, vars.fov.max * 16)

    // inject mpos stage
    const template = document.createElement('template')
    template.innerHTML = `
    <section id='mp'>
      <address class='tool mp-offscreen'>
        <object></object>
      </address>
      <aside class='tool' id='atlas'>
        <canvas></canvas>
        <hr id='caret' />
      </aside>
      <div id='css3d'></div>
    </section>`

    container.appendChild(template.content)
    mpos.precept.canvas = document.querySelector('#atlas canvas')
    vars.caret = document.getElementById('caret')
    const mp = vars.proxy ? container : document.getElementById('mp')
    mp.classList.add('mp-block')

    vars.camera.layers.enableAll()
    if (!vars.proxy) {
      vars.camera.position.z = vars.fov.max
      vars.renderer.setSize(vars.fov.w, vars.fov.h)
      mp.appendChild(domElement)
      vars.renderer.setClearColor(0x00ff00, 0)
      // helpers
      const axes = new THREE.AxesHelper(vars.fov.max)
      vars.scene.add(axes)
    }

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
    css3d.appendChild(vars.rendererCSS.domElement)
    css3d.querySelectorAll('div').forEach((el) => el.classList.add('mp-block'))

    vars.controls = new MapControls(vars.camera, domElement)
    vars.controls.screenSpacePanning = true

    const halfHeight = -(vars.fov.h / 2)
    vars.camera.position.setY(halfHeight + 0.125)
    vars.controls.target.setY(halfHeight)
    vars.controls.update()

    // reveal
    vars.raycaster.layers.set(2)
    mpos.ux.render()

    // user events: scene
    vars.controls.addEventListener('change', mpos.ux.render, false)
    domElement.addEventListener('pointermove', mpos.ux.raycast, false)
    const events = ['mousedown', 'mousemove', 'click']
    events.forEach(function (event) {
      domElement.addEventListener(event, mpos.ux.event, false)
    })

    // user events: window
    window.addEventListener('scroll', mpos.ux.reflow, false)
    // resize
    const resize = new ResizeObserver((entries) => {
      mpos.ux.reflow({ type: 'resize' })
    })
    resize.observe(mp)

    const callback = function (entries, observer) {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target)
          mpos.ux.reflow(entry)
        }
      })
    }
    mpos.ux.observer = new IntersectionObserver(callback)

    // user events: css clone
    //const cloneCSS = mp.querySelector('#css3d > div > div > div')
    //domElement.addEventListener('input', mpos.ux.event, false)

    const gui = new GUI()
    gui.domElement.classList.add('mp-native')
    Object.keys(vars.opt).forEach(function (key) {
      const params = {
        selector: [['body', 'main', '#native', '#text', '#loader', '#media', '#gen', 'address']],
        depth: [0, 32, 1],
        inPolar: [1, 4, 1],
        delay: [0, 300, 5],
        arc: [0, 1, 0.25]
      }
      const param = params[key] || []
      const controller = gui.add(vars.opt, key, ...param).listen()

      if (key === 'delay') {
        controller.onFinishChange(function (v) {
          mpos.ux.reflow({ type: 'delay', value: v })
        })
      }
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
    reflow: function (e) {
      // balance lag of input versus update
      const vars = mpos.var
      const grade = vars.grade
      if (!grade) {
        return
      }
      const queue = grade.r_.queue

      function enqueue(idx) {
        if (queue.indexOf(idx) === -1) {
          // add unique
          queue.push(idx)
        }

        if (idx === 'delay') {
          // immediate schedule, unless manually called -1
          if (e.value > 0) {
            // schedule next frame (but 0 doesnt, and -1 clears without update)
            mpos.ux.reflow({ type: e.type, value: e.value })
          }
          if (!grade.wait) {
            // update current queue
            mpos.precept.update(grade, idx)
          }
        } else {
          // debounce concurrent
          requestIdleCallback(
            function () {
              if (queue.length) {
                mpos.precept.update(grade, idx)
              }
            },
            { time: 125 }
          )
        }
      }

      if (e.isIntersecting) {
        // enqueue visible element
        const idx = e.target.getAttribute('data-idx')
        enqueue(idx)
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
            const vars = mpos.var
            // setTimeout is global scope, so strictly re-declare vars

            if (e.type === 'resize') {
              // ...recalculate inPolar and update?
              const container = vars.renderer.domElement.parentElement
              vars.fov.w = container.offsetWidth
              vars.fov.h = container.offsetHeight

              vars.camera.aspect = vars.fov.w / vars.fov.h
              vars.camera.updateProjectionMatrix()

              vars.renderer.setSize(vars.fov.w, vars.fov.h)
              vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)

              mpos.ux.render()
            } else {
              let idx = e.type
              if (e.type === 'scroll') {
                // update visibility?
                idx = vars.opt.inPolar === 4 ? 'trim' : 'move'
              }
              enqueue(idx)
            }
          }, timeout)
        )
      }
    },
    render: function () {
      const vars = mpos.var
      const grade = vars.grade

      if (grade) {
        // animation step
        const time = new Date().getTime() / 100
        grade.group.traverse((obj) => {
          if (obj.animate) {
            if (obj.animate === true) {
              // wiggle root
              obj.rotation.x = Math.sin(time) / 10
              obj.rotation.y = Math.cos(time) / 10
            } else if (obj.animate.gif) {
              // refresh SuperGif
              obj.material.map.needsUpdate = true
            }
          }
        })

        // instanced elements need texture update
        let instanced = grade.instanced
        instanced.instanceMatrix.needsUpdate = true
        let uvOffset = instanced.geometry.getAttribute('uvOffset')
        uvOffset.needsUpdate = true
        instanced.userData.shader.userData.t.needsUpdate = true
        //instanced.instanceColor.needsUpdate = true
      }

      vars.renderer && vars.renderer.render(vars.scene, vars.camera)
      vars.rendererCSS && vars.rendererCSS.render(vars.scene, vars.camera)

      stats.update()
      //requestAnimationFrame(vars.animate)
    },
    raycast: function (e) {
      const vars = mpos.var
      vars.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      vars.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1

      const grade = vars.grade
      if (grade) {
        vars.raycaster.setFromCamera(vars.pointer, vars.camera)
        let intersects = vars.raycaster.intersectObjects(grade.group.children, false)
        intersects = intersects.filter(function (hit) {
          // intersects.instanceId is any Instanced atlas (child, self...)
          // grade.ray { instance: data-idx }
          return Object.keys(grade.ray).indexOf(String(hit.instanceId)) > -1
        })

        if (intersects.length) {
          const hit = intersects[0]
          const obj = hit.object

          if (obj) {
            // note: to update instanceMatrix, indexes would need to be constant from transforms()
            // ... i.e. inPolar<3, noscroll, append only...
            const rect = Object.values(grade.r_.atlas.rects)[hit.instanceId]
            //console.log(hit.instanceId, rect.el, uv)
            // note: raycast element may be non-interactive (atlas), but not CSS3D or loader (other)
            vars.events = { uv: hit.uv, el: rect.el, mat: rect.mat, position: rect.css?.style.position || {}, bound: rect.bound }
            //
            const caret = vars.caret.style
            // visibility
            const color = rect.inPolar >= 4 ? 'rgba(0,255,0,0.66)' : 'rgba(255,0,0,0.66)'
            caret.backgroundColor = color
            // location
            const cell = 100 * (1 / grade.cells)
            caret.width = caret.height = cell + '%'
            caret.left = 100 * rect.x + '%'
            caret.bottom = 100 * (1 - rect.y) + '%'
            if (!rect.atlas) {
              // child container
              caret.width = '100%'
              caret.left = caret.bottom = 0
            }
          }
        } else {
          vars.events = {}
        }
      }
    },
    event: function (e) {
      mpos.var.controls.enablePan = true
      //console.log(e.type)
      const events = mpos.var.events
      if (!events || !events.el || events.mat !== 'native') {
        return
      } else if (e.type === 'mousedown' || e.type === 'mousemove') {
        mpos.var.controls.enablePan = false
      }

      //github.com/mrdoob/three.js/blob/dev/examples/jsm/interactive/HTMLMesh.js#L512C1-L563C2
      // CSS3D
      //const idx = e.target.getAttribute('data-idx')
      //const source = document.querySelector('body > :not(.mp-block) [data-idx="' + idx + '"]')

      // raycaster
      const element = events.el
      const uv = { x: events.uv.x, y: 1 - events.uv.y }

      // eventListener
      const event = e.type
      //const pageX = e.offsetX
      //const pageY = e.offsetY

      const [scrollX, scrollY] = events.position === 'fixed' ? [0, 0] : [window.scrollX, window.scrollY]

      const MouseEventInit = {
        clientX: uv.x * element.offsetWidth + element.offsetLeft + scrollX,
        clientY: uv.y * element.offsetHeight + element.offsetTop + scrollY,
        view: element.ownerDocument.defaultView
        //
        //bubbles: true,
        //cancelable: true
      }

      //window.dispatchEvent(new MouseEvent(event, MouseEventInit))
      const bound = events.bound
      let x = uv.x * bound.width + bound.left + scrollX
      let y = uv.y * bound.height + bound.top + scrollY

      //const el = document.elementFromPoint(x, y)
      //el.dispatchEvent(new MouseEvent(event, MouseEventInit))

      function traverse(element) {
        const bound = element.getBoundingClientRect()
        if (x >= bound.left && x <= bound.right && y >= bound.top && y <= bound.bottom) {
          element.dispatchEvent(new MouseEvent(event, MouseEventInit))
        }

        for (let i = 0; i < element.children.length; i++) {
          traverse(element.children[i])
        }
      }

      traverse(element)
    }
  },
  precept: {
    index: 0,
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
    inPolar: function (rect, control) {
      const node = rect.el
      let vis = node && (node.tagName || node.textContent.trim()) ? 1 : false
      if (vis) {
        if (node.nodeName === '#text' && typeof control === 'object') {
          // node relative in control plot
          vis = Object.values(control).some(function (tag) {
            const parent = node.parentElement
            const unlist = parent && parent.offsetWidth && parent.offsetHeight
            return unlist && node.compareDocumentPosition(tag.el) & Node.DOCUMENT_POSITION_CONTAINS
          })
        } else {
          // 1: node not empty
          if (node.tagName) {
            // 2: node is tag
            vis++
            let bound = rect.bound || node.getBoundingClientRect()
            if (bound.width > 0 && bound.height > 0 && node.checkVisibility()) {
              // 3: tag is visible
              vis++
              const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
              const scroll = bound.bottom >= 0 && bound.top - viewHeight < 0
              if (scroll) {
                // 4: tag in viewport
                vis++
              }
            }
          }
        }
      }

      rect.inPolar = vis
      return vis
    },
    update: function (grade, dataIdx) {
      const vars = mpos.var
      let r_queue = grade.r_.queue

      if ((dataIdx && !r_queue.length) || grade.wait || document.hidden) {
        // skip frame
        return
      }

      grade.wait = true
      const r_atlas = grade.r_.atlas
      const r_other = grade.r_.other
      let r_frame = 0
      let quality = 1
      let capture = false

      grade.inPolar = vars.opt.inPolar
      if (dataIdx) {
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
              grade.minEls++
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
              // traverse transforms (set/unset), update properties, and qualify ux
              mpos.add.css(rect, r_frame)
              // update visibility
              mpos.precept.inPolar(rect)

              if (reQueue) {
                if (rect.inPolar >= mpos.var.opt.inPolar) {
                  if (rect.el.tagName === 'BODY') {
                    // no propagate
                    r_queue.push(idx)
                  } else {
                    let pseudo = vars.unset.diffs('pseudo', { rect: rect, sel: grade.el, capture: capture })
                    if (pseudo || rect.ux.u || rect.ux.o) {
                      // element ux changed or elevated
                      // note: pseudo evaluates first, so atlas unset has consistent off-state
                      if (r_queue.indexOf(idx) === -1) {
                        r_queue.push(idx)
                      }

                      if (rect.ux.p) {
                        // note: pseudo is (active), or was (blur), so enqueue (with children)
                        // to update atlas/transform by forcing ux.u="all"
                        // todo: set ux.o++ priority (if ux.p), and use ux.u correctly
                        // ... compare, inherit?
                        rect.ux.u = 'all'
                        rect.ux.p = false
                        // children propagate
                        let child = rect.child || []
                        if (!rect.child) {
                          // cache a static list
                          rect.el.querySelectorAll('[data-idx]').forEach(function (el) {
                            const idx = el.getAttribute('data-idx')
                            let rect = rects[idx]
                            //rect.css.pseudo = true
                            if (rect && rect.mat === 'poster') {
                              rect.ux.u = 'all' // force child on frame, for atlas/transform...?
                              child.push(idx)
                            }
                          })
                          rect.child = child
                        }

                        r_queue.push(...child)
                      }
                    }
                  }
                }
              }
              if (vars.opt.arc) {
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
        const rect = { el: root, mat: 'wire', z: -16, fix: true, ux: { i: 1, o: 0 } }
        const idx = root.getAttribute('data-idx')

        r_other.rects[idx] = rect
        r_other.count++
      }

      //console.log('queue', r_queue.length, dataIdx, r_frame)
      const promise = new Promise((resolve, reject) => {
        // Instanced Mesh
        const instanced = grade.instanced
        instanced.count = r_atlas.count
        const uvOffset = instanced.geometry.getAttribute('uvOffset')
        const step = grade.maxRes / grade.cells

        // Offscreen Canvas
        let osc = grade.osc
        if (!osc) {
          if (window.OffscreenCanvas) {
            osc = new OffscreenCanvas(grade.canvas.width, grade.canvas.height)
          } else {
            osc = document.createElement('canvas')
            osc.width = grade.canvas.width
            osc.height = grade.canvas.height
          }
          grade.osc = osc
          // multiple readback
          osc.getContext('2d').willReadFrequently = true
          grade.canvas.getContext('2d').willReadFrequently = true
        }
        // transfer control
        const ctxO = osc.getContext('2d')
        const ctxC = grade.canvas.getContext('2d')

        function atlas(grade, opts = {}) {
          if (opts.queue === undefined) {
            // update queue, SOFT or HARD
            opts.queue = dataIdx ? r_queue : Object.keys(r_atlas.rects)

            opts.idx = opts.queue.length
            // paint breakpoints [0,50%], unless frame
            // ...via transforms, which also calls loaders!
            opts.paint = opts.idx >= 24 && r_frame === 0 ? [0, Math.floor(opts.idx * 0.5)] : []
          }

          function next() {
            if (dataIdx) {
              // reduce queue
              opts.queue = opts.queue.splice(opts.queue.length - opts.idx, opts.queue.length)
            }

            if (opts.idx > 0) {
              if (opts.paint.indexOf(opts.idx) > -1) {
                console.log('...paint')
                transforms(grade, true)
              }
              opts.idx--
              atlas(grade, opts)
            } else {
              if (!dataIdx) {
                // atlas key structure
                ctxO.fillStyle = 'rgba(0,255,255,0.125)'
                ctxO.fillRect(grade.maxRes - step, grade.maxRes - step, step, step)
              }
              // resolve

              transforms(grade)
            }
          }

          function shallow(ux) {
            return ux.i !== 1 && ux.u === 'css'
          }
          // queue indexes from end, but in reverse
          const rect = r_atlas.rects[opts.queue[opts.queue.length - opts.idx]]

          if (rect && rect.atlas !== undefined && !shallow(rect.ux)) {
            // override box styles
            const pixelRatio = rect.ux.o ? quality : 0.8
            const options = {
              style: { ...vars.unset.style },
              canvasWidth: step,
              canvasHeight: step,
              pixelRatio: pixelRatio,
              preferredFontFormat: 'woff'
            }

            if (!rect.css || !rect.css.style) {
              // not in viewport last run
              //console.log('NO CSS', rect.el, rect)
            }

            const noBox = vars.unset.diffs('rect', { node: rect.el })
            if (noBox) {
              //options.style.display = 'inline-block' // tame pop-in
              options.width = rect.el.offsetWidth // force size
              options.height = rect.el.offsetHeight // force size
            }

            //const isMatrix = vars.unset.diffs('matrix', { style: rect.css.style })
            //if (isMatrix) {
            //  options.style.transform = 'initial'
            //}

            // to-do: transfer this to an offscreen worker
            toCanvas(rect.el, options)
              .then(function (canvas) {
                if (canvas.width === 0 || canvas.height === 0) {
                  // no box
                } else {
                  //noBox && (rect.el.style.display = 'initial')
                  // canvas xy, from top (FIFO)
                  const x = (rect.atlas % grade.cells) * step
                  const y = (Math.floor(rect.atlas / grade.cells) % grade.cells) * step
                  r_frame && ctxC.clearRect(x, y, step, step)
                  ctxO.drawImage(canvas, x, y, step, step)
                  // shader xy, from bottom
                  // avoid 0 edge, so add 0.0001
                  rect.x = (0.0001 + x) / grade.maxRes
                  rect.y = (0.0001 + y + step) / grade.maxRes
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
          // apply cumulative updates

          //grade.scroll = { x: window.scrollX, y: window.scrollY }

          if (!paint) {
            // Mesh: CSS3D, loader, root...
            Object.values(r_other.rects).forEach(function (rect) {
              const add = !rect.obj && (dataIdx === undefined || rect.add)
              const scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
              // add or transform
              const dummy = mpos.add.box(rect, { add: add, scroll: scroll, frame: r_frame })

              if (dummy && rect.obj) {
                // loaded
                // off-screen boxes may "seem" more visible than instancedMesh because they don't have a third state
                let vis = rect.fix ? true : rect.inPolar >= grade.inPolar
                rect.obj.visible = vis
              }

              if (rect.obj && rect.obj.animate && rect.obj.animate.gif) {
                // refresh SuperGif
                rect.obj.material.map.needsUpdate = true
              }
            })
          }

          //
          // experiment: forceFlush, oldGeo
          let oldGeo, oldMap
          let count = 0
          const color = new THREE.Color()
          for (const [idx, rect] of Object.entries(r_atlas.rects)) {
            // Shader Atlas UV
            let vis = -1,
              x,
              y
            mpos.precept.inPolar(rect)
            let force = grade.inPolar === 4
            let inPolar = rect.inPolar >= grade.inPolar

            // Instance Matrix
            const dummy = mpos.add.box(rect, { frame: r_frame })
            // dummy false if css on frame was unchanged
            if (dummy) {
              instanced.setMatrixAt(count, dummy.matrix)

              if (dataIdx === undefined || rect.ux.u) {
                oldMap = true
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

              if (rect.atlas !== undefined || rect.mat === 'self') {
                // mat: self, child, poster, ~native...
                if (rect.inPolar >= grade.inPolar) {
                  // visible
                  x = rect.x || grade.key.x
                  y = 1 - rect.y || grade.key.y
                  // raycast filter
                  if (rect.atlas !== undefined) {
                    grade.ray[count] = Number(idx)
                  }
                } else if (grade.inPolar === 4) {
                  // have dummy, so it changed outside of visibility(?)
                  // probably from scroll difference
                  // either
                  x = grade.key.x
                  y = grade.key.y

                  //MEMO: maybe not inpolar 4, but draw in 1 of 2 places
                  // the rectangles that got lost during scroll
                  // with texture but no xy
                  // and cleanup
                }
              }

              uvOffset.setXY(count++, x || vis, y || vis)
            } else {
              // maybe a fast frame
              //uvOffset.setXY(count++, x || vis, y || vis)
            }
            //count++
          }

          // draw updates
          oldMap && (instanced.instanceColor.needsUpdate = true)

          ctxC.drawImage(osc, 0, 0)
          ctxO.clearRect(0, 0, osc.width, osc.height)
          mpos.ux.render()

          if (!paint) {
            // frame done
            grade.wait = false
            resolve(grade)
            reject(grade)
          }
        }
      })

      promise.catch((error) => console.log(error))
      promise.then(function (grade) {
        //console.log('update', grade.minEls)

        return promise
      })
    }
  },
  add: {
    dom: async function (selector, opts = {}) {
      const vars = mpos.var
      // options
      selector = selector || vars.opt.selector || 'body'
      const depth = opts.depth || vars.opt.depth || 8
      const parse =
        opts.parse ||
        function (node) {
          console.log(node.nodeName, node.textContent)
          if (node.textContent.indexOf('//_THREE') === 0) {
            try {
              eval(node.textContent)
            } catch (error) {
              console.log(error)
            }
          }
        }

      // get DOM node or offscreen
      const sel = document.querySelector(selector)
      const precept = mpos.precept
      if (sel === null || vars.grade?.wait === 1) {
        return
      } else if (selector === 'address') {
        const obj = document.querySelector(selector + ' object')
        await mpos.add.src(obj, vars.opt.address, 'data')
      }

      // OLD group
      mpos.add.old(selector)
      // NEW group
      const group = new THREE.Group()
      group.name = selector

      // structure
      const grade = {
        el: sel,
        wait: 1,
        group: group,
        canvas: precept.canvas || document.createElement('canvas'),
        index: precept.index++,
        atlas: 0, // poster count, whereas r_.atlas includes self,child for instanceMesh
        minEls: 0, // inPolar count, which Observers increment
        maxEls: 0,
        minRes: 256,
        // list, grade and sort
        txt: [],
        rects: {},
        inPolar: vars.opt.inPolar,
        r_: {
          queue: [],
          atlas: { count: 0, rects: {} },
          other: { count: 0, rects: {} }
        },
        ray: {}
        //scroll: { x: window.scrollX, y: -window.scrollY }
      }
      vars.grade = grade

      // FLAT-GRADE: filter, grade, sanitize
      const ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
      const sibling = (parent) => {
        return parent.childElementCount >= 1 && parent.matches([precept.allow])
      }
      let node = ni.nextNode()
      while (node) {
        if (node.nodeName === '#comment') {
          // #comment... (or CDATA, xml, php)
          parse(node)
        } else {
          const rect = { el: node, inPolar: null }

          if (precept.inPolar(rect)) {
            // not empty
            if (node.nodeName === '#text') {
              if (precept.inPolar(rect, grade.rects) && sibling(node.parentNode)) {
                // sanitize #text orphan (list or semantic) with parent visible
                const wrap = document.createElement('span')
                wrap.classList.add('mp-poster')
                node.parentNode.insertBefore(wrap, node)
                wrap.appendChild(node)

                rect.el = wrap
                precept.inPolar(rect)
                grade.txt.push(node)
              }
            }

            if (rect.inPolar >= 2) {
              // static list
              const idx = grade.maxEls
              rect.el.setAttribute('data-idx', idx)
              grade.rects[idx] = rect
              grade.maxEls++
            }
          }
        }

        node = ni.nextNode()
      }

      // Atlas Units: relative device profile
      grade.minRes = Math.pow(2, Math.ceil(Math.max(vars.fov.w, vars.fov.h) / vars.fov.max)) * 128
      grade.cells = Math.ceil(Math.sqrt(grade.maxEls / 2)) + 1
      grade.maxRes = Math.min(grade.cells * grade.minRes, 16_384)
      grade.canvas.width = grade.canvas.height = grade.maxRes
      //

      // clear atlas
      //const ctx = grade.canvas.getContext('2d')
      //ctx.clearRect(0, 0, grade.canvas.width, grade.canvas.height)

      function setRect(rect, z, mat, unset) {
        if (rect) {
          rect.mat = mat
          rect.z = z
          // update ux elevated
          const uxin = rect.mat === 'native' && rect.el.tagName !== 'A' ? 1 : 0
          rect.ux = { i: uxin, o: 0, u: false }

          // note: portions of this are duplicated in update (r_, priority)
          if (rect.inPolar >= grade.inPolar) {
            grade.minEls++
            if (rect.mat === 'poster' || rect.mat === 'native') {
              // instanced atlas
              rect.atlas = grade.atlas++
            }
          } else {
            // off-screen elements
            mpos.ux.observer?.observe(rect.el)
          }

          // unset inherits transform from class
          unset = unset || rect.el.matches(precept.unset)
          if (unset) {
            rect.unset = true
            rect.ux.i = 1
          }

          // if rect mat.native matches cors, it is not added to atlas (with mat.poster)
          rect.r_ = rect.mat === 'loader' || rect.mat === 'wire' || rect.el.matches([precept.cors, precept.native3d]) ? 'other' : 'atlas'
        }
        return unset
      }
      function setMat(node, mat, manual, layer) {
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
              const abort = grade.atlas >= grade.minRes
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
                    // set box type
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
        let rect = grade.rects[idx]
        // begin two lists: atlas (instanced) || other (mesh)
        if (rect.mat && rect.inPolar >= grade.inPolar) {
          //type: other, atlas
          const type = rect.r_
          const r_ = grade.r_[type]
          r_.count++
          r_.rects[idx] = rect
        } else if (!rect.mat) {
          // free memory
          mpos.ux.observer?.unobserve(rect.el)
          rect.el = rect.bound = null
          delete grade.rects[idx]
          document.querySelector('[data-idx="' + idx + '"]').removeAttribute('data-idx')
        }
      })
      grade.key = { x: 1 - 1 / grade.cells, y: 0.0001 }

      // Instanced Mesh, shader atlas
      const shader = mpos.add.shader(grade.canvas, grade.cells)
      const instanced = new THREE.InstancedMesh(
        vars.geo.clone(),
        [vars.mat, vars.mat, vars.mat, vars.mat, shader, vars.mat_line],
        grade.maxEls
      )

      instanced.layers.set(2)
      instanced.userData.shader = shader
      instanced.userData.el = grade.sel
      instanced.name = [grade.index, selector.tagName].join('_')
      grade.instanced = instanced

      // Atlas UV Buffer
      const uvOffset = new THREE.InstancedBufferAttribute(new Float32Array(grade.maxEls * 2).fill(-1), 2)
      uvOffset.setUsage(THREE.DynamicDrawUsage)
      instanced.geometry.setAttribute('uvOffset', uvOffset)

      // OUTPUT
      group.add(instanced)
      vars.scene && vars.scene.add(group)

      grade.wait = false
      mpos.precept.update(grade)
      return grade
    },
    box: function (rect, opts = {}) {
      if (rect.frame && rect.ux.u === false) {
        return false
      }

      const vars = mpos.var

      // css: accumulate transforms
      mpos.add.css(rect, opts.frame)

      // css: unset for box scale
      let unset = mpos.add.css(rect, true)
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
        // mesh singleton
        const mat = vars.mat.clone()
        mat.color = new THREE.Color('cyan')
        const mesh = new THREE.Mesh(vars.geo, mat)
        mesh.userData.el = rect.el
        mesh.animate = true
        object = mesh
      } else {
        // Instanced Mesh
        object = new THREE.Object3D()
      }

      function transform(obj) {
        // TRANSFORMS
        // scale
        const w = unset.width
        const h = unset.height
        const d = vars.fov.z
        // position
        let x = bound.width / 2
        let y = -bound.height / 2
        // scroll{0,0} is viewport, not document
        const scroll = opts.scroll || { x: 0, y: 0 }
        if (!scroll.fix) {
          x += scroll.x + bound.left
          y += scroll.y - bound.top
        }

        let z = (rect.z || 0) * d
        let zIndex = Number(rect.css?.style?.zIndex || 0)

        const sign = zIndex >= 0 ? 1 : -1
        zIndex = 1 - 1 / (Math.abs(zIndex) || 1)
        zIndex *= sign
        z += zIndex * (vars.opt.depth * vars.fov.z)

        // separation for portal
        const stencil = obj.isCSS3DObject || rect.mat === 'loader'
        const extrude = stencil ? vars.fov.z / 2 : 0
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
          mpos.add.fit(dummy, obj)
        } else {
          // generic dummy, i.e. atlas
          obj.position.set(x, y, z)
          obj.scale.set(w * rect.css.scale, h * rect.css.scale, d)
          obj.rotation.z = -rect.css.radian
        }

        if (vars.opt.arc) {
          // arc
          const damp = vars.opt.arc
          const mid = vars.fov.w / 2
          const rad = (mid - x) / mid
          const pos = mid * Math.abs(rad)
          // bulge from view center
          obj.rotation.y = rad * damp * 2
          obj.position.setZ(z + pos * damp)
        }

        obj.updateMatrix()
      }

      // ?? remove func
      // unless skip of transform > addGroup > return
      //
      transform(object)

      let res = object
      if (opts.add) {
        rect.add = false

        // other custom process
        if (rect.mat === 'loader') {
          // async
          res = mpos.add.loader(rect.el, object)
          res.userData.el = rect.el
        } else {
          // general (native, wire)
          vars.grade.group.add(object)
        }

        const name = [rect.z, rect.mat, rect.el.nodeName].join('_')
        res.name = name
        rect.obj = res
      }

      rect.ux.u = false
      return res
    },
    css: function (rect, progress) {
      const vars = mpos.var
      // css style transforms
      let el = rect.el
      const frame = typeof progress === 'number'
      // css style: transform, transformOrigin, backgroundColor, zIndex, position
      const css = rect.css || { style: window.getComputedStyle(el) }

      let uxout = {}
      if (progress === undefined || frame) {
        // ux frame change pre/post calculable? (imperative)
        rect.ux.u = false

        uxout = { bound: rect.bound, scale: css.scale, degree: css.degree }

        if (!rect.css || rect.frame < progress) {
          // ux priority may escalate (declarative)
          const priority = css.pseudo || vars.unset.diffs('tween', { style: css.style })
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
      const rects = vars.grade.rects
      function accumulate(progress) {
        let el = rect.el
        let els = []
        let max = 8 // deep tree?

        while (el && el !== document.body && max--) {
          const r_ = rects[el.getAttribute('data-idx')]

          if (r_?.ux.o) {
            if (progress === undefined || frame) {
              if (!rect.css || rect.frame < progress) {
                // accumulate ancestor matrix
                const style = r_.css?.style || css.style //|| window.getComputedStyle(el)

                if (style && vars.unset.diffs('matrix', { style: style })) {
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
          els.unshift(el)
          el = el.parentNode
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
    shader: function (canvas, texStep) {
      //discourse.threejs.org/t/13221/17
      const texAtlas = new THREE.CanvasTexture(canvas)
      texAtlas.minFilter = THREE.NearestFilter
      // update
      const m = mpos.var.mat_shader.clone()
      m.uniforms.map.value = texAtlas
      m.uniforms.atlasSize.value = texStep
      // output
      m.userData.t = texAtlas
      return m
    },
    src: function (el, url, attr) {
      return new Promise((resolve, reject) => {
        el.onload = () => resolve(el)
        el.onerror = () => reject(el)
        el.setAttribute(attr, url)
      })
    },
    old: function (selector) {
      // dispose of scene and release listeners
      const groups = mpos.var.scene?.getObjectsByProperty('type', 'Group')

      if (groups && groups.length) {
        for (let g = groups.length - 1; g >= 0; g--) {
          const group = groups[g].children || []
          for (let o = group.length - 1; o >= 0; o--) {
            const obj = group[o]
            if (obj.type === 'Mesh') {
              if (obj.animate && obj.animate.gif) {
                // SuperGif
                obj.animate.gif.pause()
                obj.animate.gif = null
              }

              obj.geometry.dispose()
              const material = obj.material
              for (let m = material.length - 1; m >= 0; m--) {
                const mat = material[m]
                if (mat) {
                  mat.canvas && (mat.canvas = null)
                  mat.map && mat.map.dispose()
                  // shader
                  mat.userData.s && mat.userData.s.uniforms.texAtlas.value.dispose()
                  mat.userData.t && mat.userData.t.dispose()
                  mat.dispose()
                }
              }
              !material.length && material.dispose()
            }
            obj.removeFromParent()
          }
          groups[g].removeFromParent()
        }
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
    },
    fit: function (dummy, group, opts = {}) {
      // scale group to element
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

        mpos.ux.render()
      }
    },
    pyr: function (width, height, thumb = 16) {
      let pyr = { cols: width, rows: height }
      if (Math.min(pyr.cols, pyr.rows) > thumb) {
        // limit sample dimension
        const orient = pyr.cols > pyr.rows ? 'cols' : 'rows'
        const scale = thumb < pyr[orient] ? thumb / pyr[orient] : 1
        pyr = { cols: Math.ceil(pyr.cols * scale), rows: Math.ceil(pyr.rows * scale) }
      }
      return [pyr.cols, pyr.rows]
    },
    loader: function (source, dummy) {
      const vars = mpos.var

      // source is location or contains one
      let uri = typeof source === 'string' ? source : source.data || source.src || source.currentSrc || source.href
      // source is image
      let mime = uri && uri.match(/\.(json|svg|gif|jpg|jpeg|png|webp|webm|mp4|ogv)(\?|$)/gi)
      mime = mime ? mime[0].toUpperCase() : 'File'
      let loader = !!((mime === 'File' && uri) || mime.match(/(JSON|SVG|GIF)/g))
      //console.log(loader, mime, uri)

      const material = new THREE.MeshBasicMaterial({
        side: THREE.FrontSide,
        depthWrite: false
      })

      //console.log(mime, uri, source, dummy, dummy.matrix)
      let object
      if (mime.match(/(WEBM|MP4|OGV)/g)) {
        // HANDLER: such as VideoTexture, AudioLoader...
        const texture = new THREE.VideoTexture(source)
        material.map = texture
        const mesh = new THREE.Mesh(vars.geo, material)

        mesh.matrix.copy(dummy.matrix)
        mesh.name = uri
        // unique overrides
        vars.grade.group.add(mesh)
        object = mesh
      } else {
        let group = new THREE.Group()
        if (!loader && ((mime !== 'File' && uri) || (mime === 'File' && !uri))) {
          // ELEMENT: specific or generic
          let gc
          if (uri && !dummy) {
            // dynamic resource needs element
            gc = source = document.createElement('img')
            source.src = uri
            let unset = document.querySelector('#mp address.mp-offscreen')
            unset.appendChild(source)
            dummy = mpos.add.box({ el: source })
          }

          const [width, height] = mpos.add.pyr(source.naturalWidth, source.naturalHeight, 128)

          toCanvas(source, { style: vars.unset.style, width: width, height: height, pixelRatio: 1 })
            .then(function (canvas) {
              mpos.add.opencv(canvas, group, dummy)
              // cleanup
              gc && gc.parentElement.removeChild(gc)
              source = canvas = null
            })
            .catch(function (error) {
              console.log('src problem', error)
            })
        } else {
          // LOADER: specific or generic

          loader = mime.match('.JSON')
            ? new THREE.ObjectLoader()
            : mime.match('.SVG')
            ? new SVGLoader()
            : mime.match('.GIF')
            ? // SuperGif complains about no parent to insert, but its not wanted in the DOM
              new SuperGif({ gif: source.cloneNode(), max_width: 128 })
            : new THREE.FileLoader()

          function callback(data) {
            console.log('load', mime, data)
            if (mime === 'File') {
              // file is not image (XML?)
            } else if (mime.match('.SVG')) {
              const paths = data.paths || []

              for (let i = 0; i < paths.length; i++) {
                const path = paths[i]
                let mat = material.clone()
                mat.color = path.color

                const shapes = SVGLoader.createShapes(path)
                for (let j = 0; j < shapes.length; j++) {
                  const shape = shapes[j]
                  const geometry = new THREE.ShapeGeometry(shape)
                  const mesh = new THREE.Mesh(geometry, mat)

                  group.add(mesh)
                }
              }

              group.name = mime
              mpos.add.fit(dummy, group, { add: true })
            } else if (mime.match('.GIF')) {
              const canvas = loader.get_canvas()
              // note: omggif, TextureLoader, GifLoader, ComposedTexture
              material.map = new THREE.CanvasTexture(canvas)
              material.transparent = true

              const mesh = new THREE.Mesh(vars.geo, material)
              mesh.matrix.copy(dummy.matrix)
              mesh.name = uri

              // unique overrides
              vars.grade.group.add(mesh)
              const idx = source.getAttribute('data-idx')
              const rect = vars.grade.rects[idx]
              rect.obj = mesh

              console.log('Pri_Force', rect)
              //rect.gif = loader
              mesh.animate = { gif: loader }

              //NOTE: finding a route for special type
              // after loaded, boost priority, re-enqueue, force update
              rect.ux.i = 1
              vars.grade.r_.queue.push(idx)
              mpos.precept.update(mpos.var.grade, 'trim')

              // todo: manual frame index from delta
            } else if (mime.match('.JSON')) {
              // note: may be small, upside-down, just a light...?
              group.add(data)
              mpos.add.fit(dummy, group, { add: true })
            }
          }

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
            const clusters = 8
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
            const [width, height] = mpos.add.pyr(pyr.cols, pyr.rows, clusters * 2)
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
            cv.kmeans(sample, clusters, labels, criteria, 1, cv.KMEANS_PP_CENTERS, centers)
            release(sample)

            // kmeans colors
            for (let i = 0; i < labels.size().height; i++) {
              const idx = labels.intAt(i, 0)
              if (kmeans[idx] === undefined) {
                kmeans[idx] = {
                  count: 0,
                  rgba: {
                    r: Math.round(centers.floatAt(idx, 0)),
                    g: Math.round(centers.floatAt(idx, 1)),
                    b: Math.round(centers.floatAt(idx, 2)),
                    a: Math.round(centers.floatAt(idx, 3))
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
                    //band = (band + target) / 2
                    bands[channel] = band
                  }
                })

                return [bands.r, bands.g, bands.b, target]
              }

              const mask = new cv.Mat.zeros(size, 0)
              const range = 32
              lo.setTo(level(rgba, -range, 16))
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
                const min = area > size.width * size.height * 0.00001
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
              console.log('cv', Object.keys(kmeans).length, group.userData.el.getAttribute('data-idx'))
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
                    // out: element > reduced canvas > pyr sample (kmeans/inrange) > approxPoly
                    let geometry = new THREE.ShapeGeometry(poly, 1)
                    geometry = mergeVertices(geometry, 0.5)
                    mergedGeoms.push(geometry)
                  })
                }

                if (mergedGeoms.length) {
                  // label color
                  const rgba = label.rgba
                  const color = new THREE.Color('rgb(' + [rgba.r, rgba.g, rgba.b].join(',') + ')')
                  const mat = mpos.var.mat_shape.clone()
                  mat.color = color
                  if (rgba.a < 255) {
                    mat.opacity = rgba.a / 255
                    mat.transparent = true
                  }
                  // label contours
                  const mergedBoxes = mergeGeometries(mergedGeoms)
                  const mesh = new THREE.Mesh(mergedBoxes, mat)
                  group.add(mesh)
                }
              })
              kmeans = null

              group.name = 'OPENCV'

              mpos.add.fit(dummy, group, { add: true })
            } catch (error) {
              console.warn(error)
            }
          }
        ]
      }

      //huningxin.github.io/opencv.js/samples/index.html
      // run Module _main, with vars monkeyed into _stdin
      // i.e. _stdin: { ivy: college, peep: blackbox }
      opencv(Module)
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
