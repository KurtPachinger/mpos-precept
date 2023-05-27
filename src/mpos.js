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
    let atlas = document.querySelector('#atlas canvas')
    atlas && atlas.parentNode.removeChild(atlas)
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
        vars.group = new THREE.Group()
        vars.group.name = selector
        vars.group.userData.batch = vars.batch
        // root DOM node (viewport)
        mpos.add.box(document.body, 0, { mat: 'wire' })
      }

      // structure
      const precept = {
        allow: '.allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address'.split(','),
        block: '.block,canvas[data-engine],head,style,script,link,meta,param,map,br,wbr,template'.split(','),
        native: '.native,iframe,frame,embed,object,table,details,form,video,audio,a,dialog'.split(','),
        poster: '.poster,.pstr,canvas,img,svg,h1,h2,h3,h4,h5,h6,p,ul,ol,th,td,caption,dt,dd'.split(','),
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
      const grade = precept.grade

      function inPolar(node, control) {
        let vis = node.tagName || node.textContent.trim()
        if (typeof control === 'object') {
          // node relative in control plot
          vis = Object.keys(control).some(function (tag) {
            return node.compareDocumentPosition(control[tag].el) & Node.DOCUMENT_POSITION_PRECEDING
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
      let ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      let node = ni.nextNode()
      while (node) {
        if (inPolar(node, -1)) {
          let el = false
          if (inPolar(node, 1)) {
            el = node
            if (node.matches([precept.native, precept.poster])) {
              // ...ballpark
            }
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
          el.atlas = grade.atlas
          grade.atlas++
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

          if (inPolar(node, 2)) {
            // CLASSIFY TYPE
            const block = node.matches(precept.block)
            const abort = grade.atlas >= grade.hardmax
            if (block || abort) {
              // ...or (#comment, xml, php)
              console.log('END', node.nodeName)
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
                if (node.matches(precept.native)) {
                  mat = 'native'
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
      grade.canvas.width = grade.hardmax
      grade.canvas.height = grade.atlas * grade.hardmax
      grade.canvas.id = grade.idx
      const ctx = grade.canvas.getContext('2d')

      // test gradient
      let grd = ctx.createLinearGradient(0, grade.canvas.height, 0, 0)
      grd.addColorStop(1, 'rgba(0, 0, 255, 0.25)')
      grd.addColorStop(0, 'rgba(0, 255, 255, 0.25)')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, grade.canvas.width, grade.canvas.height)

      // scaling
      const step = grade.canvas.height / grade.atlas

      let loading = grade.atlas
      for (const el of Object.values(grade.els)) {
        //todo: matrix slot for: self, child?
        if (typeof el.atlas === 'number') {
          toSvg(el.el).then(function (dataUrl) {
            let img = new Image()
            img.onload = function () {
              // transform atlas
              let block = el.atlas * step
              ctx.drawImage(img, 0, grade.canvas.height - step - block, step, step)
              if (--loading < 1) {
                transforms()
              }
            }
            img.src = dataUrl
          })
        }
      }

      function transforms() {
        // shader atlas
        let texIdx = new Float32Array(grade.atlas).fill(0)
        let shader = mpos.add.shader(grade.canvas, grade.atlas)

        // Instanced Mesh
        const generic = new THREE.InstancedMesh(vars.geo, [vars.mat, vars.mat, vars.mat, vars.mat, shader, null], grade.hardmax)
        generic.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        generic.count = grade.softmax - grade.atlas - 1
        generic.userData.el = sel
        generic.name = [grade.idx, selector].join('_')
        vars.group.add(generic)

        // Meshes

        let i = grade.atlas
        let dummy = new THREE.Object3D()
        for (const el of Object.values(grade.els)) {
          //todo: matrix slot for: self, child?
          if (el.mat) {
            let which = typeof el.atlas === 'number' ? el.atlas : ++i
            dummy = mpos.add.box(el.el, el.z, { dummy: dummy })
            generic.setMatrixAt(which, dummy.matrix)
            if (el.mat === 'poster') {
              texIdx[el.atlas] = el.atlas
            }

            //mpos.add.box(el.el, el.z, { mat: el.mat })
          }
        }
        vars.geo.setAttribute('texIdx', new THREE.InstancedBufferAttribute(texIdx, 1))
        generic.instanceMatrix.needsUpdate = true
        generic.computeBoundingSphere()

        // Output
        document.getElementById('atlas').appendChild(grade.canvas)
        console.log(grade)

        // Output
        vars.group.scale.multiplyScalar(1 / vars.fov.max)
        vars.scene.add(vars.group)
      }
    },

    box: function (element, z = 0, opt = {}) {
      const vars = mpos.var

      const rect = element.getBoundingClientRect()
      // scale
      const w = rect.width
      const h = rect.height
      const d = vars.fov.z
      // position
      const x = rect.width / 2 + rect.left
      const y = -(rect.height / 2) - rect.top
      let zIndex = window.getComputedStyle(element).zIndex
      zIndex = zIndex > 0 ? 1 - 1 / zIndex : 0
      z = z * d + zIndex
      z = +z.toFixed(6)
      // rotation
      const damp = 0.5
      const mid = vars.fov.w / 2
      const rad = (mid - x) / mid
      const pos = mid * Math.abs(rad)

      // Instanced Mesh
      if (opt.dummy) {
        opt.dummy.scale.set(w, h, d)
        opt.dummy.position.set(x, y, z)
        if (vars.opt.arc) {
          opt.dummy.rotation.set(0, rad * damp * 2, 0)
          opt.dummy.position.setZ(z + pos * damp)
        }
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
        types.forEach((el) => {
          el.rotateY(rad * damp * 2)
          el.position.setZ(z + pos * damp)
        })
      }

      vars.group.add(...types)
    },
    shader: function (canvas, texStep) {
      let texAtlas = new THREE.CanvasTexture(canvas)
      texStep = 1 / texStep
      let m = new THREE.MeshBasicMaterial({
        transparent: true,
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
          
            vec2 end = (${texStep} * (floor(vTexIdx + 0.1) + vUv), vUv );
            vec4 blockColor = texture(texAtlas, end);
        
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
      const body = vars.group.getObjectsByProperty('animations', true)
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
