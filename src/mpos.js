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
      z: 16,
      max: 1920
    },
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({
      transparent: true
    })
  },
  init: function () {
    // INIT THREE
    mpos.var.scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, mpos.var.fov.w / mpos.var.fov.h, 0.01, 1000)
    camera.position.z = 1
    const renderer = new THREE.WebGLRenderer()
    renderer.setSize(mpos.var.fov.w, mpos.var.fov.h)
    document.body.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)

    // helpers...
    let axes = new THREE.AxesHelper(0.5)
    mpos.var.scene.add(axes)
    //const light = new THREE.PointLight(0xff0000, 1, 100)
    //light.position.set(0, 4, 4)
    //mpos.var.scene.add(light)

    // ADD TARGET
    mpos.add.dom()

    // CSS3D
    const container = document.getElementById('container')
    const rendererCSS = new CSS3DRenderer()
    rendererCSS.setSize(mpos.var.fov.w, mpos.var.fov.h)
    container.appendChild(rendererCSS.domElement)
    const controlsCSS = new OrbitControls(camera, rendererCSS.domElement)
    //const group = new THREE.Group()

    const blocker = document.getElementById('blocker')
    blocker.style.display = 'none'

    controlsCSS.addEventListener('start', function () {
      blocker.style.display = ''
    })
    controlsCSS.addEventListener('end', function () {
      blocker.style.display = 'none'
    })

    // RENDER LOOP
    function animate() {
      requestAnimationFrame(animate)
      const body = mpos.var.scene.getObjectsByProperty('name', '-1_BODY')
      if (body) {
        let time = new Date().getTime() / 100
        for (let i = 0; i < body.length; i++) {
          let wiggle = body[i]
          wiggle.rotation.x += Math.sin(time) / 100
          wiggle.rotation.y += Math.cos(time) / 100
        }
      }
      renderer.render(mpos.var.scene, camera)
      rendererCSS.render(mpos.var.scene, camera)
    }
    animate()

    // RESIZE THROTTLE
    let resizeTimer
    mpos.resize = function () {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(function () {
        mpos.var.fov.w = window.innerWidth
        mpos.var.fov.h = window.innerHeight

        camera.aspect = mpos.var.fov.w / mpos.var.fov.h
        camera.updateProjectionMatrix()

        renderer.setSize(mpos.var.fov.w, mpos.var.fov.h)
      }, 250)
    }
    window.addEventListener('resize', mpos.resize, false)

    // GUI
    function precept() {
      mpos.add.dom(mpos.var.opt.selector, mpos.var.opt.depth)
    }
    const gui = new GUI()
    gui.add(mpos.var.opt, 'selector', ['body', 'main', '#media', '#text', '#transform']).onChange(precept)
    gui.add(mpos.var.opt, 'depth', 0, 16, 1).onFinishChange(precept)
    gui.add(mpos.var.opt, 'dispose')
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
      let dispose = mpos.var.opt.dispose ? false : selector
      mpos.old(dispose)

      selector = selector || mpos.var.opt.selector || 'body'

      // tree DOM
      const sel = document.querySelector(selector)
      if (sel === null) {
        return
      }

      // tree THREE
      mpos.var.group = new THREE.Group(selector)
      mpos.var.group.name = selector

      // tree ROOT
      mpos.add.act(document.body, -1, { m: 'wire' })

      function struct(sel, layer) {
        console.log('struct', layer, sel.tagName)
        let depth = layer

        // tree self
        mpos.add.act(sel, layers - depth, { m: 'child' })

        // tree child
        // todo: fake child node (~text !whitespace)
        depth--
        const children = sel.children
        for (let i = 0; i < children.length; i++) {
          let child = children[i]
          let empty = child.children.length === 0
          let whitelist = child.matches('div,main,section,article,header,aside,table,details,form,h2,p,ul,ol,li')
          let blacklist = child.matches('script,style,canvas[data-engine]')
          if (blacklist) {
            console.log('blacklist', child.nodeName)
            continue
          } else if (depth >= 1 && !empty && whitelist) {
            // child struct
            struct(child, depth)
          } else {
            // child composite
            console.log(depth, child.tagName)
            mpos.add.act(child, layers - depth, { m: 'child' })

            // FILTER TYPE
            const type = child.tagName.toUpperCase()
            if (type === 'IMG') {
              console.log('type', type, child.src)
              /*
              // TO-DO: fix local CORS
              */
            } else if (type === 'FORM') {
              // CSS 3D
            } else {
              // video, texts, containers, iframe, none...
            }
          }
        }
      }

      struct(sel, layers)

      mpos.var.group.scale.multiplyScalar(1 / mpos.var.fov.max)
      mpos.var.scene.add(mpos.var.group)
    },

    act: function (element, layer = 0, opt = {}) {
      const geo = mpos.var.geo.clone()
      const mat = mpos.var.mat.clone()
      const mesh = new THREE.Mesh(geo, mat)

      // options
      mesh.name = [layer, element.tagName].join('_')
      const rect = element.getClientRects()[0]
      // scale
      const w = rect.width
      const h = rect.height
      const d = mpos.var.fov.z
      mesh.scale.set(w, h, d)
      // position
      //if(layer !== false){
      let x = rect.width / 2 + rect.left
      let y = -(rect.height / 2) - rect.top
      let z = mpos.var.fov.z * layer
      mesh.position.set(x, y, z)
      //}

      let css3d = null
      if (opt.m === 'child') {
        mesh.material.opacity = 0.75
        // CSSObject3D...
        z += mpos.var.fov.z / 2 + 0.01
        css3d = new Element(element, x, y, z, 0)
        css3d.name = ['CSS', element.tagName].join('_')
        //
      } else {
        mesh.material.wireframe = true
      }

      mpos.var.group.add(mesh, css3d)
    }
  }
}

function Element(element, x, y, z, ry) {
  let el = element.cloneNode(true)

  const object = new CSS3DObject(el)
  object.position.set(x, y, z)
  object.rotation.y = ry

  return object
}

export default mpos
