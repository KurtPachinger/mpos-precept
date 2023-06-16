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
      selector: 'body',
      address: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 16,
      inPolar: 3,
      arc: false,
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
      side: THREE.FrontSide,
      color: 'cyan'
    }),
    mat_line: new THREE.LineBasicMaterial({
      transparent: true,
      //wireframe: true,
      side: THREE.FrontSide
    }),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2()
  },
  init: function () {
    const vars = mpos.var
    // containers
    const template = document.createElement('template')
    template.innerHTML = `
    <section id="mp">
      <address class="tool mp-offscreen">
        <object></object>
      </address>
      <aside class="tool mp-block" id="atlas">
        <a><canvas></canvas></a>
        <hr id="carot" />
      </aside>
      <div id="css3d"></div>
    </section>`
    document.body.appendChild(template.content)
    mpos.precept.canvas = document.querySelector('#atlas canvas')
    mpos.var.carot = document.getElementById('carot')

    // THREE
    vars.scene = new THREE.Scene()
    vars.camera = new THREE.PerspectiveCamera(45, vars.fov.w / vars.fov.h, 0.01, vars.fov.max * 4)
    //vars.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.5, 1.5)
    vars.camera.layers.enableAll()
    vars.camera.position.z = vars.fov.max

    vars.renderer = new THREE.WebGLRenderer()
    vars.renderer.setSize(vars.fov.w, vars.fov.h)
    document.getElementById('mp').appendChild(vars.renderer.domElement)
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
    css3d.querySelectorAll('div').forEach((el) => el.classList.add('mp-block'))
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
    gui.domElement.classList.add('mp-native')
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
            //console.log('ray', obj)
            const rect = grade.rects_.atlas_[hit.instanceId]
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
        // ...or parentElement?
        if (e.target.matches([mpos.precept.native, mpos.precept.native3d])) {
          console.log(e.target.tagName)
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
    manual: `.mp-loader,.mp-native,.mp-poster`.split(','),
    unset: `.mp-offscreen,details:not([open])`.split(','),
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
    update: function (grade) {
      console.log('grade', grade)
      const promise = new Promise((resolve, reject) => {
        function atlas(grade, idx = 0, opts = {}) {
          // element mat conversion
          if (opts.run === undefined) {
            opts.run = idx + opts.slice || grade.rects_.atlas
            opts.ctx = opts.ctx || grade.canvas.getContext('2d')
            opts.step = opts.step || grade.maxRes / grade.cells
            // keep unused references?
            //opts.trim = !(opts.trim === false) || true
          }

          function next() {
            idx++
            if (idx < opts.run) {
              atlas(grade, idx)
            } else {
              //if (opts.trim) {
              //grade.rects_atlas = Object.values(grade.rects_atlas).filter((rect) => rect.mat)
              //}
              // the atlas ends with 2 blocks: cyan and transparent
              opts.ctx.fillStyle = 'rgba(0,255,255,0.125)'
              opts.ctx.fillRect(grade.maxRes - opts.step, grade.maxRes - opts.step, opts.step, opts.step)

              transforms(grade)
            }
          }

          let rect = Object.values(grade.rects_.atlas_)[idx]
          if (rect.atlas !== undefined) {
            // style needs no transform, and block
            let unset = { transform: 'initial', margin: 0 }
            // bug: style display-inline is not honored by style override
            mpos.add.css(rect, true)
            toSvg(rect.el, { style: unset })
              .then(function (dataUrl) {
                mpos.add.css(rect, false)
                let img = new Image()
                img.onload = function () {
                  // canvas xy: from block top
                  let x = (rect.atlas % grade.cells) * opts.step
                  let y = (Math.floor(rect.atlas / grade.cells) % grade.cells) * opts.step
                  opts.ctx.drawImage(img, x, y, opts.step, opts.step)
                  // shader xy: from block bottom
                  // avoid 0 edge, so add 0.0001
                  rect.x = (0.0001 + x) / grade.maxRes
                  rect.y = (0.0001 + y + opts.step) / grade.maxRes

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
          for (const [index, rect] of Object.entries(grade.rects_.other_)) {
            // FileLoader or CSS3D

            console.log('other_')
            mpos.add.box(rect)
          }

          grade.ray = []

          const generic = grade.generic
          generic.instanceMatrix.setUsage(THREE.StaticDrawUsage)
          generic.count = grade.rects_.atlas
          generic.userData.el = grade.sel
          generic.name = [grade.index, grade.sel.tagName].join('_')
          generic.layers.set(2)

          // Meshes
          const cyan = { x: 1 - 1 / grade.cells, y: 0.0001 }
          const uvOffset = new Float32Array(grade.minEls * 2).fill(-1)

          for (const [index, rect] of Object.entries(grade.rects_.atlas_)) {
            // self, poster, child
            // Instance Matrix
            let dummy = mpos.add.box(rect)
            generic.setMatrixAt(index, dummy.matrix)
            // Instance Color
            const color = new THREE.Color()
            let bg = rect.css.style.backgroundColor
            const rgba = bg.replace(/(rgba)|[( )]/g, '').split(',')
            const alpha = Number(rgba[3])
            if (alpha <= 0.0) {
              bg = rect.mat !== 'poster' ? 'cyan' : null
            }
            generic.setColorAt(index, color.setStyle(bg))

            // Shader Atlas UV
            const stepSize = index * 2
            if (rect.atlas !== undefined || rect.mat === 'self') {
              uvOffset[stepSize] = rect.x || cyan.x
              uvOffset[stepSize + 1] = 1 - rect.y || cyan.y
            }
            if (rect.atlas !== undefined || rect.mat === 'child') {
              // raycast filter
              //if (grade.ray.indexOf(index) === -1) {
              grade.ray.push(Number(index))
              //}
            }
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

          console.log(grade)

          mpos.ux.render()

          resolve(grade)
          reject(grade)
        }
      })

      promise.catch((e) => console.log('err', e))
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
        sel: sel,
        index: precept.index++,
        minRes: 256,
        maxEls: 0,
        minEls: 0, // inPolar, but may be appended to...
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
        mpos.add.box({ el: document.body, z: -16, mat: 'wire' }, { sX: grade.sX, sY: grade.sY })
      }

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
            } else if (node.nodeName === '#text') {
              const orphan = node.parentNode.childElementCount >= 1 && node.parentNode.matches([precept.allow])
              if (orphan && precept.inPolar(node, grade.rects)) {
                // sanitize #text orphan (list or semantic) with parent visible
                let wrap = document.createElement('span')
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
      //grade.canvas.id = grade.index

      //

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
        const rect = grade.rects[sel.getAttribute('data-idx')]

        let mat = 'self'
        // specify empty or manual
        let children = sel.children
        const manual = rect.el.matches(precept.manual)
        if (!children.length || manual) {
          mat = setMat(rect.el, mat, manual, children.length)
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
                  const manual = node.matches(precept.manual)
                  const child = node.children.length

                  if (layer >= 1 && allow && !manual && child) {
                    // selector structure output depth
                    let depth = layer - 1
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

      // keep rects ARRAY
      // - can update HARD_REFRESH
      // - compare: batch, data-idx, props
      // - can push/pop
      // maintain two specific lists:
      // - rects_atlas {} (rect.atlas !== undefined, rect.mat == poster|self|child)
      // - rects_other {} (rect.mat === native|loader)
      //
      grade.rects_ = {
        atlas: 0,
        atlas_: {},
        other: 0,
        other_: {}
      }
      for (const [index, rect] of Object.entries(grade.rects)) {
        // make two good current lists
        if (rect.mat && rect.inPolar >= vars.opt.inPolar) {
          let type = rect.mat === 'native' || rect.mat === 'loader' ? 'other' : 'atlas'
          grade.rects_[type]++
          grade.rects_[type + '_'][rect.el.getAttribute('data-idx')] = rect
        }
      }

      // Instanced Mesh, shader atlas
      const shader = mpos.add.shader(grade.canvas, grade.cells)
      grade.generic = new THREE.InstancedMesh(
        vars.geo.clone(),
        [vars.mat, vars.mat, vars.mat, vars.mat, shader, vars.mat_line],
        grade.maxEls
      )

      // OUTPUT
      vars.group.userData.grade = grade
      vars.group.add(grade.generic)
      vars.scene.add(vars.group)

      grade.group = vars.group

      mpos.precept.update(grade)
    },
    box: function (rect, opts = {}) {
      const vars = mpos.var

      // css: cumulative transform
      rect.css = mpos.add.css(rect)
      // css: unset for box scale
      mpos.add.css(rect, true)

      let bound = rect.el.getBoundingClientRect()
      mpos.add.css(rect, false)

      // origin(0,0) follows viewport, not window
      const sX = opts.sX || 0
      const sY = -opts.sY || 0

      // scale
      const w = bound.width
      const h = bound.height
      const d = vars.fov.z
      // position
      bound = rect.unset ? bound : rect.el.getBoundingClientRect()
      const x = sX + (bound.width / 2 + bound.left)
      const y = sY - bound.height / 2 - bound.top
      let z = rect.z
      let zIndex = rect.css.zIndex
      zIndex = 1 - 1 / (zIndex || 1)
      z = Number((z * d + zIndex).toFixed(6))
      // arc
      const damp = 0.5
      const mid = vars.fov.w / 2
      const rad = (mid - x) / mid
      const pos = mid * Math.abs(rad)

      function transform(objects) {
        objects = Array.isArray(objects) ? objects : [objects]
        objects.forEach((obj) => {
          // tiny offset
          const stencil = obj.isCSS3DObject || rect.mat === 'loader'
          const extrude = stencil ? vars.fov.z : 0
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

      let object
      if (rect.mat === 'native') {
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
        const mesh = new THREE.Mesh(vars.geo, vars.mat)
        mesh.userData.el = rect.el
        mesh.animations = true
        object = mesh
      } else {
        // Instanced Mesh
        object = new THREE.Object3D()
      }

      transform(object)
      object.updateMatrix()

      // special
      if (rect.mat === 'loader') {
        let file = rect.el.data || rect.el.src || rect.el.href | 'source'
        mpos.add.loader(file, object)
      } else if (rect.mat === 'native' || rect.mat === 'wire') {
        vars.group.add(object)
      }

      // output
      const name = [rect.z, rect.mat, rect.el.nodeName].join('_')
      object.name = name

      return object
    },
    css: function (rect, traverse) {
      // css style transforms
      let el = rect.el
      const css = { scale: 1, radian: 0, degree: 0, transform: [] }
      if (traverse === undefined) {
        // target element original style
        //console.log('unset style', target)
        let style = window.getComputedStyle(el)
        css.style = {
          transform: style.transform,
          backgroundColor: style.backgroundColor,
          zIndex: style.zIndex
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

      let els = []
      while (el && el !== document.body) {
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
      const m = new THREE.RawShaderMaterial({
        transparent: true,
        depthTest: false,
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
        `
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
      const clones = css3d.querySelectorAll(':not(.mp-block)')
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
      if (!file) {
        return
      }

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
              group.scale.multiplyScalar(1 / scale)
              group.position.x = dummy.position.x - dummy.scale.x / 2
              group.position.y = dummy.position.y + dummy.scale.y / 2

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
  section.classList.add('mp-allow')
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
