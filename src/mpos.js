import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'

const mpos = {
  var: {
    opt: { selector: 'main', depth: 8, dispose: true },
    fov: {
      w: window.innerWidth,
      h: window.innerHeight,
      z: 8,
      max: 1920
    },
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({
      transparent: true
    })
  },
  init: function () {
    let vars = mpos.var
    // THREE
    vars.scene = new THREE.Scene()
    vars.camera = new THREE.PerspectiveCamera(60, vars.fov.w / vars.fov.h, 0.001, 1000)
    vars.camera.position.z = 1
    vars.renderer = new THREE.WebGLRenderer()
    vars.renderer.setSize(vars.fov.w, vars.fov.h)
    document.body.appendChild(vars.renderer.domElement)
    // helpers
    let axes = new THREE.AxesHelper(0.5)
    vars.scene.add(axes)

    // CSS3D
    const css3d = document.getElementById('css3d')
    vars.rendererCSS = new CSS3DRenderer()
    vars.rendererCSS.setSize(vars.fov.w, vars.fov.h)
    css3d.appendChild(vars.rendererCSS.domElement)
    vars.controls = new OrbitControls(vars.camera, vars.rendererCSS.domElement)

    // ADD HTML ELEMENT
    mpos.add.dom()

    mpos.ux(vars)
  },
  old: function (selector) {
    let old
    if (!selector || typeof selector !== 'string') {
      old = mpos.var.scene.getObjectsByProperty('type', 'Group')
    } else {
      old = mpos.var.scene.getObjectsByProperty('name', selector)
    }
    for (let i = 0; i < old.length; i++) {
      old[i].removeFromParent()
    }
  },
  add: {
    dom: function (selector, layers = 8) {
      // dispose old THREE group
      let dispose = mpos.var.opt.dispose ? false : selector
      mpos.old(dispose)
      // get DOM node
      selector = selector || mpos.var.opt.selector || 'body'
      const sel = document.querySelector(selector)
      if (sel === null) {
        return
      }

      // new THREE group
      mpos.var.group = new THREE.Group(selector)
      mpos.var.group.name = selector
      // root DOM node (viewport)
      mpos.add.box(document.body, -1, { m: 'wire' })

      let maxnode = 20
      function struct(sel, layer) {
        //console.log('struct', layer, sel.tagName)
        let depth = layer

        // self DOM node
        mpos.add.box(sel, layers - depth, { m: 'self' })
        // structure
        const blacklist = '.ignore,style,script,link,meta,base,keygen,canvas[data-engine],param,source,track,area,br,wbr'
        const whitelist = 'div,span,main,section,article,nav,header,footer,aside,figure,details,li,ul,ol'
        const canvas = 'canvas,img,svg,h1,h2,h3,h4,h5,h6,p,li,ul,ol,dt,dd'
        const css3d = 'iframe,frame,embed,object,table,form,details,video,audio'

        // child DOM node
        depth--
        const children = sel.children
        for (let i = 0; i < children.length; i++) {
          console.log('maxnode', maxnode)
          let child = children[i]
          const empty = child.children.length === 0
          const block = child.matches(blacklist)
          const allow = child.matches(whitelist)

          if (block) {
            console.log('blacklist', child.nodeName)
            continue
          } else {
            maxnode--
            if (maxnode < 1) {
              console.log('MAX_SELF', sel.nodeName, sel.id)
              return false
            }
            if (depth >= 1 && !empty && allow) {
              // child structure
              struct(child, depth)
            } else {
              // filter child composite interactive resource
              //console.log(depth, child.tagName)
              let m = 'child'

              // FILTER TYPE

              if (child.matches(canvas)) {
                //console.log('type', child,child.nodeName)
                m = 'canvas'
              } else if (child.matches(css3d)) {
                // CSS 3D
                m = 'css3d'
              }

              mpos.add.box(child, layers - depth, { m: m })
            }
          }
        }
      }

      struct(sel, layers)

      mpos.var.group.scale.multiplyScalar(1 / mpos.var.fov.max)
      mpos.var.scene.add(mpos.var.group)
    },

    box: function (element, layer = 0, opt = {}) {
      const geo = mpos.var.geo.clone()
      const mat = mpos.var.mat.clone()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = [layer, element.tagName].join('_')

      const rect = element.getBoundingClientRect()
      // scale
      const w = rect.width
      const h = rect.height
      const d = mpos.var.fov.z
      mesh.scale.set(w, h, d)
      // position
      let x = rect.width / 2 + rect.left
      let y = -(rect.height / 2) - rect.top
      let z = mpos.var.fov.z * layer
      mesh.position.set(x, y, z)

      // types
      let actors = [mesh]

      if (opt.m === 'wire') {
        mesh.material.wireframe = true
      } else {
        mesh.material.opacity = 0.75
        if (opt.m === 'css3d') {
          // CSSObject3D...
          z += mpos.var.fov.z / 2 + 0.1
          let css3d = mpos.add.css(element, x, y, z, 0)
          css3d.name = ['CSS', element.tagName].join('_')
          actors.push(css3d)
        } else if (opt.m === 'canvas') {
          // canvas texture
        } else {
          let style = window.getComputedStyle(element)
          mesh.material.color.setStyle(style.backgroundColor)
        }
        console.log(element, opt.m, mesh.material.color, mesh.material.map)
      }

      mpos.var.group.add(...actors)
    },
    css: function (element, x, y, z, ry) {
      let el = element.cloneNode(true)

      const object = new CSS3DObject(el)
      object.position.set(x, y, z)
      object.rotation.y = ry

      return object
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
    vars.controls.addEventListener('change', animate)
    function animate() {
      //requestAnimationFrame(animate)
      const body = vars.scene.getObjectsByProperty('name', '-1_BODY')
      if (body) {
        let time = new Date().getTime() / 100
        for (let i = 0; i < body.length; i++) {
          let wiggle = body[i]
          wiggle.rotation.x += Math.sin(time) / 100
          wiggle.rotation.y += Math.cos(time) / 100
        }
      }
      vars.renderer.render(vars.scene, vars.camera)
      vars.rendererCSS.render(vars.scene, vars.camera)
    }
    animate()

    // GUI
    function precept() {
      mpos.add.dom(mpos.var.opt.selector, mpos.var.opt.depth)
    }
    const gui = new GUI()
    gui.add(mpos.var.opt, 'selector', ['body', 'main', '#media', '#text', '#transform']).onChange(precept)
    gui.add(mpos.var.opt, 'depth', 0, 16, 1).onFinishChange(precept)
    gui.add(mpos.var.opt, 'dispose')
  }
}

export default mpos
