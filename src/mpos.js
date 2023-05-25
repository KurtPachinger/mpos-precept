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
      let dispose = vars.opt.dispose ? false : selector
      if (!update) {
        mpos.old(dispose)
        // new THREE group
        vars.group = new THREE.Group(selector)
        vars.group.name = selector
        // root DOM node (viewport)
        mpos.add.box(document.body, -1, { m: 'wire' })
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
          canvas: document.createElement('canvas')
        }
      }

      // filter, grade, sanitize
      const ni = document.createNodeIterator(sel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      let node = ni.nextNode()
      while (node) {
        const empty = !node.tagName && !node.textContent.trim()
        if (!empty) {
          const idx = [precept.grade.softmax, precept.grade.idx].join('_')

          if (node.tagName && node.checkVisibility()) {
            precept.grade.els[idx] = { el: node }
            if (node.matches([precept.native, precept.poster])) {
              precept.grade.interactive++
            }
          } else if (
            node.nodeName === '#text' &&
            node.parentNode.matches([precept.allow]) &&
            !node.parentNode.matches([precept.native, precept.poster])
          ) {
            // text orphan with parent visible
            // ...potentially another type (#comment, xml, php)
            let parentView = Object.keys(precept.grade.els).some(function (tag) {
              return node.compareDocumentPosition(precept.grade.els[tag].el) & Node.DOCUMENT_POSITION_PRECEDING
            })

            if (parentView) {
              // sanitize, block-level required for width
              let wrap = document.createElement('div')
              wrap.classList.add('text')
              node.parentNode.insertBefore(wrap, node)
              wrap.appendChild(node)
              precept.grade.els[idx] = { el: wrap }
              precept.grade.txt[idx] = { el: node }
              wrap.idx = idx
              precept.grade.interactive++
            }
          }
          node.idx = idx
          precept.grade.softmax++
        }

        node = ni.nextNode()
      }

      const MAX_TEXTURE_SIZE = 8192
      precept.grade.canvas.width = precept.grade.canvas.height = MAX_TEXTURE_SIZE
      precept.grade.canvas.id = precept.grade.idx
      const STEP = Math.floor(MAX_TEXTURE_SIZE / precept.grade.interactive)

      function struct(sel, layer, grade) {
        //console.log('struct', layer, sel.nodeName)

        // SELF
        let m = 'self'
        mpos.add.box(sel, layers - layer, { m: m })
        grade.els[sel.idx].m = m

        // CHILD
        sel.childNodes.forEach(function (node) {
          //const empty = !node.tagName && !node.textContent.trim()

          //let vis = false;
          //if(node.tagName){
          //var rect = node.getBoundingClientRect();
          //var viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
          //vis = !(rect.bottom < 0 || rect.top - viewHeight >= 0);
          //}

          if (node.tagName) {
            // CLASSIFY
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
                m = 'child'
                if (node.matches(precept.poster)) {
                  m = 'poster'
                } else if (node.matches(precept.native)) {
                  m = 'native'
                }

                grade.els[node.idx].m = m
                mpos.add.box(node, layers - layer, { m: m })
              }
            }
          }
        })
      }

      struct(sel, layers, precept.grade)

      //
      // Instanced Mesh
      // with Texture Atlas
      const generic = new THREE.InstancedMesh(vars.geo, vars.mat, precept.grade.max)
      //generic.count = precept.grade.els.length - precept.grade.interactive
      generic.count = precept.grade.softmax
      generic.userData.el = sel
      generic.name = selector
      vars.group.add(generic)

      console.log('idx1', precept.grade.els)
      for (const [idx, el] of Object.entries(precept.grade.els)) {
        //todo: matrix slot for: self, child?
        console.log(idx, el)
        if (el.m) {
          mpos.add.box(el.el, 0, {
            m: el.m,
            ctx: precept.grade.canvas.getContext('2d'),
            max: MAX_TEXTURE_SIZE,
            step: STEP
          })
        }
      }

      let output = document.querySelector('#output')
      output.innerHTML = ''
      output.appendChild(precept.grade.canvas)
      console.log(precept.grade, STEP)

      // OUTPUT
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
            if (opt.ctx) {
              var img = new Image()
              img.src = dataUrl
              // Texture Atlas
              let idx = element.idx.split('_')[0]
              let tile = idx * opt.step
              opt.ctx.drawImage(img, 0 + tile, -opt.max + tile, tile, tile)
            }
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
