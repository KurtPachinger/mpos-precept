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
      address: '',
      depth: 8,
      arc: false,
      update: function () {
        mpos.add.dom(mpos.var.opt.selector, mpos.var.opt.depth)
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
    vars.renderer.setClearColor(0x00ff00, 0)
    // helpers
    let axes = new THREE.AxesHelper(0.5)
    vars.scene.add(axes)

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
    css3d.appendChild(vars.rendererCSS.domElement)
    css3d.querySelectorAll('div').forEach(function (el) {
      el.classList.add('transform')
    })
    vars.controls = new OrbitControls(vars.camera, vars.rendererCSS.domElement)

    // ADD HTML ELEMENT
    mpos.add.dom()

    mpos.ux(vars)
  },
  old: function (selector) {
    // Mesh
    let groups
    if (selector) {
      groups = mpos.var.scene.getObjectsByProperty('type', 'Group')
    }
    //var i = arr.length - 1; i >= 0; i--
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
  },
  add: {
    dom: function (selector, layers = 8, update) {
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
        vars.group = new THREE.Group(selector)
        vars.group.name = selector
        // root DOM node (viewport)
        mpos.add.box(document.body, -1, { mat: 'wire' })
      }

      // structure
      const precept = {
        allow: '.allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address'.split(','),
        block: '.block,canvas[data-engine],head,style,script,link,meta,param,map,br,wbr,template'.split(','),
        native: '.native,iframe,frame,embed,object,table,details,form,video,audio,a,dialog'.split(','),
        poster: '.poster,.text,canvas,img,svg,h1,h2,h3,h4,h5,h6,p,li,ul,ol,th,td,caption,dt,dd'.split(','),
        grade: {
          idx: mpos.var.batch++,
          softmax: 0,
          interactive: 0,
          els: {},
          txt: [],
          MAX_TEXTURE_SIZE: 8192,
          canvas: document.createElement('canvas')
        }
      }
      const grade = precept.grade

      function inPolar(node, control = 0) {
        let vis = node.tagName || node.textContent.trim()
        // -1: node not empty
        if (control > -1) {
          // 0: node is tag
          vis = node.tagName
          if (vis && control > 0) {
            // 1: node not hidden
            vis = node.checkVisibility()
            if (control > 1) {
              // 2: node in viewport
              let rect = node.getBoundingClientRect()
              let viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight)
              vis = !(rect.bottom < 0 || rect.top - viewHeight >= 0)
            }
          }
        }
        return vis
      }

      // flat-grade: filter, grade, sanitize
      let ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      let node = ni.nextNode()
      while (node) {
        if (inPolar(node, -1)) {
          const idx = [grade.softmax, grade.idx].join('_')

          if (inPolar(node, 1)) {
            grade.els[idx] = { el: node }
            if (node.matches([precept.native, precept.poster])) {
              grade.interactive++
            }
          } else if (
            node.nodeName === '#text' &&
            node.parentNode.matches([precept.allow]) &&
            !node.parentNode.matches([precept.native, precept.poster])
          ) {
            // text orphan with parent visible
            // ...potentially another type (#comment, xml, php)
            let parentView = Object.keys(grade.els).some(function (tag) {
              return node.compareDocumentPosition(grade.els[tag].el) & Node.DOCUMENT_POSITION_PRECEDING
            })

            if (parentView) {
              // sanitize, block-level required for width
              let wrap = document.createElement('div')
              wrap.classList.add('text')
              node.parentNode.insertBefore(wrap, node)
              wrap.appendChild(node)
              grade.els[idx] = { el: wrap }
              grade.txt[idx] = { el: node }
              wrap.idx = idx
              grade.interactive++
            }
          }
          node.idx = idx
          grade.softmax++
        }

        node = ni.nextNode()
      }

      // deep-grade: type, count
      function struct(sel, layer, grade) {
        //console.log('struct', layer, sel.nodeName)

        // SELF
        let mat = 'self'
        let el = grade.els[sel.idx]
        if (el) {
          el.mat = mat
          el.z = layers - layer
        }

        // CHILD
        sel.childNodes.forEach(function (node) {
          if (inPolar(node, 2)) {
            // CLASSIFY TYPE
            const block = node.matches(precept.block)
            const abort = grade.softmax < 1
            if (block || abort) {
              console.log('END', node.nodeName)
            } else {
              grade.softmax--

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
                if (node.matches(precept.poster)) {
                  mat = 'poster'
                } else if (node.matches(precept.native)) {
                  mat = 'native'
                }

                el = grade.els[node.idx]
                if (el) {
                  el.mat = mat
                  el.z = layers - layer
                }
              }
            }
          }
        })
      }

      struct(sel, layers, grade)

      // Texture Atlas
      grade.canvas.width = grade.canvas.height = grade.MAX_TEXTURE_SIZE
      grade.canvas.id = grade.idx
      for (const el of Object.values(grade.els)) {
        //todo: matrix slot for: self, child?
        if (el.mat) {
          toSvg(el.el).then(function (dataUrl) {
            var img = new Image()
            img.src = dataUrl
            // transforms
            const max = grade.canvas.width
            const step = max / grade.softmax
            let ratio = Math.max(img.width, img.height) / step
            let idx = Number(el.el.idx.split('_')[0])
            let x = idx * step
            let y = max - step * idx - step
            // output
            const ctx = grade.canvas.getContext('2d')
            ctx.drawImage(img, x, y, img.width * ratio, img.height * ratio)
          })
        }
      }
      let texAtlas = new THREE.CanvasTexture(grade.canvas)
      let texStep = 1 / grade.softmax
      let shader = mpos.add.shader(texAtlas, texStep)

      // Instanced Mesh
      const generic = new THREE.InstancedMesh(vars.geo, shader, grade.MAX_TEXTURE_SIZE)
      generic.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      generic.count = grade.softmax
      generic.userData.el = sel
      generic.name = [grade.idx, selector].join('_')
      vars.group.add(generic)

      // Meshes
      for (const el of Object.values(grade.els)) {
        //todo: matrix slot for: self, child?
        if (el.mat) {
          mpos.add.box(el.el, el.z, { mat: el.mat })
        }
      }

      // Output
      let output = document.querySelector('#output')
      output.innerHTML = ''
      output.appendChild(grade.canvas)
      console.log(grade)

      // Output
      vars.group.scale.multiplyScalar(1 / vars.fov.max)
      vars.scene.add(vars.group)
    },

    box: function (element, z = 0, opt = {}) {
      const vars = mpos.var
      //const geo = mpos.var.geo.clone()
      const mat = vars.mat
      const mesh = new THREE.Mesh(vars.geo, mat)

      mesh.userData.el = element
      mesh.name = [z, opt.mat, element.nodeName].join('_')

      const rect = element.getBoundingClientRect()
      // scale
      const w = rect.width
      const h = rect.height
      const d = vars.fov.z
      mesh.scale.set(w, h, d)
      // position
      const x = rect.width / 2 + rect.left
      const y = -(rect.height / 2) - rect.top
      z = z * d
      mesh.position.set(x, y, z)

      // static or dynamic
      let types = [mesh]
      if (opt.mat === 'wire') {
        mat.color.setStyle('cyan')
        mat.opacity = 0.5
      } else {
        const map = mat.clone()
        map.wireframe = false
        map.name = element.tagName
        mesh.material = map
        // todo: data-taxonomy...
        if (opt.mat === 'poster') {
          mesh.material = [mat, mat, mat, mat, map, null]

          toSvg(element).then(function (dataUrl) {
            const grade = opt.grade
            if (grade) {
              var img = new Image()
              img.src = dataUrl
              // transforms
              const max = grade.canvas.width
              const step = max / grade.softmax
              let ratio = Math.max(img.width, img.height) / step
              let idx = Number(element.idx.split('_')[0])
              let x = idx * step
              let y = max - step * idx - step
              // output
              const ctx = grade.canvas.getContext('2d')
              ctx.drawImage(img, x, y, img.width * ratio, img.height * ratio)
            }
            map.map = new THREE.TextureLoader().load(dataUrl)
            map.needsUpdate = true
          })
        } else if (opt.mat === 'native') {
          const el = element.cloneNode(true)
          const css3d = new CSS3DObject(el)
          css3d.position.set(x, y, z + d / 2)
          css3d.name = ['CSS', element.nodeName].join('_')
          types.push(css3d)
        }
        let style = window.getComputedStyle(element)
        let bg = style.backgroundColor
        let alpha = bg.replace(/[rgba()]/g, '').split(',')[3]
        //console.log('alpha', alpha, element.nodeName)
        if (alpha <= 0) {
          bg = 'transparent'
        }
        //
        //if(!element.classList.contains('text')){
        map.color.setStyle(bg)
        //}

        //console.log(element, opt.m, mesh.material)
      }

      // rotation
      if (vars.opt.arc) {
        const damp = 0.5
        const mid = vars.fov.w / 2
        const rad = (mid - x) / mid
        const pos = mid * Math.abs(rad)
        types.forEach((el) => {
          el.rotateY(rad * damp * 2)
          el.position.setZ(z + pos * damp)
        })
      }

      vars.group.add(...types)
    },
    shader: function (image, step) {
      let texAtlas = new THREE.TextureLoader().load(image)
      let m = new THREE.MeshLambertMaterial({
        onBeforeCompile: (shader) => {
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
          
           vec2 blockUv = ${step} * (floor(vTexIdx + 0.1) + vUv); 
          vec4 blockColor = texture(texAtlas, blockUv);
          diffuseColor *= blockColor;
        `
          )
          //console.log(shader.fragmentShader)
        }
      })
      m.defines = { USE_UV: '' }
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
    const block = document.getElementById('block')
    block.style.display = 'none'

    vars.controls.addEventListener('start', function () {
      block.style.display = ''
    })
    vars.controls.addEventListener('end', function () {
      block.style.display = 'none'
    })

    // RENDER LOOP
    //vars.controls.addEventListener('change', animate)

    function animate() {
      requestAnimationFrame(animate)
      const body = vars.group.getObjectsByProperty('name', '-1_wire_BODY')
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
    animate()

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

export default mpos
