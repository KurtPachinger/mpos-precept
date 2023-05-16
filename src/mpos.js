import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
//import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
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
      color: 0xffffff,
      wireframe: false,
      transparent: true
    })
  },
  init: function () {
    // INIT THREE
    mpos.var.scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, mpos.var.fov.w / mpos.var.fov.h, 0.1, 1000)
    camera.position.z = 1
    const renderer = new THREE.WebGLRenderer()
    renderer.setSize(mpos.var.fov.w, mpos.var.fov.h)
    document.body.appendChild(renderer.domElement)
    new OrbitControls(camera, renderer.domElement)

    // ADD LIGHT
    const light = new THREE.PointLight(0xff0000, 1, 100)
    light.position.set(0, 4, 4)
    mpos.var.scene.add(light)

    // ADD SCREEN
    let axes = new THREE.AxesHelper(0.5)
    mpos.var.scene.add(axes)
    // ADD TARGET
    mpos.add.dom()

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
      const group = new THREE.Group(selector)
      group.name = selector

      // tree ROOT
      let actor = mpos.add.act(document.body, -1)
      actor.material.wireframe = true
      group.add(actor)

      function struct(sel, layer) {
        console.log('struct', layer, sel.tagName)
        let depth = layer

        // tree self
        let actor = mpos.add.act(sel, layers - depth)
        actor.material.wireframe = true
        group.add(actor)

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
            let actor = mpos.add.act(child, layers - depth)
            actor.material.opacity = 0.5
            group.add(actor)

            //
            // CSSObject3D...
            //

            // FILTER TYPE
            const type = child.tagName.toUpperCase()
            if (type === 'IMG') {
              console.log('type', type, child.src)

              /*
              // TO-DO: fix local CORS
              var canvas = document.createElement("canvas");
              ctx = canvas.getContext("2d");

              canvas.width = child.width;
              canvas.height = child.height;
              ctx.drawImage( child, 0, 0, canvas.width, canvas.height );

              let map = new THREE.CanvasTexture(canvas);


              let material = new THREE.MeshStandardMaterial({map:map})
              actor.material = material
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

      group.scale.multiplyScalar(1 / mpos.var.fov.max)
      mpos.var.scene.add(group)
    },

    act: function (element, layer = 0) {
      const geo = mpos.var.geo.clone()
      const mat = mpos.var.mat.clone()
      const actor = new THREE.Mesh(geo, mat)

      // options
      actor.name = layer + '_' + element.tagName
      const rect = element.getClientRects()[0]
      // scale
      const w = rect.width
      const h = rect.height
      const d = mpos.var.fov.z
      actor.scale.set(w, h, d)
      // position
      //if(layer !== false){
      let x = rect.width / 2 + rect.left
      let y = -(rect.height / 2) - rect.top
      actor.position.set(x, y, mpos.var.fov.z * layer)
      //}

      return actor
    }
  }
}

export default mpos
