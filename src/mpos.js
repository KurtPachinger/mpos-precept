import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { toSvg } from 'html-to-image'

const mpos = {
  var: {
    batch: 0,
    opt: {
      dispose: true,
      selector: 'main',
      address: '//upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
      depth: 8,
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
      max: 1920
    },
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({
      transparent: true,
      wireframe: true,
      side: THREE.FrontSide
    }),
    mat_line: new THREE.MeshBasicMaterial({
      transparent: true,
      wireframe: true,
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
    vars.camera = new THREE.PerspectiveCamera(60, vars.fov.w / vars.fov.h, 0.01, 1000)
    vars.camera.layers.enableAll()
    vars.camera.position.z = 1

    vars.renderer = new THREE.WebGLRenderer()
    vars.renderer.setSize(vars.fov.w, vars.fov.h)
    document.body.appendChild(vars.renderer.domElement)
    vars.renderer.setClearColor(0x000000, 0)
    // helpers
    let axes = new THREE.AxesHelper(0.5)
    vars.scene.add(axes)
    const pointLight = new THREE.PointLight(0xc0c0c0, 2, 10)
    pointLight.position.set(0, 2, 5)
    vars.scene.add(pointLight)

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
    css3d.appendChild(vars.rendererCSS.domElement)
    css3d.querySelectorAll('div').forEach((el) => el.classList.add('block'))
    vars.controls = new OrbitControls(vars.camera, vars.rendererCSS.domElement)
    vars.controls.target.setY(-(vars.fov.h * (1 / vars.fov.max)))
    vars.controls.update()

    // live
    window.addEventListener('resize', mpos.ux.resize, false)
    vars.controls.addEventListener('change', mpos.ux.render, false)
    window.addEventListener('pointermove', mpos.ux.raycast, false)
    vars.raycaster.layers.set(2)
    mpos.ux.render()

    const gui = new GUI()
    Object.keys(vars.opt).forEach(function (key) {
      let param = []
      if (key === 'selector') param = [['body', 'main', '#text', '#media', '#transform', 'address']]
      if (key === 'depth') param = [0, 32, 1]

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
        vars.raycaster.setFromCamera(vars.pointer, vars.camera)
        let intersects = vars.raycaster.intersectObjects(vars.group.children, false)

        if (intersects.length) {
          intersects = intersects.filter(function (hit) {
            let idx = hit.instanceId
            let ray = hit.object.userData.grade.ray
            let keep = ray.indexOf(idx) > -1

            return keep
          })

          if (intersects.length) {
            //console.log('intersects', intersects)
            const hit = intersects[0]
            const obj = hit.object

            let carot = vars.carot.style
            if (obj) {
              const idx = hit.instanceId
              let el
              if (obj.isInstancedMesh) {
                el = obj.userData.grade.els[idx]
              } else if (obj.isMesh || obj.isCSS3DObject) {
                el = obj.userData.el
              }
              const vis = mpos.precept.inPolar(el.el, 2)
              const color = vis ? 'rgba(0,255,0,0.66)' : 'rgba(255,0,0,0.66)'
              carot.backgroundColor = color
              let block = 100 * (1 / vars.group.userData.atlas)
              carot.width = carot.height = block + '%'
              if (el.atlas) {
                carot.left = carot.bottom = el.atlas * block + '%'
              } else {
                carot.width = '100%'
                carot.left = carot.bottom = 0
              }
            }
          }
        }
      }
    }
  },
  precept: {
    batch: 0,
    allow: `.allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
    block: `.block,canvas[data-engine~='three.js'],head,style,script,link,meta,applet,param,map,br,wbr,template`.split(','),
    native: `.native,a,iframe,frame,embed,object,svg,table,details,form,dialog,video,audio[controls]`.split(','),
    poster: `.poster,.pstr,canvas,picture,img,h1,h2,h3,h4,h5,h6,p,ul,ol,th,td,caption,dt,dd`.split(','),
    native3d: `model-viewer,a-scene,babylon,three-d-viewer,#stl_cont,#root,.sketchfab-embed-wrapper,StandardReality`.split(','),
    inPolar: function (node, control) {
      let vis = node.tagName || node.textContent.trim()
      if (typeof control === 'object') {
        // node relative in control plot
        vis = Object.values(control).some(function (tag) {
          const unlist = node.parentElement.checkVisibility()
          return unlist && node.compareDocumentPosition(tag.el) & Node.DOCUMENT_POSITION_CONTAINS
        })
      } else {
        // -1: node not empty
        if (control >= 0) {
          // 0: node is tag
          vis = node.tagName
          if (vis && control >= 1) {
            // 1: tag not hidden
            vis = node.checkVisibility()
            if (control >= 2) {
              // 2: tag in viewport
              const rect = node.getBoundingClientRect()
              const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
              vis = !(rect.bottom < 0 || rect.top - viewHeight >= 0)
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

      // THREE cleanup
      let dispose = vars.opt.dispose ? selector : false
      if (!update) {
        mpos.add.old(dispose)
        // new THREE group
        vars.group = new THREE.Group()
        vars.group.name = selector
        vars.group.userData.batch = mpos.precept.batch
        // root DOM node (viewport)
        const mesh = mpos.add.box({ el: document.body, z: 0, mat: 'wire' })
        vars.group.add(...mesh)
      }

      // structure
      const precept = mpos.precept
      const grade = {
        idx: precept.batch++,
        hardmax: 256,
        softmax: 0,
        atlas: 0,
        els: {},
        txt: [],
        canvas: document.querySelector('#atlas canvas')
      }
      // texture unit, relative to viewport resolution
      grade.hardmax = Math.pow(2, Math.ceil(Math.max(vars.fov.w, vars.fov.h) / vars.fov.max)) * 64
      //let estimate = sel.querySelectorAll([precept.allow, precept.native, precept.poster]).length / 3

      const promise = new Promise((resolve, reject) => {
        // FLAT-GRADE: filter, grade, sanitize
        let ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
        let node = ni.nextNode()
        while (node) {
          if (node.nodeName === '#comment') {
            // #comment... (or CDATA, xml, php)
            console.log('#comment', node.textContent)
          } else if (precept.inPolar(node, -1)) {
            let el = false

            if (precept.inPolar(node, 0)) {
              el = node
              // ...estimate
              //if (node.matches([precept.native, precept.poster])) {}
            } else if (
              node.nodeName === '#text' &&
              node.parentNode.matches([precept.allow]) &&
              !node.parentNode.matches([precept.native, precept.poster]) &&
              precept.inPolar(node, grade.els)
            ) {
              // #text orphan with parent visible
              // sanitize, block-level required for width
              let wrap = document.createElement('div')
              wrap.classList.add('pstr')
              node.parentNode.insertBefore(wrap, node)
              wrap.appendChild(node)

              el = wrap
              grade.txt.push(node)
            }

            if (el) {
              // static list
              const idx = grade.softmax
              el.setAttribute('data-idx', idx)
              grade.els[idx] = { el: el }
              grade.softmax++
            }
          }

          node = ni.nextNode() || (grade.softmax = 0)
        }

        // DEEP-GRADE: type, count
        function report(el, z, mat) {
          el.mat = mat
          el.z = z
          // shader
          grade.softmax++
          if (el.mat === 'poster') {
            el.atlas = grade.atlas++
          }
        }

        function struct(sel, layer) {
          const z = layers - layer

          // SELF
          let el = grade.els[sel.getAttribute('data-idx')]
          let mat = 'self'
          el && report(el, z, mat)

          // CHILD
          let children = sel.children
          for (let i = 0; i < children.length; i++) {
            let node = children[i]
            let el = grade.els[node.getAttribute('data-idx')]

            if (precept.inPolar(node, 1)) {
              // CLASSIFY TYPE
              const block = node.matches(precept.block)
              const abort = grade.atlas >= grade.hardmax
              if (block || abort) {
                console.log('skip', node.nodeName)
              } else if (el) {
                const allow = node.matches(precept.allow)
                const manual = node.matches('.poster, .native')
                const empty = node.children.length === 0

                if (layer >= 1 && allow && !manual && !empty) {
                  // selector structure output depth
                  let depth = layer - 1
                  struct(node, depth)
                } else {
                  // element type output quality
                  mat = 'child'
                  if (node.matches([precept.native, precept.native3d])) {
                    mat = 'native'
                    // todo: test internal type
                    // node.tagName [iframe,object,embed,svg...] attribute [src,data]
                    // native: ==100%, [html,swf,pdf]
                    // poster: <=512, [jpg]
                  } else if (node.matches(precept.poster)) {
                    mat = 'poster'
                  }

                  report(el, z, mat)
                }
              }
              //
            }

            //
          }
        }

        struct(sel, layers)

        // TEXTURE shader atlas
        const MAX_TEXTURE_SIZE = Math.min(grade.atlas * grade.hardmax, 16_384)
        grade.canvas.width = grade.canvas.height = MAX_TEXTURE_SIZE
        grade.canvas.id = grade.idx

        // scaling
        function atlas(grade, idx = 0, opts = {}) {
          //opts: slice, filter, retry, step
          if (opts.run === undefined) {
            opts.run = opts.slice || Object.keys(grade.els).length
            opts.ctx = opts.ctx || grade.canvas.getContext('2d')
            opts.step = opts.step || grade.canvas.height / grade.atlas
            // keep unused references?
            opts.trim = !(opts.trim === false) || true
          }

          function next() {
            idx++
            if (idx < opts.run) {
              atlas(grade, idx)
            } else {
              if (opts.trim) {
                grade.els = Object.values(grade.els).filter((el) => el.mat)
              }
              transforms(grade)
            }
          }

          let el = grade.els[idx]
          if (el && typeof el.atlas === 'number') {
            //let reset = { transform: 'initial!important' }
            toSvg(el.el)
              .then(function (dataUrl) {
                let img = new Image()
                img.onload = function () {
                  // Instanced Mesh shader atlas
                  const block = el.atlas * opts.step
                  opts.ctx.drawImage(img, block, grade.canvas.height - opts.step - block, opts.step, opts.step)
                  next()
                }
                img.src = dataUrl
              })
              .catch(function (e) {
                // some box problem... error retry count?
                console.log('err', e, el.el, e.target.classList)
                next()
              })
          } else {
            next()
          }
        }
        atlas(grade)

        function transforms(grade) {
          console.log('transforms', grade)
          grade.ray = []

          // shader atlas
          let texIdx = new Float32Array(grade.softmax).fill(0)
          let shader = mpos.add.shader(grade.canvas, grade.atlas, grade.hardmax)

          // Instanced Mesh
          const generic = new THREE.InstancedMesh(vars.geo, [vars.mat, vars.mat, vars.mat, vars.mat, shader, vars.mat_line], grade.hardmax)
          generic.instanceMatrix.setUsage(THREE.StaticDrawUsage)
          generic.count = grade.softmax
          generic.userData.el = sel
          generic.userData.grade = grade
          generic.name = [grade.idx, selector].join('_')
          vars.group.add(generic)
          generic.layers.set(2)

          // Meshes
          let dummy = new THREE.Object3D()
          for (const [index, el] of Object.entries(grade.els)) {
            if (el.mat) {
              el.matrix = mpos.add.css(el.el)

              dummy = mpos.add.box(el, { dummy: dummy })
              generic.setMatrixAt(index, dummy.matrix)

              // shader uv
              texIdx[index] = typeof el.atlas === 'number' ? el.atlas : grade.atlas

              if (el.mat === 'native') {
                let mesh = mpos.add.box(el)
                vars.group.add(mesh[1])
              } else if (el.mat === 'poster') {
                grade.ray.push(Number(index))
              }
            }
          }

          vars.geo.setAttribute('texIdx', new THREE.InstancedBufferAttribute(texIdx, 1))

          generic.instanceMatrix.needsUpdate = true
          generic.computeBoundingSphere()

          // UI texture
          let link = document.querySelector('#atlas a')
          let name = ['atlas', grade.idx, grade.atlas, MAX_TEXTURE_SIZE].join('_')
          link.title = link.download = name
          link.href = grade.canvas.toDataURL()
          //link.appendChild(grade.canvas)
          //document.getElementById('atlas').appendChild(link)

          // OUTPUT
          vars.group.userData.atlas = grade.atlas
          vars.group.scale.multiplyScalar(1 / vars.fov.max)
          vars.scene.add(vars.group)

          grade.group = vars.group
          console.log(grade)
          resolve(grade)
          reject(grade)
        }
      })

      return promise
    },
    box: function (el, opt = {}) {
      const vars = mpos.var
      const element = el.el
      mpos.add.css(el.el, true)
      const rect = element.getBoundingClientRect()
      mpos.add.css(el.el, false)
      const style = window.getComputedStyle(element)

      // css transform (scale, angle)

      const matrix = el.matrix ? el.matrix : { scale: 1, rotate: 0 }
      const scale = matrix.scale
      const rotate = matrix.rotate

      // scale
      const w = rect.width * scale
      const h = rect.height * scale
      const d = vars.fov.z
      // position
      const x = rect.width / 2 + rect.left
      const y = -(rect.height / 2) - rect.top
      let z = el.z
      let zIndex = style.zIndex
      zIndex = zIndex > 0 ? 1 - 1 / zIndex : 0
      z = Number((z * d + zIndex).toFixed(6))
      // arc
      const damp = 0.5
      const mid = vars.fov.w / 2
      const rad = (mid - x) / mid
      const pos = mid * Math.abs(rad)

      function transform(objects) {
        objects.forEach((obj) => {
          if (!obj.isCSS3DObject) {
            obj.scale.set(w, h, d)
          }
          obj.rotation.z = -rotate
          obj.position.set(x, y, z)

          if (vars.opt.arc) {
            obj.rotation.y = rad * damp * 2
            obj.position.setZ(z + pos * damp)
          }
        })
      }

      let types = []

      if (opt.dummy) {
        // Instanced Mesh
        types.push(opt.dummy)
        transform(types)
        opt.dummy.updateMatrix()
        types = opt.dummy
      } else {
        // Mesh Singleton
        const name = [el.z, el.mat, element.nodeName].join('_')
        const mesh = new THREE.Mesh(vars.geo, vars.mat)
        mesh.scale.set(w, h, d)
        mesh.userData.el = el
        mesh.name = name

        types.push(mesh)
        if (el.mat === 'wire') {
          mesh.material.color.setStyle('cyan')
          mesh.animations = true
        } else {
          const map = vars.mat.clone()
          map.wireframe = false
          map.name = element.tagName
          mesh.material = map

          // static or dynamic
          //let reset = { transform: 'initial!important;' }
          if (opt.mat === 'poster') {
            mesh.material = [vars.mat, vars.mat, vars.mat, vars.mat, map, vars.mat_line]
            toSvg(element)
              .then(function (dataUrl) {
                map.map = new THREE.TextureLoader().load(dataUrl)
                map.needsUpdate = true
              })
              .catch((e) => console.log('err', e))
          } else if (el.mat === 'native') {
            const el = element.cloneNode(true)
            el.style.width = w
            el.style.height = h
            const css3d = new CSS3DObject(el)
            css3d.userData.el = el
            css3d.name = name
            types.push(css3d)
          }

          let bg = style.backgroundColor
          let alpha = Number(bg.replace(/[rgba( )]/g, '').split(',')[3])
          //console.log('alpha', alpha, element.nodeName)'
          map.opacity = alpha
          if (alpha <= 0) {
            bg = null
            //map.blending = THREE.MultiplyBlending
          }
          map.color.setStyle(bg)
          //console.log(element, opt.m, mesh.material)
        }

        transform(types)
      }

      return types
    },
    css: function (el, unset) {
      // css style transforms
      const matrix = { scale: 1, rotate: 0 }
      var els = []
      while (el && el !== document) {
        if (unset === undefined) {
          // ancestors cumulative matrix
          const style = window.getComputedStyle(el)
          const transform = style.transform.replace(/[matrix( )]/g, '')
          if (transform !== 'none') {
            const [a, b] = transform.split(',')
            matrix.scale *= Math.sqrt(a * a + b * b)
            const degree = Math.round(Math.atan2(b, a) * (180 / Math.PI))
            matrix.rotate += degree * (Math.PI / 180)
          }
        } else {
          // style override
          unset ? el.classList.add('unset') : el.classList.remove('unset')
        }

        els.unshift(el)
        el = el.parentNode
      }

      return matrix
    },
    shader: function (canvas, texStep) {
      const texAtlas = new THREE.CanvasTexture(canvas)
      texAtlas.minFilter = THREE.NearestFilter
      texStep = 1 / texStep
      const m = new THREE.MeshBasicMaterial({
        transparent: true,
        color: 'cyan',
        onBeforeCompile: (shader) => {
          m.userData.s = shader
          shader.uniforms.texAtlas = { value: texAtlas }
          shader.vertexShader = `
        attribute float texIdx;
        varying float vTexIdx;
        ${shader.vertexShader}
      `.replace(
            `void main() {`,
            `void main() {
        vTexIdx = texIdx;
        `
          )
          //console.log(shader.vertexShader);
          shader.fragmentShader = `
        uniform sampler2D texAtlas;
        varying float vTexIdx;
        ${shader.fragmentShader}
      `.replace(
            `#include <map_fragment>`,
            `#include <map_fragment>
          
            vec2 blockUv = ${texStep} * (floor(vTexIdx + 0.1) + vUv);
            vec4 blockColor = texture(texAtlas, blockUv);
        
        diffuseColor *= blockColor;
        `
          )

          //console.log(shader.fragmentShader)
        }
      })
      m.defines = { USE_UV: '' }
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
  section.classList.add('allow')
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
