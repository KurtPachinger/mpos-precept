import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { toSvg } from 'html-to-image'

const mpos = {
  var: {
    opt: {
      dispose: true,
      selector: 'main',
      address: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 16,
      inPolar: 3,
      arc: false,
      update: function () {
        mpos.add
          .dom(mpos.var.opt.selector, mpos.var.opt.depth)
          .then(mpos.ux.render)
          .catch((e) => console.log('err', e))
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
      side: THREE.FrontSide,
      color: 'cyan',
      depthWrite: false
    }),
    mat_line: new THREE.LineBasicMaterial({
      transparent: true,
      //wireframe: true,
      side: THREE.FrontSide
    }),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    carot: document.getElementById('carot')
  },
  init: function () {
    const vars = mpos.var
    // THREE
    vars.scene = new THREE.Scene()
    vars.camera = new THREE.PerspectiveCamera(45, vars.fov.w / vars.fov.h, 0.01, 100)
    //vars.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.5, 1.5)
    vars.camera.layers.enableAll()
    vars.camera.position.z = 1.25

    vars.renderer = new THREE.WebGLRenderer()
    vars.renderer.setSize(vars.fov.w, vars.fov.h)
    document.body.appendChild(vars.renderer.domElement)
    vars.renderer.setClearColor(0x00ff00, 0)
    // helpers
    let axes = new THREE.AxesHelper(0.5)
    vars.scene.add(axes)
    //const pointLight = new THREE.PointLight(0xc0c0c0, 2, 10)
    //pointLight.position.set(0, 2, 5)
    //vars.scene.add(pointLight)

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
    css3d.appendChild(vars.rendererCSS.domElement)
    css3d.querySelectorAll('div').forEach((el) => el.classList.add('block'))
    vars.controls = new MapControls(vars.camera, vars.rendererCSS.domElement)
    vars.controls.screenSpacePanning = true

    const helfHeight = -((vars.fov.h / 2) * (1 / vars.fov.max))
    vars.camera.position.setY(helfHeight + 0.125)
    vars.controls.target.setY(helfHeight)
    vars.controls.update()

    // live
    const cloneCSS = document.querySelector('#css3d > div > div > div')
    cloneCSS.addEventListener('pointerdown', mpos.ux.event, false)
    cloneCSS.addEventListener('input', mpos.ux.event, false)
    window.addEventListener('resize', mpos.ux.resize, false)
    vars.controls.addEventListener('change', mpos.ux.render, false)
    window.addEventListener('pointermove', mpos.ux.raycast, false)

    vars.raycaster.layers.set(2)
    mpos.ux.render()

    // Intersection Observer
    const callback = function (entries, observer) {
      requestIdleCallback(
        function () {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              console.log('entry', entry.target, entry.boundingClientRect)
              observer.unobserve(entry.target)
            }
          })
        },
        { time: 1000 }
      )
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
  },
  ux: {
    resize: function () {
      const vars = mpos.var
      // throttle
      clearTimeout(vars.resize)
      vars.resize = setTimeout(function () {
        vars.fov.w = window.innerWidth
        vars.fov.h = window.innerHeight

        vars.camera.aspect = vars.fov.w / vars.fov.h
        vars.camera.updateProjectionMatrix()

        vars.renderer.setSize(vars.fov.w, vars.fov.h)
        vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)

        mpos.ux.render()
      }, 250)
    },
    render: function () {
      const vars = mpos.var
      //requestAnimationFrame(vars.animate)
      const time = new Date().getTime() / 100
      vars.scene.traverseVisible(function (obj) {
        // in frustum... in viewport?
        // ...upsample, animate, or ux.
        let animate = obj.animations === true
        if (animate) {
          obj.rotation.x = Math.sin(time) / 10
          obj.rotation.y = Math.cos(time) / 10
        }
      })
      vars.renderer.render(vars.scene, vars.camera)
      vars.rendererCSS.render(vars.scene, vars.camera)
    },
    raycast: function (event) {
      const vars = mpos.var
      vars.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      vars.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

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
            const rect = grade.rects[hit.instanceId]
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
        // prevent drag Controls
        if (e.target.matches('a,input,details,model-viewer')) {
          e.stopPropagation()
        }
      } else {
        // update form data
        const idx = e.target.getAttribute('data-idx')
        const node = document.querySelector('[data-idx="' + idx + '"]')
        node.value = e.target.value
      }
    }
  },
  precept: {
    index: 0,
    canvas: document.querySelector('#atlas canvas'),
    allow: `.allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
    block: `.block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template`.split(','),
    native: `.native,a,iframe,frame,embed,object,svg,table,details,form,dialog,video,audio[controls]`.split(','),
    poster: `.poster,canvas,picture,img,h1,h2,h3,h4,h5,h6,p,ul,ol,li,th,td,summary,caption,dt,dd,code,root`.split(','),
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
    }
  },
  add: {
    dom: async function (selector, layers = 8, update) {
      const vars = mpos.var
      // get DOM node
      selector = selector || vars.opt.selector || 'body'
      let sel = document.querySelector(selector)
      if (sel === null) {
        return
      } else if (selector === 'address') {
        const obj = document.querySelector(selector + ' object')
        await mpos.add.src(obj, vars.opt.address, 'data')
      }

      // structure
      const precept = mpos.precept
      const grade = {
        index: precept.index++,
        minRes: 256,
        maxEls: 0,
        minEls: 0,
        atlas: 0,
        rects: {},
        txt: [],
        sX: window.scrollX,
        sY: window.scrollY,
        canvas: precept.canvas
      }

      // THREE cleanup
      let dispose = vars.opt.dispose ? selector : false
      if (!update) {
        mpos.add.old(dispose)
        // new THREE group
        vars.group = new THREE.Group()
        vars.group.name = selector
        // root DOM node (viewport)
        const mesh = mpos.add.box({ el: document.body, z: 0, mat: 'wire' }, { sX: grade.sX, sY: grade.sY })
        vars.group.add(...mesh)
      }

      const promise = new Promise((resolve, reject) => {
        // FLAT-GRADE: filter, grade, sanitize
        let ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
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
                //if (node.matches([precept.native, precept.poster])) {}
              } else if (
                node.nodeName === '#text' &&
                node.parentNode.matches([precept.allow]) &&
                !node.parentNode.matches([precept.native, precept.poster]) &&
                node.parentElement.childNodes !== 1 &&
                precept.inPolar(node, grade.rects)
              ) {
                // #text orphan with parent visible
                // sanitize, block-level required for width
                let wrap = document.createElement('div')
                wrap.classList.add('poster')
                node.parentNode.insertBefore(wrap, node)
                wrap.appendChild(node)

                el = wrap
                inPolar = precept.inPolar(el)
                grade.txt.push(node)
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
        //grade.canvas.id = grade.index

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
              // off-screen
              console.log('observe', rect.el)
              mpos.ux.observer.observe(rect.el)
            }

            unset = unset || rect.el.matches('.offscreen,details:not([open])')
            if (unset) {
              rect.unset = true
            }
          }
          return unset
        }
        function setMat(node, mat, manual, layer) {
          if (manual) {
            // priority score
            if (node.matches('.loader')) {
              mat = 'loader'
            } else if (node.matches('.poster')) {
              mat = 'poster'
            } else if (node.matches('.native')) {
              mat = 'native'
            }
          } else if (node.matches([precept.native, precept.native3d])) {
            // todo: test internal type
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
          let rect = grade.rects[sel.getAttribute('data-idx')]
          // unset inherits transform from class

          let mat = 'self'
          // specify empty or manual
          let children = sel.children
          const manual = rect.el.matches('.poster, .native, .loader')
          if (!children.length || manual) {
            mat = setMat(rect.el, mat, manual)
          }
          unset = setRect(rect, z, mat, unset)
          if (!manual) {
            // CHILD
            for (let i = 0; i < children.length; i++) {
              let node = children[i]

              let rect = grade.rects[node.getAttribute('data-idx')]
              if (rect && rect.inPolar) {
                // CLASSIFY TYPE
                const block = node.matches(precept.block)
                const abort = grade.atlas >= grade.minRes
                if (block || abort) {
                  console.log('skip', node.nodeName)
                } else {
                  if (rect.inPolar >= 1) {
                    const allow = node.matches(precept.allow)
                    const manual = node.matches('.poster, .native, .loader')
                    const empty = node.children.length === 0

                    if (layer >= 1 && allow && !manual && !empty) {
                      // selector structure output depth
                      let depth = layer - 1
                      struct(node, depth, unset)
                    } else {
                      let mat = 'child'
                      // set box type
                      mat = setMat(node, mat, manual, layer)

                      setRect(rect, z, mat, unset)
                    }
                  }
                }
              }
            }
          }
        }

        struct(sel, layers)

        function atlas(grade, idx = 0, opts = {}) {
          // element mat conversion
          if (opts.run === undefined) {
            opts.run = idx + opts.slice || Object.keys(grade.rects).length
            opts.ctx = opts.ctx || grade.canvas.getContext('2d')
            opts.step = opts.step || grade.maxRes / grade.cells
            // keep unused references?
            opts.trim = !(opts.trim === false) || true
          }

          function next() {
            idx++
            if (idx < opts.run) {
              atlas(grade, idx)
            } else {
              if (opts.trim) {
                grade.rects = Object.values(grade.rects).filter((rect) => rect.mat)
              }
              // the atlas ends with 2 blocks: cyan and transparent

              opts.ctx.fillStyle = 'rgba(0,255,255,0.125)'
              opts.ctx.fillRect(grade.maxRes - opts.step, grade.maxRes - opts.step, opts.step, opts.step)

              transforms(grade)
            }
          }

          let rect = grade.rects[idx]
          if (rect.inPolar >= mpos.var.opt.inPolar && (typeof rect.atlas === 'number' || rect.mat === 'loader')) {
            let unset = { transform: 'initial' }
            toSvg(rect.el, { style: unset })
              .then(function (dataUrl) {
                let img = new Image()
                img.onload = function () {
                  if (rect.mat === 'loader') {
                    // SVGLoader supports files, but not text...?
                    let file = rect.el.data || rect.el.src || rect.el.href | ''
                    if (file) {
                      let dummy = new THREE.Object3D()
                      dummy = mpos.add.box(rect, { dummy: dummy })
                      mpos.add.loader(file, dummy)
                    }
                  } else {
                    // poster coordinate

                    // canvas xy: from block top
                    let x = (rect.atlas % grade.cells) * opts.step
                    let y = (Math.floor(rect.atlas / grade.cells) % grade.cells) * opts.step
                    opts.ctx.drawImage(img, x, y, opts.step, opts.step)
                    // shader xy: from block bottom
                    // avoid 0 edge, so add 0.0001
                    rect.x = (0.0001 + x) / grade.maxRes
                    rect.y = (0.0001 + y + opts.step) / grade.maxRes
                  }

                  next()
                }

                img.src = dataUrl
              })
              .catch(function (e) {
                // some box problem... error retry count?
                console.log('err', e, rect.el, e.target.classList)
                next()
              })
          } else {
            next()
          }
        }
        atlas(grade)

        function transforms(grade) {
          grade.ray = []

          // Instanced Mesh, shader atlas
          const shader = mpos.add.shader(grade.canvas, grade.cells)
          const generic = new THREE.InstancedMesh(
            vars.geo.clone(),
            [vars.mat, vars.mat, vars.mat, vars.mat, shader, vars.mat_line],
            grade.maxEls
          )
          generic.instanceMatrix.setUsage(THREE.StaticDrawUsage)
          generic.count = grade.minEls
          generic.userData.el = sel
          generic.name = [grade.index, selector].join('_')
          generic.layers.set(2)

          // Meshes
          const cyan = { x: 1 - 1 / grade.cells, y: 0.01 }
          const uvOffset = new Float32Array(grade.minEls * 2).fill(-1)
          //let count = 0
          for (const [count, rect] of Object.entries(grade.rects)) {
            if (rect.mat && rect.inPolar >= vars.opt.inPolar) {
              // Instance Matrix
              let dummy = new THREE.Object3D()
              dummy = mpos.add.box(rect, { dummy: dummy })
              generic.setMatrixAt(count, dummy.matrix)
              // Instance Color
              const color = new THREE.Color()
              let bg = rect.css.style.backgroundColor
              const rgba = bg.replace(/(rgba)|[( )]/g, '').split(',')
              const alpha = Number(rgba[3])
              if (alpha <= 0.0) {
                bg = rect.mat === 'child' ? 'cyan' : null
              }
              generic.setColorAt(count, color.setStyle(bg))

              // Shader Atlas: index or dummy slot
              const stepSize = count * 2
              // uv coordinate
              uvOffset[stepSize] = rect.x || cyan.x
              uvOffset[stepSize + 1] = 1 - rect.y || cyan.y
              if (rect.atlas !== undefined || rect.mat === 'child') {
                // raycast
                grade.ray.push(Number(count))
              }

              if (rect.mat === 'native') {
                // CSS3D standalone
                let mesh = mpos.add.box(rect)
                vars.group.add(mesh[1])
              }
            }
            // count++
          }

          generic.instanceMatrix.needsUpdate = true
          generic.instanceColor.needsUpdate = true
          generic.computeBoundingSphere()
          generic.geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffset, 2))

          // UI Atlas
          let link = document.querySelector('#atlas a')
          let name = ['atlas', grade.index, grade.atlas, grade.maxRes].join('_')
          link.title = link.download = name
          link.href = grade.canvas.toDataURL()
          //link.appendChild(grade.canvas)
          //document.getElementById('atlas').appendChild(link)

          // OUTPUT
          vars.group.userData.grade = grade
          vars.group.scale.multiplyScalar(1 / vars.fov.max)
          vars.group.add(generic)
          vars.scene.add(vars.group)

          grade.group = vars.group
          console.log(grade)
          resolve(grade)
          reject(grade)
        }
      })

      return promise
    },
    box: function (rect, opts = {}) {
      const vars = mpos.var
      const element = rect.el
      // css: cumulative transform
      rect.css = mpos.add.css(rect.el)
      // css: unset for box scale
      mpos.add.css(rect.el, true, rect.unset)

      let bound = element.getBoundingClientRect()
      mpos.add.css(rect.el, false, rect.unset)

      // origin(0,0) follows viewport, not window
      const sX = opts.sX || 0
      const sY = -opts.sY || 0

      // scale
      const w = bound.width
      const h = bound.height
      const d = vars.fov.z
      // position
      bound = rect.unset ? bound : element.getBoundingClientRect()
      const x = sX + (bound.width / 2 + bound.left)
      const y = sY - bound.height / 2 - bound.top
      let z = rect.z
      let zIndex = rect.css.zIndex
      zIndex = zIndex > 0 ? 1 - 1 / zIndex : 0
      z = Number((z * d + zIndex).toFixed(6))
      // arc
      const damp = 0.5
      const mid = vars.fov.w / 2
      const rad = (mid - x) / mid
      const pos = mid * Math.abs(rad)

      function transform(objects) {
        objects.forEach((obj) => {
          // tiny offset
          let stencil = obj.isCSS3DObject || rect.mat === 'loader'
          let extrude = stencil ? vars.fov.z / 2 : 0
          z += extrude

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
          } else {
            obj.scale.set(w * rect.css.scale, h * rect.css.scale, d)
            obj.rotation.z = -rect.css.radian
          }

          obj.position.set(x, y, z)

          // BUG FIX 1: ABOVE, remove css.scale and css.rotate
          // BUG FIX 2: BELOW, apply per-instance to Object3D or HTML clone
          /*
          const transform = rect.css.transform
          for (let i = 0; i < transform.length; i++) {
            // apply css transforms from origin
            // scale *=, rotate +=
            const dummy = new THREE.Object3D()
            const inherit = transform[i]
            const bound = inherit.bound
            dummy.position.set(sX + bound.left + inherit.origin.x, sY - bound.top - inherit.origin.y, z)
            dummy.scale.multiplyScalar(inherit.scale)
            dummy.rotation.z = -inherit.rotate
            obj.rotation.applyMatrix4(dummy.matrix)
            obj.scale.applyMatrix4(dummy.matrix)
            obj.updateMatrix()
          }
          */

          if (vars.opt.arc) {
            // bulge from view center
            obj.rotation.y = rad * damp * 2
            obj.position.setZ(z + pos * damp)
          }
        })
      }

      let types = []

      if (opts.dummy) {
        // Instanced Mesh
        types.push(opts.dummy)
        transform(types)
        opts.dummy.updateMatrix()
        types = opts.dummy
      } else {
        // Mesh Singleton
        const name = [rect.z, rect.mat, element.nodeName].join('_')

        const mesh = new THREE.Mesh(vars.geo, vars.mat)
        //mesh.scale.set(w, h, d)
        mesh.userData.el = rect.el
        mesh.name = name

        types.push(mesh)
        if (rect.mat === 'wire') {
          mesh.animations = true
        } else {
          const mat = vars.mat.clone()
          mat.wireframe = false
          mat.name = element.tagName

          // static or dynamic
          if (opts.mat === 'poster') {
            mesh.material = [vars.mat, vars.mat, vars.mat, vars.mat, mat, vars.mat_line]
            let unset = { transform: 'initial' }
            toSvg(element, { style: unset })
              .then(function (dataUrl) {
                mat.map = new THREE.TextureLoader().load(dataUrl)
                mat.needsUpdate = true
              })
              .catch((e) => console.log('err', e))
          } else if (rect.mat === 'native') {
            const el = element.cloneNode(true)
            // wrap prevents overwritten transform
            const wrap = document.createElement('div')
            wrap.classList.add('clone')
            wrap.append(el)
            const css3d = new CSS3DObject(wrap)
            // note: most userData.el reference an original, not a clone
            css3d.userData.el = el
            css3d.name = name
            types.push(css3d)
          }

          // styles
          let bg = rect.css.style.backgroundColor
          const rgba = bg.replace(/(rgba)|[( )]/g, '').split(',')
          if (Number(rgba[3]) <= 0.0) {
            bg = null
          }
          mat.color.setStyle(bg)
        }

        transform(types)
      }

      return types
    },
    css: function (el, traverse, unset) {
      // css style transforms
      const css = { scale: 1, radian: 0, degree: 0, transform: [] }
      if (traverse === undefined) {
        // target element original style
        //console.log('unset style', target)
        let style = window.getComputedStyle(el)
        css.style = {
          transform: style.transform,
          backgroundColor: style.backgroundColor
        }
      } else if (unset) {
        // quirks of DOM
        if (el.matches('details')) {
          el.open = traverse
        }
      }

      let els = []
      while (el && el !== document) {
        if (traverse === undefined) {
          // accumulate ancestor matrix
          const style = window.getComputedStyle(el)
          const transform = style.transform.replace(/(matrix)|[( )]/g, '')
          if (transform !== 'none') {
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
        } else {
          // style override
          traverse ? el.classList.add('unset') : el.classList.remove('unset')
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
      const m = new THREE.RawShaderMaterial({
        uniforms: {
          map: {
            type: 't',
            value: texAtlas
          },
          atlasSize: {
            type: 'f',
            value: texStep
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
        `,
        transparent: true
      })

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
      // Mesh
      let groups
      if (selector) {
        groups = mpos.var.scene.getObjectsByProperty('type', 'Group')
      }

      if (groups && groups.length) {
        for (let g = groups.length - 1; g >= 0; g--) {
          let group = groups[g].children || []
          for (let o = group.length - 1; o >= 0; o--) {
            let obj = group[o]
            if (obj.type === 'Mesh') {
              obj.geometry.dispose()
              let material = obj.material
              for (let m = material.length - 1; m >= 0; m--) {
                let mat = material[m]
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
      const clones = css3d.querySelectorAll(':not(.block)')
      clones.forEach(function (el) {
        el.parentElement.removeChild(el)
      })

      // Shader Atlas
      //let atlas = document.getElementById('atlas').children
      //for (let c = atlas.length - 1; c >= 0; c--) {
      // atlas[c].parentElement.removeChild(atlas[c])
      //}
    },
    loader: function (file, dummy) {
      let promise = new Promise((resolve, reject) => {
        // instantiate a loader: File, Audio, Object...
        let handler = file.match(/\.[0-9a-z]+$/i)
        handler = handler ? handler[0] : 'File'
        const loader = handler.toUpperCase() === '.SVG' ? new SVGLoader() : new THREE.FileLoader()

        loader.load(
          file,
          function (data) {
            let res = { data: data }
            console.log('load', data)
            if (handler.toUpperCase() === '.SVG') {
              const group = new THREE.Group()
              const paths = data.paths

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
              let scale = mpos.var.fov.max / Math.max(dummy.scale.x, dummy.scale.y)
              group.position.x = dummy.position.x
              group.position.y = dummy.position.y + dummy.scale.y / 2
              group.scale.multiplyScalar(1 / scale)
              group.scale.y *= -1

              group.name = 'SVG'
              mpos.var.group.add(group)
            }

            resolve(res)
            reject(res)
          },
          // called when loading is in progresses
          function (xhr) {
            console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
          },
          // called when loading has errors
          function (error) {
            console.log('An error happened')
          }
        )
      })

      //
      return promise
    }
  }
}

mpos.gen = function (num = 6, selector = 'main') {
  //img,ul,embed
  let lipsum = [
    'Lorem ipsum dolor sit amet. ',
    'Consectetur adipiscing elit. ',
    'Integer nec vulputate lacus. ',
    'Nunc at dolor lacus. ',
    'Vivamus eget magna quis nisi ultrices faucibus. ',
    'Phasellus eu sapien tellus. '
  ]

  function fill(element, length) {
    length = Math.floor(length) + 1
    let el = document.createElement(element)
    let len = Math.floor(Math.random() * length)
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

  let section = document.createElement('details')
  //section.classList.add('allow')
  let fragment = document.createDocumentFragment()
  for (let i = 0; i < num; i++) {
    // container
    let el = document.createElement('article')
    // heading
    el.appendChild(fill('h2', num))
    el.appendChild(fill('p', num * 2))
    // img
    let img = fill('img', -1)
    img.classList.add(i % 2 === 0 ? 'w50' : 'w100')
    img.style.height = '8em'
    img.style.backgroundColor = color()
    //img.src = './OIG.jpg'
    img.src = '#'
    el.appendChild(img)
    // list
    let ul = fill('ul', num / 2)
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
