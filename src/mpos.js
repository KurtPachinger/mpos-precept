import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { toSvg } from 'html-to-image'

const mpos = {
  var: {
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
    let old
    if (!selector || typeof selector !== 'string') {
      old = mpos.var.scene.getObjectsByProperty('type', 'Group')
    } else {
      old = mpos.var.scene.getObjectsByProperty('name', selector)
    }
    for (let i = 0; i < old.length; i++) {
      old[i].removeFromParent()
    }

    // CSS
    let css3d = mpos.var.rendererCSS.domElement
    let clones = css3d.querySelectorAll(':not(.transform)')
    clones.forEach(function (el) {
      el.parentElement.removeChild(el)
    })
  },
  add: {
    dom: function (selector, layers = 8) {
      const vars = mpos.var
      // dispose old THREE group
      let dispose = vars.opt.dispose ? false : selector
      mpos.old(dispose)
      // get DOM node
      selector = selector || vars.opt.selector || 'body'
      let sel

      sel = document.querySelector(selector)
      if (selector === 'address') {
        // load URL
        sel.querySelector('object').setAttribute('data', vars.opt.address)
      }

      //
      if (sel === null) {
        return
      }

      // new THREE group
      vars.group = new THREE.Group(selector)
      vars.group.name = selector
      // root DOM node (viewport)
      mpos.add.box(document.body, -1, { m: 'wire' })

      let maxnode = 64
      function struct(sel, layer) {
        //console.log('struct', layer, sel.nodeName)
        let depth = layer

        // self DOM node
        mpos.add.box(sel, layers - depth, { m: 'self' })
        // structure
        const blacklist = '.ignore,head,style,script,link,meta,base,keygen,canvas[data-engine],param,source,track,area,br,wbr'
        const whitelist = 'div,span,main,section,article,nav,header,footer,aside,figure,details,li,ul,ol'
        const poster = 'canvas,img,svg,h1,h2,h3,h4,h5,h6,p,li,ul,ol,dt,dd,.text'
        const native = 'iframe,frame,embed,object,table,form,details,video,audio'

        // child DOM node
        depth--
        const children = []
        sel.childNodes.forEach(function (node) {
          if (node.tagName || node.textContent.trim()) {
            // wrap text in block-level for canvas
            if (node.nodeName === '#text') {
              let wrapper = document.createElement('div')
              wrapper.classList.add('text')
              node.parentNode.insertBefore(wrapper, node)
              wrapper.appendChild(node)
              node = wrapper
            } else if (node.nodeName === '#comment') {
              // todo: other CDATA
              console.log(node)
              return
            }
            children.push(node)
          }
        })

        // print DOM
        //console.log(children)

        for (let i = 0; i < children.length; i++) {
          let child = children[i]
          //console.log(maxnode, child.nodeName)

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
              //console.log(depth, child.nodeName)
              let m = 'child'

              // FILTER TYPE

              if (child.matches(poster)) {
                //console.log('type', child,child.nodeName)
                m = 'poster'
              } else if (child.matches(native)) {
                // CSS 3D
                m = 'native'
              }

              mpos.add.box(child, layers - depth, { m: m })
            }
          }
        }
      }

      struct(sel, layers)

      vars.group.scale.multiplyScalar(1 / vars.fov.max)
      vars.scene.add(vars.group)
    },

    box: function (element, layer = 0, opt = {}) {
      const vars = mpos.var
      //const geo = mpos.var.geo.clone()
      const mat = vars.mat
      const mesh = new THREE.Mesh(vars.geo, mat)
      mesh.userData.el = element
      mesh.name = [layer, opt.m, element.nodeName].join('_')

      const rect = element.getBoundingClientRect()
      // scale
      const w = rect.width
      const h = rect.height
      const d = vars.fov.z
      mesh.scale.set(w, h, d)
      // position
      const x = rect.width / 2 + rect.left
      const y = -(rect.height / 2) - rect.top
      const z = d * layer
      mesh.position.set(x, y, z)

      // static or dynamic
      let types = [mesh]
      if (opt.m === 'wire') {
        mat.color.setStyle('cyan')
        mat.opacity = 0.5
      } else {
        const map = mat.clone()
        map.wireframe = false
        map.name = element.tagName
        mesh.material = map
        // todo: data-taxonomy...
        if (opt.m === 'poster') {
          mesh.material = [mat, mat, mat, mat, map, null]
          toSvg(element).then(function (dataUrl) {
            map.map = new THREE.TextureLoader().load(dataUrl)
            map.needsUpdate = true
          })
        } else if (opt.m === 'native') {
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
      const body = vars.scene.getObjectsByProperty('name', '-1_BODY')
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
