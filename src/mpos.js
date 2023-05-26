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
          const idx = grade.softmax

          if (inPolar(node, 1)) {
            grade.els[idx] = { el: node }
            if (node.matches([precept.native, precept.poster])) {
              // this would give a ballpark...
              //grade.media++
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
              wrap.classList.add('pstr')
              node.parentNode.insertBefore(wrap, node)
              wrap.appendChild(node)
              grade.els[idx] = { el: wrap }
              grade.txt.push(node)
              wrap.idx = idx
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
                if (node.matches(precept.native)) {
                  mat = 'native'
                } else if (node.matches(precept.poster)) {
                  mat = 'poster'
                }

                el = grade.els[node.idx]
                if (el) {
                  el.mat = mat
                  el.z = layers - layer
                }
                if (el.mat === 'poster') {
                  el.atlas = grade.atlas
                  grade.atlas++
                }
              }
            }
          }
        })
      }

      struct(sel, layers, grade)

      // Shader Atlas
      grade.canvas.width = grade.canvas.height = grade.atlas * grade.hardmax
      grade.canvas.id = grade.idx
      const ctx = grade.canvas.getContext('2d')

      ctx.fillStyle = 'rgba(0, 0, 255, 0.25)'
      ctx.fillRect(0, grade.canvas.height * 0.0, grade.canvas.width, grade.canvas.height * 0.33)
      ctx.fillStyle = 'rgba(255, 255, 0, 0.25)'
      ctx.fillRect(0, grade.canvas.height * 0.33, grade.canvas.width, grade.canvas.height * 0.33)
      ctx.fillStyle = 'rgba(255, 0, 0, 0.25)'
      ctx.fillRect(0, grade.canvas.height * 0.66, grade.canvas.width, grade.canvas.height * 0.33)
      // scaling
      const height = grade.canvas.height
      const step = height / grade.atlas

      let loading = grade.atlas
      for (const el of Object.values(grade.els)) {
        //todo: matrix slot for: self, child?
        if (el.mat && el.mat === 'poster') {
          toSvg(el.el).then(function (dataUrl) {
            var img = new Image()
            img.onload = function () {
              // transform atlas
              let idx = el.atlas
              let block = step * idx
              //console.log(el, el.el.innerText, idx, step, block)
              ctx.drawImage(img, block, height - step - block, step, img.height * (step / img.width))

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
        generic.count = grade.softmax
        generic.userData.el = sel
        generic.name = [grade.idx, selector].join('_')
        vars.group.add(generic)

        // Meshes

        let i = 0
        let dummy = new THREE.Object3D()
        for (const el of Object.values(grade.els)) {
          //todo: matrix slot for: self, child?
          if (el.mat) {
            dummy = mpos.add.box(el.el, el.z, { dummy: dummy })
            generic.setMatrixAt(el.atlas || i, dummy.matrix)
            if (el.mat === 'poster') {
              texIdx[el.atlas] = el.atlas
            }
            i++
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

      // Instanced Mesh
      if (opt.dummy) {
        opt.dummy.position.set(x, y, z)
        opt.dummy.scale.set(w, h, d)
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
    shader: function (canvas, texStep) {
      let texAtlas = new THREE.CanvasTexture(canvas)
      texStep = 1 / texStep
      let m = new THREE.MeshBasicMaterial({
        transparent: true,
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
          
        vec2 blockUv =  ${texStep} * (floor(vTexIdx + 0.1) + vUv); 
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
