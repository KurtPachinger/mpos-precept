import './mpos.scss'
import { toPng } from 'html-to-image'
//import * as THREE from 'three'
import {
  BoxGeometry,
  MeshBasicMaterial,
  LineBasicMaterial,
  RawShaderMaterial,
  FrontSide,
  Raycaster,
  Vector2,
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AxesHelper,
  Color,
  InstancedBufferAttribute,
  Group,
  InstancedMesh,
  StaticDrawUsage,
  Object3D,
  CanvasTexture,
  NearestFilter,
  Box3,
  FileLoader,
  ShapeGeometry,
  Mesh,
  Shape,
  Path
} from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

const mpos = {
  var: {
    opt: {
      selector: 'body',
      address: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 16,
      inPolar: 3,
      arc: 0,
      frame: 0,
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
    unset: { display: 'block', margin: 0, transform: 'initial', left: 'initial', right: 'initial' },
    geo: new BoxGeometry(1, 1, 1),
    mat: new MeshBasicMaterial({
      transparent: true,
      wireframe: true,
      color: 'cyan',
      side: FrontSide
    }),
    mat_line: new LineBasicMaterial({
      transparent: true,
      opacity: 0.5,
      color: 'cyan',
      depthWrite: false,
      side: FrontSide
    }),
    mat_shader: new RawShaderMaterial({
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
    mat_shape: new MeshBasicMaterial({ transparent: true, depthWrite: false }),
    raycaster: new Raycaster(),
    pointer: new Vector2()
  },
  init: function (opts = {}) {
    const vars = this.var
    vars.proxy = !!(opts.scene && opts.camera && opts.renderer)

    // proxy mode or standalone
    vars.scene = opts.scene || new Scene()
    vars.renderer = opts.renderer || new WebGLRenderer()
    const domElement = vars.renderer.domElement
    const container = vars.proxy ? domElement.parentElement : document.body

    vars.fov.w = container.offsetWidth
    vars.fov.h = container.offsetHeight
    vars.camera = opts.camera || new PerspectiveCamera(45, vars.fov.w / vars.fov.h, 0.01, vars.fov.max * 16)

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
      const axes = new AxesHelper(vars.fov.max)
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
        selector: [['body', 'main', '#native', '#text', '#loader', '#media', 'address']],
        depth: [0, 32, 1],
        inPolar: [1, 4, 1],
        frame: [0, 500, 50],
        arc: [0, 1, 0.25]
      }
      const param = params[key] || []
      const controller = gui.add(vars.opt, key, ...param).listen()

      if (key === 'frame') {
        controller.onFinishChange(function (v) {
          mpos.ux.reflow({ type: key, value: v })
        })
      }
    })
  },
  ux: {
    timers: {
      reflow: [],
      frame: [],
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

        if (idx === 'frame') {
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
        const [timer, timeout] = e.type === 'frame' ? ['frame', e.value] : ['reflow', 250]

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

      //requestAnimationFrame(vars.animate)
      const time = new Date().getTime() / 100
      vars.scene &&
        vars.scene.traverseVisible(function (obj) {
          // step a frame tick
          const animate = obj.animations === true
          if (animate) {
            obj.rotation.x = Math.sin(time) / 10
            obj.rotation.y = Math.cos(time) / 10
          }
        })
      vars.renderer && vars.renderer.render(vars.scene, vars.camera)
      vars.rendererCSS && vars.rendererCSS.render(vars.scene, vars.camera)
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
            vars.events = { uv: hit.uv, el: rect.el, mat: rect.mat, position: rect.css.style.position, bound: rect.bound }
            //
            const caret = vars.caret.style
            // visibility
            const vis = rect.inPolar >= vars.opt.inPolar
            const color = vis ? 'rgba(0,255,0,0.66)' : 'rgba(255,0,0,0.66)'
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
    manual: `.mp-loader,.mp-native,.mp-poster`.split(','),
    unset: `.mp-offscreen`.split(','),
    allow: `.mp-allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
    block: `.mp-block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template,iframe:not([src])`.split(
      ','
    ),
    native: `.mp-native,a,iframe,frame,object,embed,svg,table,details,form,label,button,input,select,textarea,output,dialog,video,audio[controls]`.split(
      ','
    ),
    cors: `iframe,object,.yt`.split(','),
    poster: `.mp-poster,canvas,picture,img,h1,h2,h3,h4,h5,h6,p,ul,ol,li,th,td,summary,caption,dt,dd,code,span,root`.split(','),
    native3d: `model-viewer,a-scene,babylon,three-d-viewer,#stl_cont,#root,.sketchfab-embed-wrapper,StandardReality`.split(','),
    inPolar: function (rect, control) {
      const node = rect.el

      let vis = node && (node.tagName || node.textContent.trim()) ? 1 : false
      if (typeof control === 'object') {
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
          //const style = window.getComputedStyle(node)
          rect.bound = node.getBoundingClientRect()
          if (node.checkVisibility()) {
            // 3: tag not hidden
            vis++

            const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
            const scroll = !(rect.bound.bottom < 0 || rect.bound.top - viewHeight >= 0)
            if (scroll) {
              // 4: tag in viewport
              vis++
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
      if ((dataIdx && !r_queue.length) || grade.wait) {
        // redundant invocation... frame?
        return
      }
      grade.wait = true
      let quality = 1

      const r_atlas = grade.r_.atlas
      const r_other = grade.r_.other
      let r_frame = 0

      function pseudo(rect) {
        let pseudo = false
        if (rect.css) {
          pseudo = rect.css.pseudo
          rect.css.pseudo = rect.el.matches(':hover,:focus')
          pseudo = pseudo || rect.css.pseudo
        }
        return pseudo
      }

      grade.inPolar = vars.opt.inPolar
      if (dataIdx) {
        // SOFT-update
        let reflow = false
        for (let i = r_queue.length - 1; i >= 0; i--) {
          const idx = r_queue[i]
          if (isFinite(idx)) {
            // Observer
            const rect = grade.rects[idx]
            //rect.inPolar = mpos.precept.inPolar(rect)
            //const type = rect.mat === 'native' || rect.mat === 'loader' || rect.mat === 'wire' ? 'other' : 'atlas'
            const type = rect.r_

            const r_ = grade.r_[type]
            if (!r_.rects[idx]) {
              grade.minEls++
              if (rect.mat === 'poster') {
                // shader
                rect.atlas = grade.atlas++
              } else if (type === 'other') {
                // CSS3D or Loader
                rect.add = true
              }

              r_.count++
              r_.rects[idx] = rect
            } else {
              //r_.rects[idx].inPolar = rect.inPolar
            }
          } else if (idx === 'frame' || idx === 'move' || idx === 'trim') {
            reflow = true
            if (idx === 'frame') {
              const timers = mpos.ux.timers
              r_frame = timers.frame[timers.frame.length - 1]
              // quality limits pixelRatio of html-to-image
              const now = performance.now()
              const elapsed = now - timers.last
              timers.last = now

              quality = Math.max(mpos.var.opt.frame / elapsed, 0.5).toFixed(2)
            }
          }
        }

        if (reflow) {
          // update visibility, from Observer or animation frame
          function vis(rects, reQueue) {
            Object.keys(rects).forEach(function (idx) {
              const rect = rects[idx]
              mpos.precept.inPolar(rect)

              //const uxout = mpos.add.css(rect, r_frame)
              if (reQueue && rect.inPolar >= 4 && (rect.priority || pseudo(rect))) {
                // frame && active view && significant
                if (r_queue.indexOf(idx) === -1) {
                  r_queue.push(idx)
                  // children
                  //rect.el.querySelectorAll('[data-idx]').forEach(function (el) {
                  //  r_queue.push(el.getAttribute('data-idx'))
                  //})
                }
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

      //console.log('queue', grade.r_.queue.length, dataIdx, r_frame)

      const promise = new Promise((resolve, reject) => {
        // style needs no transform, no margin, maybe block... dont reset live animations, etc...
        //const align = { display: 'block', margin: 0, transform: 'initial', left: 'initial', right: 'initial' }
        function atlas(grade, opts = {}) {
          // element mat conversion
          if (opts.array === undefined) {
            if (dataIdx) {
              // SOFT-update
              opts.array = r_queue
            } else {
              // HARD-update
              opts.array = Object.keys(r_atlas.rects)
            }
            //console.log('atlas', r_frame, opts.array)
            opts.idx = opts.array.length
            opts.ctx = opts.ctx || grade.canvas.getContext('2d')
            opts.step = opts.step || grade.maxRes / grade.cells
            // paint breakpoints, unless frame: [0%, 50%]
            opts.paint = opts.idx >= 32 && r_frame === 0 ? [opts.idx, Math.floor(opts.idx / 2)] : []
          }

          function next() {
            //setTimeout(() => {
            if (dataIdx) {
              // decrement queue
              opts.array = opts.array.splice(opts.array.length - opts.idx, opts.array.length)
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
                // atlas ends with blank key
                opts.ctx.fillStyle = 'rgba(0,255,255,0.125)'
                opts.ctx.fillRect(grade.maxRes - opts.step, grade.maxRes - opts.step, opts.step, opts.step)
              }
              // complete
              transforms(grade)
            }
            //}, 0)
          }

          // queue indexes from end, but in reverse
          const rect = r_atlas.rects[opts.array[opts.array.length - opts.idx]]
          if (rect && rect.atlas !== undefined) {
            // bug: style display-inline is not honored by style override
            const bbox = !rect.el.clientWidth && !rect.el.clientHeight && rect.el.matches('a, img, object, span, xml, :is(:empty)')
            bbox && (rect.el.style.display = 'inline-block')
            // toSvg crisper, toPng smaller
            //rect.el.classList.add('mp-align')
            const pixelRatio = rect.ux.o ? quality : 0.8

            toPng(rect.el, { style: vars.unset, pixelRatio: pixelRatio, preferredFontFormat: 'woff' })
              .then(function (dataUrl) {
                //rect.el.classList.remove('mp-align')
                if (dataUrl === 'data:,') {
                  //const error = ['idx', rect.el.getAttribute('data-idx'), 'bad size'].join(' ')
                  //console.log('no box')
                  next()
                } else {
                  bbox && (rect.el.style.display = 'initial')
                  let img = new Image()
                  img.onload = function () {
                    const step = opts.step
                    // canvas xy: from block top (FIFO)
                    const x = (rect.atlas % grade.cells) * step
                    const y = (Math.floor(rect.atlas / grade.cells) % grade.cells) * step
                    r_frame && opts.ctx.clearRect(x, y, step, step)
                    opts.ctx.drawImage(img, x, y, step, step)
                    // shader xy: from block bottom
                    // avoid 0 edge, so add 0.0001
                    rect.x = (0.0001 + x) / grade.maxRes
                    rect.y = (0.0001 + y + step) / grade.maxRes
                    // recursive
                    next()
                    img = null
                  }

                  img.src = dataUrl
                  dataUrl = null
                }
              })
              .catch(function (error) {
                // src problem...
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
          grade.scroll = { x: window.scrollX, y: window.scrollY }

          // Mesh: CSS3D, loader, root...
          Object.values(r_other.rects).forEach(function (rect) {
            const add = !rect.obj && (dataIdx === undefined || rect.add)
            const scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
            // add (async) or transform
            mpos.add.box(rect, { add: add, scroll: scroll, frame: r_frame })

            if (rect.obj) {
              // filter visibility
              let visible = true
              if (!rect.fix) {
                visible = rect.inPolar >= grade.inPolar
              }
              rect.obj.visible = visible
            }
          })

          // Instanced Mesh
          const instanced = grade.instanced
          instanced.count = r_atlas.count
          const uvOffset = new Float32Array(instanced.count * 2).fill(-1)

          grade.ray = {}
          let count = 0
          for (const [idx, rect] of Object.entries(r_atlas.rects)) {
            // Instance Matrix
            const dummy = mpos.add.box(rect, { frame: r_frame })
            instanced.setMatrixAt(count, dummy.matrix)

            // Instance Color
            const color = new Color()
            let bg = rect.css.style.backgroundColor
            let rgba = bg.replace(/[(rgba )]/g, '').split(',')
            const alpha = rgba[3]
            if (alpha === '0') {
              bg = 'cyan'
            } else if (alpha > 0.0 || alpha === undefined) {
              bg = 'rgb(' + rgba.slice(0, 3).join() + ')'
            }
            instanced.setColorAt(count, color.setStyle(bg))

            // Shader Atlas UV
            const stepSize = count * 2
            if (rect.inPolar >= grade.inPolar) {
              // mat: self, child, poster...
              if (rect.atlas !== undefined || rect.mat === 'self') {
                uvOffset[stepSize] = rect.x || grade.key.x
                uvOffset[stepSize + 1] = 1 - rect.y || grade.key.y
              }
              if (rect.atlas !== undefined) {
                // raycast filter
                grade.ray[count] = Number(idx)
              }
            }

            count++
          }

          instanced.instanceMatrix.needsUpdate = true
          instanced.computeBoundingSphere()
          instanced.instanceColor && (instanced.instanceColor.needsUpdate = true)

          // update shader
          instanced.geometry.setAttribute('uvOffset', new InstancedBufferAttribute(uvOffset, 2))
          instanced.userData.shader.userData.t.needsUpdate = true

          //
          mpos.ux.render()

          if (!paint) {
            // UI Atlas
            const atlas = document.querySelector('#atlas canvas')
            const name = ['atlas', grade.index, grade.atlas, grade.maxRes].join('_')
            //const link = atlas.querySelector('a')
            atlas && (atlas.title = name)
            //link.href = grade.canvas.toDataURL('image/jpeg', 0.5)
            //link.appendChild(grade.canvas)
            //document.getElementById('atlas').appendChild(link)

            resolve(grade)
            reject(grade)
          } else {
          }
        }
      })

      promise.catch((error) => console.log(error))
      promise.then(function (grade) {
        //console.log('update', grade.minEls)
        grade.wait = false
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
        }

      // get DOM node or offscreen
      const sel = document.querySelector(selector)
      const precept = mpos.precept
      if (sel === null || vars.grade?.wait) {
        return
      } else if (selector === 'address') {
        const obj = document.querySelector(selector + ' object')
        await mpos.add.src(obj, vars.opt.address, 'data')
      }

      // OLD group
      mpos.add.old(selector)
      // NEW group
      const group = new Group()
      group.name = selector

      // structure

      const grade = {
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
        scroll: { x: window.scrollX, y: -window.scrollY }
      }

      // FLAT-GRADE: filter, grade, sanitize
      const ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
      let node = ni.nextNode()
      while (node) {
        if (node.nodeName === '#comment') {
          // #comment... (or CDATA, xml, php)
          parse(node)
        } else {
          const rect = { el: node, inPolar: null }

          if (precept.inPolar(rect)) {
            // not empty
            if (rect.inPolar === 1 && node.nodeName === '#text') {
              const orphan = node.parentNode.childElementCount >= 1 && node.parentNode.matches([precept.allow])
              if (orphan && precept.inPolar(rect, grade.rects)) {
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
      // clear atlas
      const ctx = grade.canvas.getContext('2d')
      ctx.clearRect(0, 0, grade.canvas.width, grade.canvas.height)

      function setRect(rect, z, mat, unset) {
        if (rect) {
          rect.mat = mat
          rect.z = z
          rect.ux = { i: 0, o: 0 }

          if (rect.inPolar >= grade.inPolar) {
            grade.minEls++

            if (rect.mat === 'poster' || rect.mat === 'native') {
              // shader
              rect.atlas = grade.atlas++

              if (rect.mat === 'native' && rect.atlas && rect.el.tagName !== 'A') {
                // update ux elevated
                rect.priority = true
              }
            }
          } else {
            // off-screen elements
            mpos.ux.observer?.observe(rect.el)
          }

          if (rect.mat === 'native' && rect.atlas && rect.el.tagName !== 'A') {
            // update ux elevated
            rect.ux.i = 1
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

          // inject OpenCV WASM
          //huningxin.github.io/opencv.js/samples/index.html
          if (mat === 'loader' && mpos.var.cv === undefined) {
            mpos.var.cv = false
            const script = document.createElement('script')
            script.type = 'text/javascript'
            script.async = true
            script.onload = function () {
              // remote script loaded
              console.log('OpenCV.js')
              mpos.var.cv = true
            }
            script.src = './opencv.js' // + Date.now()
            document.getElementsByTagName('head')[0].appendChild(script)
          }
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
                    //
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
          //const type = rect.mat === 'native' || rect.mat === 'loader' || rect.mat === 'wire' ? 'other' : 'atlas'
          const type = rect.r_
          const r_ = grade.r_[type]
          r_.count++
          r_.rects[idx] = rect
        } else if (!rect.mat) {
          // free memory
          rect.el = rect.bound = null
          delete grade.rects[idx]
          document.querySelector('[data-idx="' + idx + '"]').removeAttribute('data-idx')
        }
      })
      grade.key = { x: 1 - 1 / grade.cells, y: 0.0001 }

      // Instanced Mesh, shader atlas
      const shader = mpos.add.shader(grade.canvas, grade.cells)
      const instanced = new InstancedMesh(vars.geo.clone(), [vars.mat, vars.mat, vars.mat, vars.mat, shader, vars.mat_line], grade.maxEls)
      instanced.instanceMatrix.setUsage(StaticDrawUsage)
      instanced.layers.set(2)
      instanced.userData.shader = shader
      instanced.userData.el = grade.sel
      instanced.name = [grade.index, selector.tagName].join('_')
      grade.instanced = instanced

      // OUTPUT
      group.add(instanced)
      vars.scene && vars.scene.add(group)

      vars.grade = grade

      mpos.precept.update(grade)
      return grade
    },
    box: function (rect, opts = {}) {
      const vars = mpos.var

      // css: accumulate transforms
      mpos.add.css(rect, opts.frame)
      rect.frame = opts.frame || rect.frame || 0
      // css: unset for box scale
      let unset = mpos.add.css(rect, true)
      let bound = rect.unset ? unset : rect.bound

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

        let z = rect.z * d
        let zIndex = Number(rect.css?.style?.zIndex || 0)
        const sign = zIndex >= 0 ? 1 : -1
        zIndex = 1 - 1 / (Math.abs(zIndex) || 1)
        zIndex *= sign
        z += zIndex * (vars.opt.depth * vars.fov.z)
        //

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
          const dummy = new Object3D()
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
      }

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
        mat.color = new Color('cyan')
        const mesh = new Mesh(vars.geo, mat)
        mesh.userData.el = rect.el
        mesh.animations = true
        object = mesh
      } else {
        // Instanced Mesh
        object = new Object3D()
      }

      transform(object)
      object.updateMatrix()

      let obj = object
      if (opts.add) {
        rect.add = false
        // other custom process
        if (rect.mat === 'loader') {
          // async
          obj = new Group()
          obj.userData.el = rect.el
          mpos.add.loader(rect, object, obj)
        } else {
          // general (native, wire)
          vars.grade.group.add(object)
        }
        const name = [rect.z, rect.mat, rect.el.nodeName].join('_')
        obj.name = name

        rect.obj = obj
      }

      return obj
    },
    css: function (rect, progress) {
      // css style transforms
      let el = rect.el
      const frame = typeof progress === 'number'
      // css style: transform, transformOrigin, backgroundColor, zIndex, position
      const css = rect.css || { style: window.getComputedStyle(el) }

      if (progress === undefined || frame) {
        // target element original style
        if (!rect.css || rect.frame < progress) {
          // ux priority may be escalated
          const priority = css.style.transform !== 'none' || css.style.animationName !== 'none' || css.style.transitionDuration !== '0s'
          rect.ux.o = priority ? rect.ux.i + 1 : rect.ux.i

          rect.ux.o && el.classList.add('mp-unset')
          rect.bound = el.getBoundingClientRect()
          rect.ux.o && el.classList.remove('mp-unset')

          // reset transforms
          css.scale = 1
          css.radian = 0
          css.degree = 0
          css.transform = 0
        }
      } else if (rect.unset) {
        // quirks of DOM
        //if (el.matches('details')) {
        //  el.open = progress
        //}
        //if (el.matches('.mp-offscreen')) {
        //  rect.z = css.style.zIndex
        //}
      }

      let unset
      const rects = mpos.var.grade.rects
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

                if (style && style.transform?.startsWith('matrix')) {
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
              // style override
              //if (r_.priority) {
              // sets transform:initial for real box dimensions
              el.classList.toggle('mp-unset', progress)
              //}
            }
          }
          els.unshift(el)
          el = el.parentNode
        }

        if (progress === true) {
          unset = rect.el.getBoundingClientRect()
          accumulate(!progress)
        } else {
          if (progress === undefined || frame) {
            rect.css = css
          }
        }
      }
      accumulate(progress)
      return unset || rect.ux.o
    },
    shader: function (canvas, texStep) {
      //discourse.threejs.org/t/13221/17
      const texAtlas = new CanvasTexture(canvas)
      texAtlas.minFilter = NearestFilter
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
      //console.log('fit', group.children.length, opts.add)

      if (group.children.length) {
        let s2 = group.userData.s2
        if (!s2) {
          const grade = mpos.var.grade
          grade.group.add(group)

          const aabb = new Box3()
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
    loader: function (rect, dummy, group) {
      const file = rect.el.data || rect.el.src || rect.el.href

      // instantiate a loader: File, Audio, Object...
      // todo: url query string paramaters
      let handler = file ? file.match(/\.(gif|jpg|jpeg|png|svg|webp)(\?|$)/i) : false
      handler = handler && dummy && group ? handler[0].toUpperCase() : 'File'
      console.log(handler)
      const loader = handler.match('.SVG') ? new SVGLoader() : new FileLoader()

      if (file && (handler.match('.SVG') || handler === 'File')) {
        loader.load(
          file,
          function (data) {
            //console.log('data', data)
            //res = data
            if (handler === 'File') {
              // set attribute
            } else if (handler.match('.SVG')) {
              const paths = data.paths || []

              for (let i = 0; i < paths.length; i++) {
                const path = paths[i]

                const material = new MeshBasicMaterial({
                  color: path.color,
                  side: FrontSide,
                  depthWrite: false
                })

                const shapes = SVGLoader.createShapes(path)

                for (let j = 0; j < shapes.length; j++) {
                  const shape = shapes[j]
                  const geometry = new ShapeGeometry(shape)
                  const mesh = new Mesh(geometry, material)
                  group.add(mesh)
                }
              }
              group.name = handler

              mpos.add.fit(dummy, group, { add: true })
            }
          },
          // called when loading is in progresses
          function (xhr) {
            console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
          },
          // called when loading has errors
          function (error) {
            console.log('error loading')
          }
        )
      } else {
        toPng(rect.el, { style: mpos.var.unset, pixelRatio: 1 })
          .then(function (dataUrl) {
            let img = new Image()
            img.onload = function () {
              // image process, or load script
              mpos.add.opencv(img, group, dummy)
              dataUrl = img = null
            }
            // todo: animated gif?
            img.src = dataUrl
          })
          .catch(function (error) {
            // src problem...
            console.log('src problem')
            //console.log(error)
          })
      }
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

            // KMEANS
            const pyr = src.clone()
            cv.resize(pyr, pyr, new cv.Size(2 * clusters, pyr.cols * ((2 * clusters) / pyr.cols)), 0, 0, cv.INTER_AREA)
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
            const criteria = new cv.TermCriteria(cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER, 16, 0.8)
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
            const lo = src.clone()
            const hi = src.clone()
            Object.keys(kmeans).forEach(function (key) {
              const label = kmeans[key]
              const rgba = label.rgba
              // skip transparent
              if (rgba.a === 0) {
                delete kmeans[key]
                return
              }

              // INRANGE
              const mask = new cv.Mat.zeros(src.rows, src.cols, 0)
              lo.setTo([rgba.r / 2, rgba.g / 2, rgba.b / 2, 1])
              hi.setTo([(rgba.r + 255) / 2, (rgba.g + 255) / 2, (rgba.b + 255) / 2, 255])
              cv.inRange(src, lo, hi, mask)

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
                cv.approxPolyDP(cnt, tmp, 0.125, true)
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
                const perc = area / (src.rows * src.cols)
                if (perc > 0.001) {
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
            // inrange
            release(lo)
            release(hi)

            release(src)
            img = null
            // release memory: Int32Array, Mat, pointer...
          } catch (error) {
            console.warn(error)
          }
        },
        postRun: [
          function (e) {
            try {
              console.log('cv', Object.keys(kmeans).length)
              // Shape from label contours
              Object.values(kmeans).forEach(function (label) {
                let mergedGeoms = []
                if (label.retr) {
                  Object.values(label.retr).forEach(function (retr) {
                    // hierarchy shape
                    const points = retr.shape
                    const poly = new Shape()
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
                      const path = new Path()
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
                    let geometry = new ShapeGeometry(poly)
                    geometry = mergeVertices(geometry)
                    mergedGeoms.push(geometry)
                  })
                }

                if (mergedGeoms.length) {
                  // label color
                  const rgba = label.rgba
                  const color = new Color('rgb(' + [rgba.r, rgba.g, rgba.b].join(',') + ')')
                  const mat = mpos.var.mat_shape.clone()
                  mat.color = color
                  mat.opacity = rgba.a / 255
                  // label contours
                  const mergedBoxes = mergeGeometries(mergedGeoms)
                  const mesh = new Mesh(mergedBoxes, mat)
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

      // run Module _main, with vars monkeyed into _stdin
      // i.e. _stdin: { ivy: college, peep: blackbox }
      requestIdleCallback(
        function () {
          if (mpos.var.cv === true) {
            opencv(Module)
          }
        },
        { time: 500 }
      )
    }
  }
}

mpos.gen = function (num = 6, selector = 'main') {
  const lipsum = [
    'Nunc at dolor lacus. ',
    'Lorem ipsum dolor sit amet. ',
    'Phasellus eu sapien tellus. ',
    'Consectetur adipiscing elit. ',
    'Integer nec vulputate lacus. ',
    'Donec auctor id leo eu varius. ',
    'Sed viverra quis nisl et vulputate. ',
    'Morbi eget eros non felis tempor sodales. ',
    'Praesent in elementum risus, a vehicula justo. ',
    'Vivamus eget magna quis nisi ultrices faucibus. ',
    'Phasellus massa mauris, rutrum ac semper posuere. ',
    'Nunc a nibh vitae eros fringilla lacinia id in sapien. '
  ]

  function fill(element, length) {
    length = Math.floor(length) + 1
    const el = document.createElement(element)
    const len = Math.floor(Math.random() * length)
    for (let i = 0; i < len; i++) {
      el.innerText = lipsum[Math.floor(Math.random() * (lipsum.length - 1))]
    }
    return el
  }
  function color() {
    let hex = '#'
    const col = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'a', 'b', 'c', 'd', 'e', 'f']
    for (let i = 0; i < 6; i++) {
      hex += col[Math.round(Math.random() * (col.length - 1))]
    }
    return hex
  }

  const section = document.createElement('details')
  section.id = 'gen'
  section.classList.add('mp-allow')
  const fragment = document.createDocumentFragment()
  for (let i = 0; i < num; i++) {
    // container
    const el = document.createElement('article')
    // heading
    el.appendChild(fill('h2', num))
    el.appendChild(fill('p', num * 2))
    // img
    const img = fill('img', -1)
    img.classList.add(i % 2 === 0 ? 'w50' : 'w100')
    img.style.height = '8em'
    img.style.backgroundColor = color()
    img.src = 'data:,'
    el.appendChild(img)
    // list
    const ul = fill('ul', num / 2)
    ul.appendChild(fill('li', num * 3))
    ul.appendChild(fill('li', num * 6))
    ul.appendChild(fill('li', num * 2))
    el.appendChild(ul)

    fragment.appendChild(el)
  }
  section.appendChild(fragment)

  document.querySelector(selector).appendChild(section)
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
