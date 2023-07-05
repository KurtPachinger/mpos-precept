import './mpos.scss'
import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toSvg, toJpeg, toPng } from 'html-to-image'

const mpos = {
  var: {
    opt: {
      selector: 'body',
      address: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 16,
      inPolar: 2,
      arc: false,
      frame: false,
      update: function () {
        mpos.add.dom(this.selector, this.depth)
      }
    },
    fov: {
      w: window.innerWidth,
      h: window.innerHeight,
      z: 8,
      max: 1024
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
  init: function () {
    const vars = mpos.var
    // containers
    const template = document.createElement('template')
    template.innerHTML = `
    <section id='mp' class='mp-block'>
      <address class='tool mp-offscreen'>
        <object></object>
      </address>
      <aside class='tool' id='atlas'>
        <a><canvas></canvas></a>
        <hr id='carot' />
      </aside>
      <div id='css3d'></div>
    </section>`
    document.body.appendChild(template.content)
    mpos.precept.canvas = document.querySelector('#atlas canvas')
    mpos.var.carot = document.getElementById('carot')
    const mp = document.getElementById('mp')

    // THREE
    vars.scene = new THREE.Scene()
    vars.camera = new THREE.PerspectiveCamera(45, vars.fov.w / vars.fov.h, 0.01, vars.fov.max * 16)
    vars.camera.layers.enableAll()
    vars.camera.position.z = vars.fov.max

    vars.renderer = new THREE.WebGLRenderer()
    vars.renderer.setSize(vars.fov.w, vars.fov.h)
    mp.appendChild(vars.renderer.domElement)
    vars.renderer.setClearColor(0x00ff00, 0)
    // helpers
    const axes = new THREE.AxesHelper(vars.fov.max)
    vars.scene.add(axes)

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
    css3d.appendChild(vars.rendererCSS.domElement)
    css3d.querySelectorAll('div').forEach((el) => el.classList.add('mp-block'))
    vars.controls = new MapControls(vars.camera, vars.rendererCSS.domElement)
    vars.controls.screenSpacePanning = true

    const halfHeight = -(vars.fov.h / 2)
    vars.camera.position.setY(halfHeight + 0.125)
    vars.controls.target.setY(halfHeight)
    vars.controls.update()

    // reveal
    vars.raycaster.layers.set(2)
    mpos.ux.render()

    // user events: css
    const cloneCSS = mp.querySelector('#css3d > div > div > div')
    cloneCSS.addEventListener('pointerdown', mpos.ux.event, false)
    cloneCSS.addEventListener('input', mpos.ux.event, false)
    // user events: scene
    vars.controls.addEventListener('change', mpos.ux.render, false)
    mp.addEventListener('pointermove', mpos.ux.raycast, false)
    window.addEventListener('scroll', mpos.ux.reflow, false)

    // resize
    const resize = new ResizeObserver((entries) => {
      mpos.ux.reflow({ type: 'resize' })
    })
    resize.observe(mp)

    // scroll
    const callback = function (entries, observer) {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target)
          mpos.ux.reflow(entry)
        }
      })
    }
    mpos.ux.observer = new IntersectionObserver(callback)

    const gui = new GUI()
    Object.keys(vars.opt).forEach(function (key) {
      let param = []
      if (key === 'selector') param = [['body', 'main', '#text', '#media', '#transform', 'address']]
      if (key === 'depth') param = [0, 32, 1]
      if (key === 'inPolar') param = [1, 4, 1]

      gui.add(vars.opt, key, ...param)
    })
    gui.domElement.classList.add('mp-native')
  },
  ux: {
    reflow: function (e) {
      // balance lag of input versus update
      const vars = mpos.var
      const grade = vars.group.userData.grade
      const queue = grade.r_.queue

      function enqueue(idx) {
        if (queue.indexOf(idx) === -1) {
          // immediately add unique
          queue.push(idx)
        }
        requestIdleCallback(
          function () {
            if (queue.length) {
              // debounce concurrent updates
              mpos.precept.update(grade, idx)
            }
          },
          { time: 125 }
        )
      }

      if (e.isIntersecting) {
        // enqueue visible element
        const idx = e.target.getAttribute('data-idx')
        enqueue(idx)
      } else {
        // throttle event
        clearTimeout(vars.reflow)
        vars.reflow = setTimeout(function () {
          if (e.type === 'resize') {
            // ...recalculate inPolar and update?
            vars.fov.w = window.innerWidth
            vars.fov.h = window.innerHeight

            vars.camera.aspect = vars.fov.w / vars.fov.h
            vars.camera.updateProjectionMatrix()

            vars.renderer.setSize(vars.fov.w, vars.fov.h)
            vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)

            mpos.ux.render()
          } else if (e.type === 'scroll') {
            // soft-update visible area
            const idx = vars.opt.inPolar === 4 ? 'trim' : 'move'

            enqueue(idx)
          }
        }, 250)
      }
    },
    render: function () {
      const vars = mpos.var
      //requestAnimationFrame(vars.animate)
      const time = new Date().getTime() / 100
      vars.scene.traverseVisible(function (obj) {
        // step a frame tick
        const animate = obj.animations === true
        if (animate) {
          obj.rotation.x = Math.sin(time) / 10
          obj.rotation.y = Math.cos(time) / 10
        }
      })
      vars.renderer.render(vars.scene, vars.camera)
      vars.rendererCSS.render(vars.scene, vars.camera)
    },
    raycast: function (e) {
      const vars = mpos.var
      vars.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      vars.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1

      if (vars.group) {
        const grade = vars.group.userData.grade
        vars.raycaster.setFromCamera(vars.pointer, vars.camera)
        let intersects = vars.raycaster.intersectObjects(vars.group.children, false)
        intersects = intersects.filter(function (hit) {
          return grade.ray.indexOf(hit.instanceId) > -1
        })

        if (intersects.length) {
          //console.log('intersects', intersects)
          const hit = intersects[0]
          const obj = hit.object

          if (obj) {
            const rect = Object.values(grade.r_.atlas.rects)[hit.instanceId]
            //console.log('ray', hit.instanceId, rect)
            const carot = vars.carot.style
            // visibility
            const vis = mpos.precept.inPolar(rect.el) >= vars.opt.inPolar
            const color = vis ? 'rgba(0,255,0,0.66)' : 'rgba(255,0,0,0.66)'
            carot.backgroundColor = color
            // location
            const cell = 100 * (1 / grade.cells)
            carot.width = carot.height = cell + '%'
            carot.left = 100 * rect.x + '%'
            carot.bottom = 100 * (1 - rect.y) + '%'
            if (!rect.atlas) {
              // child container
              carot.width = '100%'
              carot.left = carot.bottom = 0
            }
          }
        }
      }
    },
    event: function (e) {
      if (e.type === 'pointerdown') {
        // prevent drag Controls (...parentElement?)
        if (e.target.matches([mpos.precept.native, mpos.precept.native3d])) {
          console.log(e.target.tagName)
          e.stopPropagation()
        }
      } else if (e.type === 'input') {
        // clone form data
        const idx = e.target.getAttribute('data-idx')
        const node = document.querySelector('[data-idx="' + idx + '"]')
        node.value = e.target.value
      }
    }
  },
  precept: {
    index: 0,
    manual: `.mp-loader,.mp-native,.mp-poster`.split(','),
    unset: `.mp-offscreen`.split(','),
    allow: `.mp-allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
    block: `.mp-block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template`.split(','),
    native: `.mp-native,a,iframe,frame,object,embed,svg,table,details,form,label,button,input,select,textarea,output,dialog,video,audio[controls]`.split(
      ','
    ),
    poster: `.mp-poster,canvas,picture,img,h1,h2,h3,h4,h5,h6,p,ul,ol,li,th,td,summary,caption,dt,dd,code,span,root`.split(','),
    native3d: `model-viewer,a-scene,babylon,three-d-viewer,#stl_cont,#root,.sketchfab-embed-wrapper,StandardReality`.split(','),
    inPolar: function (node, control) {
      let vis = node.tagName || node.textContent.trim() ? 1 : false
      if (typeof control === 'object') {
        // node relative in control plot
        vis = Object.values(control).some(function (tag) {
          const unlist = node.parentElement.checkVisibility()
          return unlist && node.compareDocumentPosition(tag.el) & Node.DOCUMENT_POSITION_CONTAINS
        })
      } else {
        // 1: node not empty
        if (node.tagName) {
          // 2: node is tag
          vis++
          if (node.checkVisibility()) {
            // 3: tag not hidden
            vis++
            const rect = node.getBoundingClientRect()
            const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
            const scroll = !(rect.bottom < 0 || rect.top - viewHeight >= 0)
            if (scroll) {
              // 4: tag in viewport
              vis++
            }
          }
        }
      }
      return vis
    },
    update: function (grade, dataIdx) {
      const r_queue = grade.r_.queue
      if (dataIdx && !r_queue.length) {
        // redundant invocation
        return
      }
      console.log('queue', grade.r_.queue, dataIdx)

      const r_atlas = grade.r_.atlas
      const r_other = grade.r_.other

      if (dataIdx) {
        // SOFT-update
        let reflow = false
        for (let i = r_queue.length - 1; i >= 0; i--) {
          const idx = r_queue[i]
          if (isFinite(idx)) {
            // Observer
            const rect = grade.rects[idx]
            rect.inPolar = mpos.precept.inPolar(rect.el)
            const type = rect.mat === 'native' || rect.mat === 'loader' || rect.mat === 'wire' ? 'other' : 'atlas'

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
              r_.rects[idx].inPolar = rect.inPolar
            }
          } else if (idx === 'trim') {
            reflow = true
          }
        }

        if (reflow) {
          // update visibility
          function vis(arr) {
            Object.values(arr).forEach(function (rect) {
              rect.inPolar = mpos.precept.inPolar(rect.el)
            })
          }
          vis(r_atlas.rects)
          vis(r_other.rects)
        }
      } else {
        // HARD-update: viewport
        const root = document.body
        const rect = { el: root, mat: 'wire', z: -16, fix: true }
        const idx = root.getAttribute('data-idx')
        r_other.rects[idx] = rect
        r_other.count++
      }

      const promise = new Promise((resolve, reject) => {
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

            opts.idx = opts.array.length
            opts.ctx = opts.ctx || grade.canvas.getContext('2d')
            opts.step = opts.step || grade.maxRes / grade.cells
            // FPO FP FCP LCP: [0%, 50%]
            opts.paint = opts.idx >= 8 ? [opts.idx, Math.floor(opts.idx / 2)] : []
          }

          function next() {
            setTimeout(() => {
              if (dataIdx) {
                // decrement queue
                opts.array = opts.array.splice(0, opts.idx)
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
            }, 0)
          }

          const rect = r_atlas.rects[opts.array[opts.idx]]
          if (rect && rect.atlas !== undefined) {
            // style needs no transform, and block
            const unset = { transform: 'initial', margin: 0 }
            // bug: style display-inline is not honored by style override
            mpos.add.css(rect, true)
            toSvg(rect.el, { style: unset })
              .then(function (dataUrl) {
                mpos.add.css(rect, false)
                let img = new Image()
                img.onload = function () {
                  // canvas xy: from block top (FIFO)
                  const x = (rect.atlas % grade.cells) * opts.step
                  const y = (Math.floor(rect.atlas / grade.cells) % grade.cells) * opts.step
                  opts.ctx.drawImage(img, x, y, opts.step, opts.step)
                  // shader xy: from block bottom
                  // avoid 0 edge, so add 0.0001
                  rect.x = (0.0001 + x) / grade.maxRes
                  rect.y = (0.0001 + y + opts.step) / grade.maxRes
                  // recursive
                  next()
                  dataUrl = img = null
                }

                img.src = dataUrl
              })
              .catch(function (e) {
                // src problem...
                console.log('error', e.target)
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
          grade.inPolar = mpos.var.opt.inPolar

          // Mesh: CSS3D, loader, root...
          Object.values(r_other.rects).forEach(function (rect) {
            const add = !rect.obj && (dataIdx === undefined || rect.add)
            const scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
            // add (async) or transform
            mpos.add.box(rect, { add: add, scroll: scroll })

            if (rect.obj) {
              // filter visibility
              let visible = true
              if (grade.inPolar >= 4 && !rect.fix) {
                visible = rect.inPolar >= grade.inPolar
              }
              rect.obj.visible = visible
            }
          })

          // Instanced Mesh
          const instanced = grade.instanced
          instanced.count = r_atlas.count
          const uvOffset = new Float32Array(instanced.count * 2).fill(-1)

          grade.ray = []
          let count = 0
          for (const [idx, rect] of Object.entries(r_atlas.rects)) {
            // Instance Matrix
            const dummy = mpos.add.box(rect)
            instanced.setMatrixAt(count, dummy.matrix)
            // Instance Color
            const color = new THREE.Color()
            let bg = rect.css.style.backgroundColor || ''
            const rgba = bg.replace(/(rgba)|[( )]/g, '').split(',')
            const alpha = Number(rgba[3])
            if (alpha <= 0.0) {
              bg = null
            } else {
              // avoid warning
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
              if (rect.atlas !== undefined || rect.mat === 'child') {
                // raycast filter
                grade.ray.push(Number(idx))
              }
            }

            count++
          }

          instanced.instanceMatrix.needsUpdate = true
          instanced.instanceColor && (instanced.instanceColor.needsUpdate = true)
          instanced.computeBoundingSphere()

          // update shader
          instanced.geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffset, 2))
          instanced.userData.shader.userData.t.needsUpdate = true

          //
          mpos.ux.render()

          if (!paint) {
            // UI Atlas
            const atlas = document.querySelector('#atlas canvas')
            const name = ['atlas', grade.index, grade.atlas, grade.maxRes].join('_')
            //const link = atlas.querySelector('a')
            atlas.title = name
            //link.href = grade.canvas.toDataURL('image/jpeg', 0.5)
            //link.appendChild(grade.canvas)
            //document.getElementById('atlas').appendChild(link)

            resolve(grade)
            reject(grade)
          } else {
          }
        }
      })

      promise.catch((e) => console.log('error', e))
      promise.then(function (res) {
        console.log('update', res)

        //
        if (mpos.var.opt.frame) {
          grade.r_.queue.push('frame')
          setTimeout(() => {
            mpos.precept.update(grade, 'frame')
          }, 1000)
        }

        return promise
      })
    }
  },
  add: {
    dom: async function (selector, layers = 8) {
      const vars = mpos.var
      // get DOM node
      selector = selector || vars.opt.selector || 'body'
      const sel = document.querySelector(selector)
      if (sel === null) {
        return
      } else if (selector === 'address') {
        const obj = document.querySelector(selector + ' object')
        await mpos.add.src(obj, vars.opt.address, 'data')
      }

      // structure
      const precept = mpos.precept
      const grade = {
        sel: sel,
        canvas: precept.canvas,
        index: precept.index++,
        atlas: 0, // poster count, whereas r_.atlas includes self,child for instanceMesh
        minEls: 0, // inPolar count, which Observers increment
        maxEls: 0,
        minRes: 256,
        // list, grade and sort
        txt: [],
        rects: {},
        r_: {
          queue: [],
          atlas: { count: 0, rects: {} },
          other: { count: 0, rects: {} }
        },
        scroll: { x: window.scrollX, y: -window.scrollY }
      }

      // OLD group
      mpos.add.old(selector)
      // NEW group
      vars.group = new THREE.Group()
      vars.group.name = selector

      // FLAT-GRADE: filter, grade, sanitize
      const ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
      let node = ni.nextNode()
      while (node) {
        if (node.nodeName === '#comment') {
          // #comment... (or CDATA, xml, php)
          console.log('#comment', node.textContent)
        } else {
          let inPolar = precept.inPolar(node)
          if (inPolar) {
            let el = false
            if (inPolar >= 2) {
              el = node
              // ...estimate
            } else if (node.nodeName === '#text') {
              const orphan = node.parentNode.childElementCount >= 1 && node.parentNode.matches([precept.allow])
              if (orphan && precept.inPolar(node, grade.rects)) {
                // sanitize #text orphan (list or semantic) with parent visible
                const wrap = document.createElement('span')
                wrap.classList.add('mp-poster')
                node.parentNode.insertBefore(wrap, node)
                wrap.appendChild(node)

                el = wrap
                inPolar = precept.inPolar(el)
                grade.txt.push(node)
              }
            }

            if (el) {
              // static list
              const idx = grade.maxEls
              el.setAttribute('data-idx', idx)
              grade.rects[idx] = { el: el, inPolar: inPolar }
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

      function setRect(rect, z, mat, unset) {
        if (rect) {
          rect.mat = mat
          rect.z = z

          if (rect.inPolar >= vars.opt.inPolar) {
            grade.minEls++

            if (rect.mat === 'poster') {
              // shader
              rect.atlas = grade.atlas++
            }
          } else {
            // off-screen elements
            mpos.ux.observer.observe(rect.el)
          }

          // unset inherits transform from class
          unset = unset || rect.el.matches(precept.unset)
          if (unset) {
            rect.unset = true
          }
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

      function struct(sel, layer, unset) {
        // DEEP-GRADE: type, count
        const z = layers - layer

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
              } else {
                if (rect.inPolar >= 1) {
                  const allow = node.matches(precept.allow)
                  const manual = node.matches(precept.manual)
                  const child = node.children.length

                  if (layer >= 1 && allow && !manual && child) {
                    // selector structure output depth
                    const depth = layer - 1
                    struct(node, depth, unset)
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

      struct(sel, layers)

      Object.values(grade.rects).forEach((rect) => {
        // begin two lists: atlas (instanced) || other (mesh)
        if (rect.mat && rect.inPolar >= vars.opt.inPolar) {
          const type = rect.mat === 'native' || rect.mat === 'loader' || rect.mat === 'wire' ? 'other' : 'atlas'
          const r_ = grade.r_[type]
          r_.count++
          r_.rects[rect.el.getAttribute('data-idx')] = rect
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
      instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      instanced.layers.set(2)
      instanced.userData.shader = shader
      instanced.userData.el = grade.sel
      instanced.name = [grade.index, grade.sel.tagName].join('_')
      grade.instanced = instanced

      // OUTPUT
      vars.group.userData.grade = grade
      vars.group.add(instanced)
      vars.scene.add(vars.group)

      grade.group = vars.group

      mpos.precept.update(grade)
      return vars.group
    },
    box: function (rect, opts = {}) {
      const vars = mpos.var

      // css: accumulate transforms
      rect.css = mpos.add.css(rect)
      // css: unset for box scale
      mpos.add.css(rect, true)
      let bound = rect.el.getBoundingClientRect()
      // css: remove unset
      mpos.add.css(rect, false)

      // scale
      const w = bound.width
      const h = bound.height
      const d = vars.fov.z
      // position
      bound = rect.unset ? bound : rect.el.getBoundingClientRect()
      let x = bound.width / 2
      let y = -bound.height / 2
      // scroll{0,0} is viewport, not document
      const scroll = opts.scroll || { x: 0, y: 0 }
      if (!scroll.fix) {
        x += scroll.x + bound.left
        y += scroll.y - bound.top
      }

      let z = rect.z * d
      let zIndex = Number(rect.css.style.zIndex || 0)
      const sign = zIndex >= 0 ? 1 : -1
      zIndex = 1 - 1 / (Math.abs(zIndex) || 1)
      zIndex *= sign
      z += zIndex * (mpos.var.opt.depth * vars.fov.z)
      // arc
      const damp = 0.5
      const mid = vars.fov.w / 2
      const rad = (mid - x) / mid
      const pos = mid * Math.abs(rad)

      function transform(obj) {
        // separation for portal
        const stencil = obj.isCSS3DObject || rect.mat === 'loader'
        const extrude = stencil ? vars.fov.z / 2 : 0
        z += extrude

        obj.position.set(x, y, z)

        if (obj.isCSS3DObject) {
          // element does not scale like group
          obj.userData.el.style.width = w
          obj.userData.el.style.height = h
          // note: actually using cumulative
          if (rect.css.transform.length) {
            const scale = 'scale(' + rect.css.scale + ')'
            const degree = 'rotate(' + rect.css.degree + 'deg)'
            obj.userData.el.style.transform = [scale, degree].join(' ')
          }
        } else if (obj.isGroup) {
          // group implies loader, with arbitrary scale
          obj.position.x -= w / 2
          obj.position.y += h / 2
        } else {
          obj.scale.set(w * rect.css.scale, h * rect.css.scale, d)
          obj.rotation.z = -rect.css.radian
        }

        if (vars.opt.arc) {
          // bulge from view center
          obj.rotation.y = rad * damp * 2
          obj.position.setZ(z + pos * damp)
        }
      }

      let object
      if (rect.obj) {
        object = rect.obj
      } else if (rect.mat === 'native') {
        // note: element may not inherit some specific styles
        const el = rect.el.cloneNode(true)
        // wrap prevents overwritten transform
        const wrap = document.createElement('div')
        wrap.classList.add('mp-native')
        wrap.append(el)
        wrap.style.zIndex = rect.css.style.zIndex
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
        mesh.animations = true
        object = mesh
      } else {
        // Instanced Mesh
        object = new THREE.Object3D()
      }

      transform(object)
      object.updateMatrix()

      let obj = object
      if (opts.add) {
        rect.add = false
        // other custom process
        if (rect.mat === 'loader') {
          // async

          obj = new THREE.Group()

          mpos.add.loader(rect, object, obj)
        } else {
          // general (native, wire)
          vars.group.add(object)
        }
        const name = [rect.z, rect.mat, rect.el.nodeName].join('_')
        obj.name = name

        rect.obj = obj
      }

      return obj
    },
    css: function (rect, traverse) {
      // css style transforms
      // naive check (!rect.css) avoids expensive/live loops
      let el = rect.el
      const css = rect.css || { scale: 1, radian: 0, degree: 0, transform: [], style: {} }
      if (traverse === undefined) {
        // target element original style
        if (!rect.css) {
          const style = window.getComputedStyle(el)
          css.style = {
            transform: style.transform,
            transformOrigin: style.transformOrigin,
            backgroundColor: style.backgroundColor,
            zIndex: style.zIndex
          }
        }
      } else if (rect.unset) {
        // quirks of DOM
        if (el.matches('details')) {
          el.open = traverse
        }
        if (el.matches('.mp-offscreen')) {
          rect.z = rect.css.style.zIndex
        }
      }

      const rects = mpos.var.group.userData.grade.rects
      let els = []
      while (el && el !== document.body) {
        if (traverse === undefined) {
          if (!rect.css) {
            // accumulate ancestor matrix
            const cache = rects[el.getAttribute('data-idx')]?.css
            const style = cache ? cache.style : window.getComputedStyle(el)
            if (style.transform.startsWith('matrix')) {
              const transform = style.transform.replace(/(matrix)|[( )]/g, '')
              // transform matrix
              const [a, b] = transform.split(',')
              const scale = Math.sqrt(a * a + b * b)
              const degree = Math.round(Math.atan2(b, a) * (180 / Math.PI))
              const radian = degree * (Math.PI / 180)
              // element origin and bounds
              const origin = style.transformOrigin.replace(/(px)/g, '').split(' ')
              const bound = el.getBoundingClientRect()

              // Output
              // original accrue (didnt work)
              css.scale *= scale
              css.radian += radian
              css.degree += degree

              css.transform.push({
                scale: scale,
                degree: degree,
                radian: radian,
                origin: { x: Number(origin[0]), y: Number(origin[1]) },
                bound: bound
              })
            }
          }
        } else {
          // style override
          traverse ? el.classList.add('mp-unset') : el.classList.remove('mp-unset')
        }

        els.unshift(el)
        el = el.parentNode
      }

      return css
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
      let groups = mpos.var.scene.getObjectsByProperty('type', 'Group')

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
      const css3d = mpos.var.rendererCSS.domElement
      const clones = css3d.querySelectorAll(':not(.mp-block)')
      clones.forEach(function (el) {
        el.parentElement.removeChild(el)
      })

      // Shader Atlas
      //let atlas = document.getElementById('atlas').children
      //for (let c = atlas.length - 1; c >= 0; c--) {
      // atlas[c].parentElement.removeChild(atlas[c])
      //}
      document.querySelectorAll('[data-idx]').forEach((el) => el.setAttribute('data-idx', ''))
      mpos.ux.observer.disconnect()
    },
    fit: function (dummy, group) {
      // scale
      const aabb = new THREE.Box3()
      aabb.setFromObject(group)
      const s1 = Math.max(dummy.scale.x, dummy.scale.y)
      const s2 = Math.max(aabb.max.x, aabb.max.y)
      group.scale.multiplyScalar(s1 / s2)
      group.scale.y *= -1
      // position
      group.position.copy(dummy.position)
      group.position.x -= dummy.scale.x / 2
      group.position.y += dummy.scale.y / 2

      //group.userData.el = rect.el
      mpos.var.group.add(group)
      mpos.ux.render()
    },
    loader: function (rect, dummy, group) {
      const file = rect.el.data || rect.el.src || rect.el.href

      // instantiate a loader: File, Audio, Object...
      // todo: url query string pramaters
      let handler = file ? file.match(/\.[0-9a-z]+$/i) : false
      handler = handler && dummy && group ? handler[0].toUpperCase() : 'File'
      console.log(handler)
      const loader = handler === '.SVG' ? new SVGLoader() : new THREE.FileLoader()

      if (file && (handler === '.SVG' || handler === 'File')) {
        loader.load(
          file,
          function (data) {
            //console.log('data', data)
            //res = data
            if (handler === 'File') {
              // set attribute
            } else if (handler === '.SVG') {
              const paths = data.paths || []

              for (let i = 0; i < paths.length; i++) {
                const path = paths[i]

                const material = new THREE.MeshBasicMaterial({
                  color: path.color,
                  side: THREE.FrontSide,
                  depthWrite: false
                })

                const shapes = SVGLoader.createShapes(path)

                for (let j = 0; j < shapes.length; j++) {
                  const shape = shapes[j]
                  const geometry = new THREE.ShapeGeometry(shape)
                  const mesh = new THREE.Mesh(geometry, material)
                  group.add(mesh)
                }
              }
              group.name = handler
              mpos.add.fit(dummy, group)
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
        if (mpos.var.cv === undefined) {
          mpos.var.cv = false
          // OPENCV WASM
          //huningxin.github.io/opencv.js/samples/index.html
          const script = document.createElement('script')
          script.type = 'text/javascript'
          script.async = true
          script.onload = function () {
            // remote script has loaded
            console.log('OpenCV.js')
            mpos.var.cv = true
          }
          script.src = './opencv.js?t=' + Date.now()
          document.getElementsByTagName('head')[0].appendChild(script)
        }

        requestIdleCallback(
          function () {
            if (mpos.var.cv) {
              const unset = { transform: 'initial', margin: 0 }
              // unset...
              toPng(rect.el, { style: unset })
                .then(function (dataUrl) {
                  let img = new Image()
                  img.onload = function () {
                    mpos.add.opencv(img, group, dummy)
                    dataUrl = img = null
                  }
                  // todo: animated gif?
                  img.src = dataUrl
                })
                .catch(function (e) {
                  // src problem...
                  console.log('error', e.target)
                })
            }
          },
          { time: 5000 }
        )
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
                cv.approxPolyDP(cnt, tmp, 0.25, true)
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
              console.log('cv', kmeans)
              // THREE.Shape from label contours
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
                    let geometry = new THREE.ShapeGeometry(poly)
                    geometry = mergeVertices(geometry)
                    mergedGeoms.push(geometry)
                  })
                }

                if (mergedGeoms.length) {
                  // label color
                  const rgba = label.rgba
                  const color = new THREE.Color('rgb(' + [rgba.r, rgba.g, rgba.b].join(',') + ')')
                  const mat = mpos.var.mat_shape.clone()
                  mat.color = color
                  mat.opacity = rgba.a / 255
                  // label contours
                  const mergedBoxes = mergeGeometries(mergedGeoms)
                  const mesh = new THREE.Mesh(mergedBoxes, mat)
                  group.add(mesh)
                }
              })
              kmeans = null

              group.name = 'OPENCV'
              mpos.add.fit(dummy, group)
            } catch (error) {
              console.warn(error)
            }
          }
        ]
      }

      // run Module _main, with vars monkeyed into _stdin
      // i.e. _stdin: { ivy: college, peep: blackbox }
      opencv(Module)
    }
  }
}

mpos.gen = function (num = 6, selector = 'main') {
  // img,ul,embed
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
    // talk-over upper-lower
    let TCOV = '#'
    const URLR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'a', 'b', 'c', 'd', 'e', 'f']
    for (let i = 0; i < 6; i++) {
      TCOV += URLR[Math.round(Math.random() * (URLR.length - 1))]
    }
    return TCOV
  }

  const section = document.createElement('details')
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

export default mpos
