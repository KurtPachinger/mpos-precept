import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { toPng } from 'html-to-image'

const mpos = {
  var: {
    batch: 0,
    opt: {
      dispose: true,
      selector: 'main',
      address: '',
      depth: 8,
      arc: false,
      update: function () {
        mpos.add
          .dom(mpos.var.opt.selector, mpos.var.opt.depth)
          .then((res) => {
            console.log(res)
            mpos.var.animate()
          })
          .catch((e) => {
            console.log('err', e) // "oh, no!"
          })
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
    })
  },
  init: function () {
    let vars = mpos.var
    // THREE
    vars.scene = new THREE.Scene()
    vars.camera = new THREE.PerspectiveCamera(60, vars.fov.w / vars.fov.h, 0.01, 1000)
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
    css3d.querySelectorAll('div').forEach(function (el) {
      el.classList.add('transform')
    })
    vars.controls = new OrbitControls(vars.camera, vars.rendererCSS.domElement)

    //
    mpos.ux(vars)
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

    // CSS
    let css3d = mpos.var.rendererCSS.domElement
    let clones = css3d.querySelectorAll(':not(.transform)')
    clones.forEach(function (el) {
      el.parentElement.removeChild(el)
    })

    // Texture Atlas
    let atlas = document.getElementById('atlas').children
    for (let c = atlas.length - 1; c >= 0; c--) {
      atlas[c].parentElement.removeChild(atlas[c])
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
        sel.querySelector('object').setAttribute('data', vars.opt.address)
      }

      // THREE housekeeping
      let dispose = vars.opt.dispose ? selector : false
      if (!update) {
        mpos.old(dispose)
        // new THREE group
        vars.group = new THREE.Group()
        vars.group.name = selector
        vars.group.userData.batch = vars.batch
        // root DOM node (viewport)
        mpos.add.box(document.body, 0, { mat: 'wire' })
      }

      // structure

      const precept = {
        allow: `.allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`.split(','),
        block: `.block,canvas[data-engine~='three.js'],head,style,script,link,meta,param,map,br,wbr,template`.split(','),
        native: `.native,a,iframe,frame,embed,object,svg,table,details,form,dialog,video,audio[controls]`.split(','),
        poster: `.poster,.pstr,canvas,picture,img,h1,h2,h3,h4,h5,h6,p,ul,ol,th,td,caption,dt,dd`.split(','),
        native3d: `model-viewer,a-scene,babylon,three-d-viewer,#stl_cont,#root,.sketchfab-embed-wrapper,StandardReality`.split(','),
        grade: {
          idx: mpos.var.batch++,
          hardmax: 256,
          softmax: 0,
          atlas: 0,
          els: {},
          txt: [],
          canvas: document.createElement('canvas')
        }
      }
      //let estimate = sel.querySelectorAll([precept.allow, precept.native, precept.poster]).length / 3
      // texture unit, relative to viewport resolution
      precept.grade.hardmax = Math.pow(2, Math.ceil(Math.max(mpos.var.fov.w, mpos.var.fov.h) / mpos.var.fov.max)) * 64
      //
      const grade = precept.grade

      let promise = new Promise((resolve, reject) => {
        function inPolar(node, control) {
          let vis = node.tagName || node.textContent.trim()
          if (typeof control === 'object') {
            // node relative in control plot
            vis = Object.values(control).some(function (tag) {
              let pe = node.parentElement.checkVisibility()
              return pe && node.compareDocumentPosition(tag.el) & Node.DOCUMENT_POSITION_CONTAINS
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
                  let rect = node.getBoundingClientRect()
                  let viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
                  vis = !(rect.bottom < 0 || rect.top - viewHeight >= 0)
                }
              }
            }
          }
          return vis
        }

        // flat-grade: filter, grade, sanitize
        let ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
        let node = ni.nextNode()
        while (node) {
          if (node.nodeName === '#comment') {
            // CDATA, php
            console.log('#comment', node.textContent)
          } else if (inPolar(node, -1)) {
            let el = false

            if (inPolar(node, 0)) {
              el = node
              //if (node.matches([precept.native, precept.poster])) {
              // ...estimate
              //}
            } else if (
              node.nodeName === '#text' &&
              node.parentNode.matches([precept.allow]) &&
              !node.parentNode.matches([precept.native, precept.poster]) &&
              inPolar(node, grade.els)
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
              el.idx = idx
              grade.els[idx] = { el: el }

              grade.softmax++
            }
          }

          node = ni.nextNode()
        }

        // deep-grade: type, count
        function report(el, z, mat) {
          el.mat = mat
          el.z = z
          grade.softmax--

          // shader
          if (el.mat === 'poster') {
            el.atlas = grade.atlas++
          }
        }
        function struct(sel, layer, grade) {
          //console.log('struct', layer, sel.nodeName)
          const z = layers - layer

          // SELF
          let el = grade.els[sel.idx]
          let mat = 'self'
          el && report(el, z, mat)

          // CHILD
          sel.childNodes.forEach(function (node) {
            let el = grade.els[node.idx]

            if (inPolar(node, 1)) {
              // CLASSIFY TYPE
              const block = node.matches(precept.block)
              const abort = grade.atlas >= grade.hardmax
              if (block || abort) {
                // ...or (#comment, xml, php)
                console.log('omit', node.nodeName)
              } else if (el) {
                const allow = node.matches(precept.allow)
                const manual = node.matches('.poster, .native')
                const empty = node.children.length === 0

                if (layer >= 1 && allow && !manual && !empty) {
                  // child structure
                  let depth = layer - 1
                  struct(node, depth, grade)
                } else {
                  // child interactive
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
            }
          })
        }

        struct(sel, layers, grade)

        // Shader Atlas
        const MAX_TEXTURE_SIZE = Math.min(grade.atlas * grade.hardmax, 16_384)
        grade.canvas.width = grade.canvas.height = MAX_TEXTURE_SIZE
        grade.canvas.id = grade.idx
        const ctx = grade.canvas.getContext('2d')

        // test gradient
        /*
      let grd = ctx.createLinearGradient(0, grade.canvas.height, 0, 0)
      grd.addColorStop(1, 'rgba(0, 0, 255, 0.25)')
      grd.addColorStop(0, 'rgba(0, 255, 255, 0.25)')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, grade.canvas.width, grade.canvas.height)
      */

        // scaling
        const step = grade.canvas.height / grade.atlas

        let load = grade.atlas
        for (const el of Object.values(grade.els)) {
          //todo: matrix slot for: self, child?
          if (typeof el.atlas === 'number') {
            toPng(el.el)
              .then(function (dataUrl) {
                let img = new Image()
                img.onload = function () {
                  // transform atlas
                  let block = el.atlas * step
                  ctx.drawImage(img, block, grade.canvas.height - step - block, step, step)
                  if (load && --load < 1) {
                    transforms()
                  }
                }

                img.src = dataUrl
              })
              .catch(function (e) {
                // some box problem
                console.log('error', e, el.el, e.target.classList)
                if (load) {
                  load = false
                  transforms()
                }
              })
          }
        }

        function transforms() {
          grade.els = Object.values(grade.els).filter((el) => el.mat)
          grade.softmax = grade.els.length
          // shader atlas
          let texIdx = new Float32Array(grade.softmax).fill(0)
          let shader = mpos.add.shader(grade.canvas, grade.atlas, grade.hardmax)

          // Instanced Mesh
          const generic = new THREE.InstancedMesh(vars.geo, [vars.mat, vars.mat, vars.mat, vars.mat, shader, null], grade.hardmax)
          generic.instanceMatrix.setUsage(THREE.StaticDrawUsage)
          generic.count = grade.softmax
          generic.userData.el = sel
          generic.name = [grade.idx, selector].join('_')
          vars.group.add(generic)

          // Meshes

          let dummy = new THREE.Object3D()
          for (const [index, el] of Object.entries(grade.els)) {
            //todo: matrix slot for: self, child?
            if (el.mat) {
              dummy = mpos.add.box(el.el, el.z, { dummy: dummy })
              generic.setMatrixAt(index, dummy.matrix)

              texIdx[index] = typeof el.atlas === 'number' ? el.atlas : grade.atlas

              if (el.mat === 'native') {
                mpos.add.box(el.el, el.z, { mat: el.mat })
              }
            }
          }
          vars.geo.setAttribute('texIdx', new THREE.InstancedBufferAttribute(texIdx, 1))
          generic.instanceMatrix.needsUpdate = true
          generic.computeBoundingSphere()

          // Output
          //generic.userData.grade = grade
          //console.log(grade)
          let link = document.createElement('a')
          let name = ['atlas', grade.idx, grade.atlas, MAX_TEXTURE_SIZE].join('_')
          link.title = link.download = name
          link.href = grade.canvas.toDataURL()
          link.appendChild(grade.canvas)
          document.getElementById('atlas').appendChild(link)

          // Output
          vars.group.scale.multiplyScalar(1 / vars.fov.max)
          vars.scene.add(vars.group)
          resolve(grade)
        }
      })

      return promise
    },

    box: function (element, z = 0, opt = {}) {
      const vars = mpos.var
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)

      // css transform (scale, angle)
      let scale = 1
      let rotate = 0
      let transform = style.transform.replace(/[matrix( )]/g, '')
      if (transform !== 'none') {
        const [a, b] = transform.split(',')
        scale = Math.sqrt(a * a + b * b)
        rotate = Math.round(Math.atan2(b, a) * (180 / Math.PI))
        rotate = rotate * (Math.PI / 180)
      }

      // scale
      const w = rect.width * scale
      const h = rect.height * scale
      const d = vars.fov.z
      // position
      const x = rect.width / 2 + rect.left
      const y = -(rect.height / 2) - rect.top
      let zIndex = style.zIndex
      zIndex = zIndex > 0 ? 1 - 1 / zIndex : 0
      z = Number((z * d + zIndex).toFixed(6))
      // arc
      const damp = 0.5
      const mid = vars.fov.w / 2
      const rad = (mid - x) / mid
      const pos = mid * Math.abs(rad)

      // Instanced Mesh
      if (opt.dummy) {
        opt.dummy.scale.set(w, h, d)
        opt.dummy.position.set(x, y, z)
        if (vars.opt.arc) {
          opt.dummy.rotation.y = rad * damp * 2
          opt.dummy.position.setZ(z + pos * damp)
        }
        opt.dummy.rotation.z = -rotate

        opt.dummy.updateMatrix()
        return opt.dummy
      }

      // Mesh One-Off
      const mesh = new THREE.Mesh(vars.geo, vars.mat)
      mesh.userData.el = element
      mesh.name = [z, opt.mat, element.nodeName].join('_')
      mesh.scale.set(w, h, d)
      mesh.position.set(x, y, z)

      // static or dynamic
      let types = [mesh]
      if (opt.mat === 'wire') {
        mesh.material.color.setStyle('cyan')
        mesh.material.opacity = 0.5
        mesh.animations = true
      } else {
        const map = vars.mat.clone()
        map.wireframe = false
        map.name = element.tagName
        mesh.material = map
        // todo: data-taxonomy...
        if (opt.mat === 'poster') {
          mesh.material = [vars.mat, vars.mat, vars.mat, vars.mat, map, null]
          toSvg(element).then(function (dataUrl) {
            map.map = new THREE.TextureLoader().load(dataUrl)
            map.needsUpdate = true
          })
        } else if (opt.mat === 'native') {
          const el = element.cloneNode(true)
          el.style.width = w
          el.style.height = h
          const css3d = new CSS3DObject(el)
          css3d.position.set(x, y, z + d / 2)
          css3d.name = ['CSS', element.nodeName].join('_')
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

      // rotation
      if (vars.opt.arc) {
        types.forEach((el) => {
          el.rotateY(rad * damp * 2)
          el.position.setZ(z + pos * damp)
        })
      }

      vars.group.add(...types)
    },
    shader: function (canvas, texStep) {
      let texAtlas = new THREE.CanvasTexture(canvas)

      texAtlas.minFilter = THREE.NearestFilter
      texStep = 1 / texStep
      let m = new THREE.MeshBasicMaterial({
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
    }
  },
  ux: function (vars) {
    // resize throttle
    function resize() {
      clearTimeout(vars.resize)
      vars.resize = setTimeout(function () {
        vars.fov.w = window.innerWidth
        vars.fov.h = window.innerHeight

        vars.camera.aspect = vars.fov.w / vars.fov.h
        vars.camera.updateProjectionMatrix()

        vars.renderer.setSize(vars.fov.w, vars.fov.h)
        vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
      }, 250)
    }
    window.addEventListener('resize', resize, false)

    // CSS3D interactive

    // RENDER LOOP
    mpos.var.animate = function () {
      //requestAnimationFrame(mpos.var.animate)
      const body = vars.group?.getObjectsByProperty('animations', true)
      if (body) {
        let time = new Date().getTime() / 100
        for (let i = 0; i < body.length; i++) {
          let wiggle = body[i]
          wiggle.rotation.x = Math.sin(time) / 10
          wiggle.rotation.y = Math.cos(time) / 10
        }
      }

      vars.renderer.render(vars.scene, vars.camera)
      vars.rendererCSS.render(vars.scene, vars.camera)
    }
    mpos.var.animate()
    vars.controls.addEventListener('change', mpos.var.animate)

    // GUI
    const gui = new GUI()

    Object.keys(vars.opt).forEach(function (key) {
      let p = []
      if (key === 'selector') p = [['body', 'main', '#media', '#text', '#transform', 'address']]
      if (key === 'depth') p = [0, 24, 1]

      gui.add(vars.opt, key, ...p)
    })
  }
}

mpos.gen = function (num = 4, selector = 'main') {
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
    el.classList.add(i % 2 === 0 ? 'w25' : 'w50')
    el.classList.add('w')
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
    el.appendChild(ul)
    ul.appendChild(fill('li', num * 3))
    ul.appendChild(fill('li', num * 6))
    ul.appendChild(fill('li', num * 2))

    fragment.appendChild(el)
  }
  section.appendChild(fragment)

  document.querySelector(selector).appendChild(section)
}

window.mpos = mpos

export default mpos
