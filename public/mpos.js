//import "./mpos.css"
// ...OpenCV, SuperGif

import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'

import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { Text } from 'troika-three-text'

//import * as TinySDF from "../cdn/tiny-sdf/tiny-sdf.js";

import { toSvg, getFontEmbedCSS } from 'html-to-image' // bug > 11.11 getFontEmbed
import { parseGIF, decompressFrames } from 'gifuct-js'

const mpvar = {
  batch: 0,
  cache: new Map([['onBeforeRender', {}]]),
  time: {
    sFence: new THREE.Clock(), // update (interval) and share (with nominal) via oldTime
    sFenceDelta: 0,
    sFenceFPS: 1 / 60, // 60 fps
    sFenceFPS_slice: { boundary: 1, gate: true, ramp: 0, sma: { count: 0, average: 0 } },
    st: { gate: false, subsub: false, pingpong: false, flush: { fuse: -Infinity } }
  },
  fov: { basis: 1024, dpr: 1, width: window.innerWidth, height: window.innerHeight, z: 8 },
  opt: {
    request: 'xml_suite.html',
    selector: 'main',
    custom: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Tetrix_projection_fill_plane.svg',
    depth: 8,
    inPolar: 4,
    arc: 0.0,
    delay: 500, //16.666
    setFlash: false,
    /**
     * GUI adds element or custom pointer, with options
     */
    update: function () {
      let selector = this.selector
      const options = { depth: this.depth }

      if (this.selector === 'custom') {
        // Document from URI (CORS?)
        if (this.custom.startsWith('//') || this.custom.startsWith('http')) {
          //|| this.custom === "#fragment"
          // "#custom template"
          selector = '#custom object'
          options.custom = this.custom
        } else {
          selector = this.custom
        }
      }

      mpos.mod.add(selector, options)
    }
  },

  /**
   * toSVG options: default styles and filters, to shallow-copy and append
   */
  cloneX: class {
    /**
     * @param {Object} opts set key values
     */
    constructor(opts = {}) {
      for (let k in opts) {
        this[k] = opts[k]
      }
    }

    // reduce canvas size, or wrap #text
    width = ''
    height = ''
    // optimize working space
    pixelRatio = 1
    preferredFontFormat = 'woff2'
    fontEmbedCSS = ''
    imagePlaceholder = 'data:,'
    style = {
      margin: 'initial',
      transform: 'initial',
      animation: 'none', //animationName
      transform: 'none'
      //display: "block",
    }

    /* [ :root{--global}, animation, animation-play-state, image-rendering, transition, ];*/
    includeStyleProperties =
      `background,background-blend-mode,background-color,background-image,background-position,border,border-bottom,border-left,border-radius,border-right,border-top,bottom,box-shadow,box-sizing,color,content,contain,display,filter,flex-basis,flex-direction,flex-grow,flex-shrink,flex-wrap,float,font,font-family,font-size,height,inset,left,line-height,list-style,margin,max-height,max-width,min-height,min-width,mix-blend-mode,opacity,overflow,overflow-x,overflow-y,padding,perspective,position,right,rotate,scale,text-align,text-decoration,text-shadow,text-transform,top,transform,transform-origin,vertical-align,visibility,width,zoom,z-index`.split(
        ','
      )

    //
    // Filter (like precept/inPolar): reduce memory use, but don't alter whitespace
    // Child nodes may be malformed, or create documents in the loop

    allow = new Set(['FORM', 'FIELDSET', 'MODEL-VIEWER'])
    block = new Set([
      //"#comment", //8
      //"#cdata-section", //4
      //"#text",//3
      'STYLE',
      'SCRIPT',
      'TEMPLATE',
      'IFRAME',
      'VIDEO',
      'SOURCE',
      'TRACK',
      'DATALIST'
    ])

    /**
     * Filter Nodes by hierarchy:
     * complex return of (mostly unnecessary) multi-factor (map/pyramid) structure
     * @param {Node} clone
     */
    static filterEmpty(clone) {
      const { grade } = mpvar

      // 0. hierarchy

      // not element or text (#comment, #cdata-section...)
      if (clone.nodeType > 3 || grade.wait === Infinity) return
      if (clone.nodeType < 3) {
        // not reserved element-specific protection (block/allow)
        const reserve =
          !this.allow.has(clone.nodeName) ||
          !this.allow.has(clone.parentElement.nodeName) ||
          (!this.block.has(clone.nodeName) && !this.block.has(clone.parentElement.nodeName))

        if (!reserve) return
      }

      // Element or coerced #text
      // clone in toSvg(rect.el) needs stricter test
      // since mat type (visible/blacklist) ABORTS
      // to remove EMPTY/HIDDEN element nodes, or approximate GHOST text nodes

      //if (clone.nodeType === 3) return true
      const el = clone.nodeType === 3 ? clone.parentElement : clone
      const ancestor = el.closest('[data-idx]')
      const rect = grade.rects.get(ancestor.dataset['idx'])

      // ***
      //if (el.isSameNode(ancestor)) return true;
      const _tempLim = grade.atlas.mmFull
      if (!rect || _tempLim) {
        // edge cases: may be hard refresh, or atlas is too full (~128/2)
        //console.log("flood!");

        // expensive to children (anonymous quality?)
        const deep = mpos.fnVar('march', el, {}).root > 8
        const whitelist = rect && (rect.ux.o || rect.ux.u.size)
        if (!rect || deep || !whitelist) return
        // note: frame===0, atlas (with breakpoints) no [data-idx], so filter ghosts boxes (low-quality)
      }
      //
      // ***

      // 1. empty sprite (not test of whitespace, such as #text \n <br>)
      const hidden =
        !rect.bound.box.width ||
        !rect.bound.box.height ||
        el.style.display === 'none' ||
        (el.textContent.trim() === '' && rect.css?.style?.background === 'none') // block fullscreen overlay
      // 2. relatives (...shallow, grade.el) exceed mip size
      const overflow =
        // !! NEGATE CLONE === RECT.EL ??  (text|el) ?: [data-idx]    el==ancestor
        //!el.isSameNode(ancestor) &&
        rect.uv.mip < 2 &&
        (ancestor.querySelectorAll('[data-idx]').length > 8 || // L0-1: match parent/self (data-idx FAR UP tree)
          el.childElementCount > 16) // L0: self

      //if (hidden || overflow) console.log("filter", clone, mip);
      return !hidden || !overflow
      // ~7 less elements per frame: (blank.gif, <br />, <object>, <script>, <source>)
      //if (!!clone.shadowRoot || element.getRootNode() instanceof ShadowRoot)
    }

    /**
     * Filter nodes for background:
     * remove children, since box size set
     * @param {Node} clone
     */
    static filterSelf(clone) {
      return !clone.parentElement
    }
  },
  geo: new THREE.BoxGeometry(1, 1, 1),
  mat: new THREE.MeshBasicMaterial({ color: 'cyan' }),
  mat_shape: new THREE.MeshBasicMaterial({ alphaHash: true, depthWrite: false }),
  mat_line: new THREE.MeshBasicMaterial({ color: 'cyan', wireframe: true }),
  mat_shader: new THREE.RawShaderMaterial({
    //discourse.threejs.org/t/13221/18
    //discourse.threejs.org/t/33191/12
    uniforms: { map: { type: 't', value: null }, atlasSize: { type: 'f', value: null } },
    vertexShader: `precision mediump float;

      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;

      attribute vec3 position;
      attribute vec2 uv;
      attribute mat4 instanceMatrix;
      attribute vec3 uvOffset;

      uniform float atlasSize;
      varying vec2 vUv;

      void main() {
        vUv = vec2(uvOffset.x, uvOffset.y) + ((uv* uvOffset.z) / atlasSize ) ;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
      `,
    fragmentShader: `precision lowp float;

      varying vec2 vUv;
      uniform sampler2D map;

      void main() {
        gl_FragColor = texture2D(map, vUv);
      }
      `
  }),
  tool: {
    /**
     * Equivalent coercion
     * @param {any} value primary operator
     * @param {Object} opts lambda access mode: avg, deep, diff
     * @returns {(boolean|number)} equality or equivalent precision
     */
    eq: function (value, opts = {}) {
      let equals = true
      const epsilon = 6
      function dec(v, deep) {
        // to decimal precision
        const numeric = typeof v === 'number' && !isNaN(v) && isFinite(v)
        v = numeric ? +v.toFixed(epsilon) : v
        return v
      }

      if (opts.diff) {
        // compare objects
        const A = value
        const B = opts.diff
        if (!opts.deep) {
          // string === string
          equals = JSON.stringify(A) === JSON.stringify(B)
        } else {
          // keys === keys
          let a, b
          for (const key in A) {
            a = A[key]
            b = B[key]
            equals = key in B ? dec(a) === dec(b) : false
            if (!equals) break
          }
        }
        // ...or: A.isSameNode(B), |A-B|<0.001
      } else if (opts.avg) {
        // simple moving average
        const avg = opts.avg
        const acc = avg.average + (value - avg.average) / (1 + avg.count)
        avg.average = acc
        avg.count++
      } else {
        // numeric precision
        equals = dec(value, opts.deep)
      }

      return equals
    },
    /**
     * Count nested elements which match precept.allow
     * @param {HTMLElement} element target for depth count
     * @param {Object} opts traversal
     * @returns {{root:number,slot:number}} count ancestors and descendents
     */
    march: function (element, opts = {}) {
      const { grade, opt } = opts.mpvar
      const depth = grade?.depth || opts.depth || opt.depth

      // z relative to root(s) and slot depth(s)
      let inner = element
      const outer = grade?.el || document.querySelector(opt.selector) || document.body
      const m = { root: 0, slot: 0 }
      while (m.root < 32 && inner && inner.parentElement && !inner.isSameNode(outer)) {
        m.root++
        inner = inner.parentElement.closest(opts.precept.allow)
      }

      m.slot = depth - m.root

      return m
    },
    /**
     * Add a helper to visualize raymarch fundamentals in development
     * @param {HTMLElement} element parent to append chains
     * @param {Object} opts link count and symbol to append on last
     * @returns {HTMLElement} nested mp nodes
     */
    chain: function (element, opts = {}) {
      // chain of elements to count
      let nodeName = opts.nodeName || 'mp'
      let chains = document.createElement(nodeName)
      chains.classList.add('mp-allow', 'march')
      let last = chains
      while (--opts.count > 0) {
        let chain = document.createElement(nodeName)
        chain.classList.add('mp-allow', 'p')
        if (opts.count % 2 === 0) {
          chain.classList.add('odd')
        }
        // path scatter sample (no pointerevents)
        chain.innerHTML += `<mp class="k">${opts.count}</mp>`

        last.append(chain)
        last = chain
      }

      last.classList.add('last')
      last.append(opts.symbol || '')
      if (element) element.prepend(chains)

      return chains
    },
    /**
     * Resource search or load
     * @param {any} terms Node, data-idx, label
     * @param {{io:string,node:obj}} opts io mode and node target
     * @returns {{terms:Array,rects:Object,o:Object}} sparse array
     */
    omni: function (terms, opts = {}) {
      const grade = opts.grade || mpvar.grade
      // Get Element(s) and rect(s)
      // options: sort, poll, callback, find/load?
      // o[delist,enlist], .. children

      const omni = { terms: terms instanceof Array ? terms : [terms], rects: {}, o: { count: 0, time: performance.now() } }

      for (let i = 0; i < omni.terms.length; i++) {
        let term = omni.terms[i]

        //invalid, element, queryselector, dataid
        if (term === undefined) {
          // bad selector
          continue
        } else if (opts.node || opts.io) {
          // load [node, io] term(s) path from async
          let load = {}
          ;['node', 'io'].forEach((o) => {
            load[o] = opts[o] instanceof Array ? opts[o][i] : opts[o]
          })
          this.tool.load(v, { node: load.node, io: load.io })
        } else {
          let idx
          if (term.__proto__.constructor.name === 'rect') {
            // expected query but got rect
            // o[delist,enlist] {...children} ?
            continue
          } else if (term instanceof HTMLElement) {
            // Element
            idx = term.dataset['idx']
          } else if (isFinite(term)) {
            let el = document.querySelector("[data-idx='" + term + "']")
            if (el) {
              omni.terms[i] = el
              // attribute [data-idx]
              idx = term
            }
          } else if (!isFinite(term)) {
            // term may be selector/multiselector, 2d/3d
            const omni3d = ['atlas', 'other', 'first', 'last']
            const omni2d = ['mp', 'img', 'div', 'li', 'p', '[data-idx]', '*']

            if (omni3d.includes(term)) {
              // select rect (major or position)
              let rect
              if (['atlas', 'other'].includes(term)) {
                // major
                rect = grade.major[term]
              } else {
                // position
                const rects = Array.from(grade.rects)
                const position = term === 'first' ? 0 : rects.length - 1
                rect = rects[position][1]
              }
              // KEY
              omni.rects[term] = rect
            } else {
              // select element (multiple or single)
              // note: omni2d is the selector regex
              term = omni2d.includes(term) ? document.querySelectorAll(term) : document.querySelector(term)
              if (term instanceof NodeList || term instanceof HTMLElement) {
                // KEY
                omni.terms[i] = term
                if (!term.length) term = [term]
                term.values().forEach((t) => {
                  idx = t.dataset['idx']
                  if (idx) omni.rects[idx] = grade.rects.get(idx.toString())
                })
              }
            }
          }

          // KEY: rect from attribute [data-idx]
          if (isFinite(idx)) omni.rects[idx] = grade.rects.get(idx.toString())

          // ...callbacks
        }
      }

      //omni.terms = omni.terms.filter(term => {
      //  let ok = (term instanceof HTMLElement && omni.o.count++)
      //  return ok
      //})

      omni.o.time = performance.now() - omni.o.time

      return omni
    },
    /**
     * Load to or from a resource, or poll for object key
     * @param {(string|Object)} packet data resource
     * @param {{io:string,node:Object}} opts io mode and node target
     * @returns {Promise} response
     */
    load: function (packet, opts = {}) {
      // media io
      if (!opts.node) {
        return ['NO OPTS NODE', packet, opts]
      }

      if (opts.io === 'xml') {
        // document fragment
        return fetch(packet)
          .then((response) => response.text())
          .then((html) => {
            document.querySelector(opts.node).innerHTML = html
          })
          .catch((error) => {
            console.error('fetch error:', error)
          })
      } else if (opts.io === 'src') {
        // offscreen quad
        return new Promise((resolve, reject) => {
          opts.node.onload = (e) => resolve(e)
          opts.node.onerror = (e) => reject(e)
          opts.node.setAttribute(opts.attribute, packet)
        })
      } else {
        // polling obj["key"]
        return new Promise((resolve, reject) => {
          let retry = 10
          const poll = setInterval(() => {
            const key = opts.node[packet]
            if (key || retry < 1) {
              clearInterval(poll)
              resolve(key)
              reject('fail: ', opts.node, packet)
            }
            retry--
          }, 1000)
        })
      }
    },
    /**
     * Compare current values to initial (unset) expectation
     * @param {string} type feature to test
     * @param {{node:HTMLElement,capture:HTMLElement}} opts supersets
     * @returns {boolean} presence of feature
     */
    diffs: function (type, opts = {}) {
      let differ = false
      const { rect } = opts
      const style = rect.css.style || rect.el.style // computed, or direct (if not priority)

      //
      // Different from baseline (default generic primitive)

      if (type === 'rect') {
        // should TRUE indicate need for action, like other diffs, despire FALSE being the problem?
        //rect.el.naturalWidth, rect.el.naturalHeight

        // WARNING: bipolar feature test... not to be passed to ux.u?
        // force flush, similar to syncFPS===0 (but saved rect)
        // - NO ATLAS CELL (UX.CHANGE/PRIOR) AND MUST SET: frame:-1 :
        // - NO SIZE ELEMENT AND MUST SET: ATLAS?
        //

        differ = !rect.el.clientWidth || !rect.el.clientHeight
        // note: opts.whitelist quirks ( || el.matches("a, img, object, span, xml, :is(:empty)" )
      } else if (type === 'matrix') {
        // note: style source may re-prioritize by accumulating frames
        const newFrame = rect.frame === -1

        /*const newTransform =
          (rect.bound.width / rect.bound.height).toFixed(1) !==
          (rect.bound.box.width / rect.bound.box.height).toFixed(1);*/

        // some epsilon of tolerance (px vs subpixels): near eps 0.05 and toFixed(1)
        let newTransform = Math.abs(rect.bound.width / rect.bound.height - rect.bound.box.width / rect.bound.box.height) > 0.02

        // secondary route to qualify transform hint (tool.eq(...), height/width, height1-height2)
        // such as mp-native, but not diminish performance or be "sticky"
        /*if (!newTransform &&  rect.minor === "poster") {
          let m6Ancc = rect.el.parentElement.closest("[data-idx]");
          m6Ancc &&= mpvar.grade.rects.get(m6Ancc.dataset["idx"]);
          m6Ancc &&= m6Ancc.css.style.transform?.startsWith("matrix");
          newTransform = m6Ancc;
        }*/

        // newTranslate cannot be easily inferred from cascade, top/right/bottom/left

        differ = newFrame || newTransform || style.transform?.startsWith('matrix')
      } else if (type === 'tween') {
        // note: loose definition
        // ...transform, filter, overlay, allow-discrete
        const keyframes =
          (style.transitionProperty !== '' && parseFloat(style.transitionDuration) > 0) ||
          (style.animationName !== 'none' && style.animationPlayState === 'running')
        differ = keyframes
      } else if (type === 'flow') {
        // note: if position overflows scrollOffset, canvas may not draw
        differ = style.zIndex >= 9 && (style.position === 'fixed' || style.position === 'absolute')
        //&& !!(parseFloat(style.top) || parseFloat(style.right) || parseFloat(style.bottom) || parseFloat(style.left))
      } else if (type === 'phase') {
        // note: get :pseudo capture once per frame for all rects
        let css = rect.css
        if (css) {
          // deepest :pseudo match cache ref (to avoid per-element / per-frame)
          const root = rect.el.parentElement || document.body // note: document.body is excessive, but may prevent error in a loop
          let capture = opts.capture || {
            hover: [...root.querySelectorAll(':hover')].pop(),
            active: [...root.querySelectorAll(':active')].pop(),
            focus: [...root.querySelectorAll(':focus')].pop()
          }

          // note: pseudo (or unset prior frame) enqueued for atlas
          differ = rect.el === capture.active || rect.el === capture.focus || (rect.el === capture.hover && rect.minor === 'poster')
        }
      }

      //
      // WARNING: direct update to rect
      // ?? duplicate access get/set per frame ??
      if (rect.ux) differ ? rect.ux.u.add(type) : rect.ux.u.delete(type)

      if (opts.node) {
        // todo: node may be set manually
        // check on tail, so other updates (like pseudo) bubble to queue
        differ = differ || opts.node.classList.contains('mp-diff')
      }

      return differ
    },
    /**
     * Distance from camera to target or origin
     * @param {Object} distance Object3D target
     * @returns {number} pixel range
     */
    dpr: function (distance) {
      const { fov, camera, grade } = mpvar
      //
      // todo: could be used for anisotropy
      const dprPractical = (fov.width + fov.height) / 2
      const camPosition = camera.position
      const distanceZ = camPosition.distanceTo({ x: camPosition.x, y: camPosition.y, z: 0 })
      let distanceTarget = grade?.group.position || { x: 0, y: 0, z: 0 }
      let sample = distance || camPosition.distanceTo(distanceTarget)

      const eDPI = dprPractical / ((sample + distanceZ) / 2)
      fov.dpr = Math.max(Math.min(eDPI, 1), 0.5)

      return fov.dpr
    },
    /**
     * Map() => Array[]: for access by index, reverse-order, or other positional query
     * @param {*} object
     * @returns
     */
    resort(object) {
      const array = []
      Array.from(object)
        .flat()
        .forEach((rect) => {
          if (rect.el) array.push(rect.el)
        })
      return array
    },
    /**
     * Dispose of resources in DOM and THREE
     * @returns {Promise} complete
     */
    old: function (idx) {
      const { scene, grade } = mpvar

      //console.log(mpvar.renderer.info)
      return new Promise((resolve, reject) => {
        // THREE traverse dispose
        const groups = scene?.getObjectsByProperty('type', 'Group')
        if (groups && groups.length) {
          for (let g = groups.length - 1; g >= 0; g--) {
            const group = groups[g].children || []
            for (let o = group.length - 1; o >= 0; o--) {
              const obj = group[o]
              if (obj.type === 'Mesh') {
                const material = obj.material
                // Cache flag from loader asset to dispose...?
                let cache
                if (material.length) {
                  for (let m = material.length - 1; m >= 0; m--) {
                    const mat = material[m]
                    if (mat) {
                      // ...?
                      //cache = mat.userData.cache
                      // cubemap front [5]
                      mat.canvas && (mat.canvas = null)
                      mat.map && mat.map.dispose()
                      // shader
                      mat.userData.s && mat.userData.s.uniforms.texAtlas.value.dispose()
                      mat.userData.t && mat.userData.t.dispose()
                      mat.dispose()
                    }
                  }
                } else {
                  // front...?
                  //cache = material.userData.cache
                  //if (!cache) {
                  material.map && material.map.dispose()
                  material.dispose()
                  //}
                }

                // Lambda access: Gifuct, body/wire...?
                let anim = obj.animate
                if (anim?.gif) {
                  //anim.gif.pause()
                  anim.gif = anim.context = anim.patch = null
                }
                //
                cache = obj.userData.cache
                if (!cache) {
                  obj.geometry.dispose()
                }
              }
              obj.removeFromParent()
            }
            groups[g].removeFromParent()
          }
        }

        //
        // DOM traverse unbind

        // Elements dataset
        mpos.ux.observer?.disconnect()
        document.querySelectorAll('[data-idx]').forEach((el) => el.removeAttribute('data-idx'))

        // CSS3DRenderer clones
        const css3d = mpvar.rendererCSS.domElement
        //const clones = css3d.querySelectorAll(":not(.mp-block)")
        css3d.querySelectorAll('[data-batch]').forEach((el) => {
          el.firstElementChild.remove()
          el.parentElement.removeChild(el)
          el = null
        })

        if (grade) {
          // Canvas reset [...]
          let canvas = grade.atlas?.canvas
          if (canvas) {
            //grade.atlas.ctx.reset()
            canvas.remove()
            canvas = null
          }

          // clear keys of grade rects
          grade.major.atlas.clear()
          grade.major.other.clear()
          mpvar.grade.major.text = new WeakMap()
        }

        // Shader Atlas [...]
        //let atlas = document.getElementById("atlas").children
        //for (let c = atlas.length - 1; c >= 0; c--) {
        // atlas[c].parentElement.removeChild(atlas[c])
        //}

        resolve('clear')
        reject('no')
      })
    },
    /**
     * Resize dimensions to constrain long edge
     * @param {number} width x/cols
     * @param {number} height y/rows
     * @param {number} thumb reduced size
     */
    pyr: function (width, height, thumb = 16) {
      // Reduce image to thumbnail
      let pyr = { cols: width, rows: height }
      if (Math.min(pyr.cols, pyr.rows) > thumb) {
        // limit long edge
        const orient = pyr.cols > pyr.rows ? 'cols' : 'rows'
        const scale = thumb < pyr[orient] ? thumb / pyr[orient] : 1
        pyr = { cols: Math.ceil(pyr.cols * scale), rows: Math.ceil(pyr.rows * scale) }
      }
      return [pyr.cols, pyr.rows]
    }
  }
}

const mpos = {
  /**
   * Access mpvar scope
   * @param {string} tool key map
   * @param {*} value tool parameter
   * @param {Object} opts tool lambda access
   * @returns {(Object|Promise)}
   */
  fnVar: function (tool, value, opts = {}) {
    if (value === null || value === undefined) {
      console.log(tool + ': bad value')
      return
    }

    // filter user scope access
    const whitelist = ['batch', 'cache', 'camera', 'controls', 'fov', 'grade', 'gui', 'opt', 'renderer', 'scene']
    opts.mpvar = Object.fromEntries(Object.entries(mpvar).filter(([key]) => whitelist.includes(key)))

    opts.value = value
    switch (tool) {
      case 'march':
        opts.precept = this.mod.precept
        break
      default:
      // opts.grade = ?
    }

    // tool access
    if (['march', 'chain'].includes(tool) && typeof value === 'string') {
      // todo: test omni to (1) find Object3D (2) march/chain DOM selector/element
      value = document.querySelector(value)
    }

    // tool wrapper
    const fnvar = mpvar.tool[tool]
    const response = fnvar ? fnvar(value, opts) : 'no fnVar'
    console.log('fnVar:' + tool, opts.value, response)
    return response
  },

  /**
   * Initialize: scene, renderer, camera, controls, gui
   * @param {Object} opts proxy environment
   * @returns {Object} opts
   */
  init: function (opts = {}) {
    const { opt, fov } = mpvar

    // WebWorker...
    mpvar.worker = new Worker('worker.js')
    mpvar.worker.onmessage = (e) => {
      const result = e.data
      console.log('WW message:', result)
    } // -->

    const promise = new Promise((resolve, reject) => {
      // Mode: proxy or standalone
      const proxy = !!(opts.scene && opts.camera && opts.renderer)

      mpvar.scene = opts.scene || new THREE.Scene()
      mpvar.scene.autoUpdate = mpvar.scene.matrixAutoUpdate = mpvar.scene.matrixWorldAutoUpdate = false

      mpvar.renderer =
        opts.renderer ||
        new THREE.WebGLRenderer({
          canvas: opts.config?.renderer
          //antialias: false,
          //precision: "lowp",
          //powerPreference: "low-power",
        })

      mpvar.renderer.setPixelRatio(1)
      const domElement = mpvar.renderer.domElement
      opts.host = proxy ? domElement.parentElement : document.body

      fov.width = opts.host.offsetWidth
      fov.height = opts.host.offsetHeight
      const frustum = fov.basis * opt.depth
      mpvar.camera =
        opts.camera ||
        (opts.config?.camera === 'Orthographic'
          ? new THREE.OrthographicCamera(fov.width / -2, fov.width / 2, fov.height / 2, fov.height / -2, fov.z / 2, frustum * 4)
          : new THREE.PerspectiveCamera(45, fov.width / fov.height, fov.z / 2, frustum * 4))
      //mpvar.camera = opts.camera || new THREE.OrthographicCamera(fov.width / -2, fov.width / 2, fov.height / 2, fov.height / -2, 8, 1000)

      //
      // Stage injection
      const template = document.createElement('template')
      template.innerHTML = `
      <section id="mp">
        <div id="custom" class="tool mp-offscreen">
          <object alt="OSC"></object>
          <!-- iframe, template -->
        </div>
        <aside id="atlas" class="tool">
          <!--<canvas></canvas>-->
          <hr id="caret" />
        </aside>
        <div id="css3d"></div>
      </section>`

      opts.host.appendChild(template.content)
      const mp = proxy ? opts.host : document.getElementById('mp')
      mp.classList.add('mp-block')
      mpvar.caret = mp.querySelector('#caret')

      mpvar.camera.layers.enableAll()
      if (!proxy) {
        mpvar.camera.position.z = frustum / 8
        mpvar.renderer.setSize(fov.width, fov.height)
        mp.appendChild(domElement)
        mpvar.renderer.setClearColor(0x00ff00, 0)
      }

      // helpers
      const axes = new THREE.AxesHelper(99)
      mpvar.scene.add(axes)
      const gridHelper = new THREE.GridHelper(window.screen.width, 4, 0xd0d0d0, 0xf0f0f0)
      gridHelper.rotateX(3.14 / 2)
      gridHelper.position.set(window.screen.width / 2, -window.screen.width / 2, 0)
      mpvar.scene.add(gridHelper)

      // CSS3D
      const css3d = document.getElementById('css3d')
      mpvar.rendererCSS = new CSS3DRenderer()
      mpvar.rendererCSS.setSize(fov.width, fov.height)
      css3d.appendChild(mpvar.rendererCSS.domElement)
      css3d.querySelectorAll('div').forEach((el) => el.classList.add('mp-block'))

      // Control camera
      const controls = new MapControls(mpvar.camera, domElement)
      controls.screenSpacePanning = true
      controls.maxDistance = frustum
      // center position
      const halfHeight = -(fov.height / 2)
      mpvar.camera.position.setY(halfHeight + 0.125)
      controls.target.setY(halfHeight)
      controls.update()
      mpvar.controls = controls

      //
      // Enable UX
      const ux = mpos.ux
      window.stats = new Stats()
      mp.appendChild(stats.dom)
      // bitmask event targets
      ux.events.raycaster.layers.set(2)

      // User Events: window, scene, raycaster
      controls.addEventListener('change', ux.render, false)

      const events = ['pointerdown', 'pointermove', 'click']
      events.forEach((event) => {
        domElement.addEventListener(event, ux.event, false)
      })

      // User Events: window layout shift
      window.addEventListener('scroll', ux.reflow, false)

      const resize = new ResizeObserver((entries) => {
        ux.reflow({ type: 'resize' })
      })
      resize.observe(mp)

      const callback = function (entries, observer) {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target)
            ux.reflow(entry)
          }
        })
      }

      ux.observer = new IntersectionObserver(callback, {
        // note: relax error range, for canvas threshold
        scrollMargin: '50% 25%',
        threshold: [0.25, 0.5]
      })

      // User Events: cloned CSS
      //const cloneCSS = mp.querySelector("#css3d > div > div > div");
      //domElement.addEventListener("input", ux.event, false);

      const gui = new GUI()
      gui.domElement.classList.add('mp-native')

      const fps = (1 / 120).toFixed(5)
      const params = {
        request: [['xml_suite.html', 'xml_track.html', 'xml_guide.html', 'xml_adslot.html']],
        selector: [['body', 'main', 'custom']],
        depth: [0, 32, 1],
        inPolar: [3, 4, 0.5],
        delay: [[0, fps / 2, fps, fps * 2, fps * 4, fps * 8, 125, 250, 333.333, 500, 1000]],
        arc: [0, 1, 0.25]
      }
      for (const key in opt) {
        const param = params[key] || []
        const controller = gui.add(opt, key, ...param).listen()

        if (key === 'delay') {
          controller.onFinishChange((v) => {
            // update (non-zero) target framerate, or normal step.quality will be lossy

            // RESET:
            //mpvar.time.sFenceDelta = 0
            //mpvar.time.sFenceFPS_slice = { boundary: 0, gate: Infinity, ramp: 0, sma: { count: 0, average: 0 } }

            const minfps = fps * 4
            if (v) mpvar.time.sFenceFPS = v <= minfps ? v : minfps

            ux.reflow({ type: 'delay', value: v })
          })
        } else if (key === 'request') {
          controller.onFinishChange((v) => {
            mpvar.tool.load(v, { io: 'xml', node: 'main' }).finally(() => {
              mpos.mod.add()
            })
          })
        } else if (key === 'inPolar') {
          controller.onFinishChange((v) => {
            mpvar.grade.inPolar = v
          })
        }
      }

      mpvar.gui = gui

      resolve(opts)
      reject('err')
    })

    // note: no grade yet..?
    console.log('init:', promise)
    return promise
  },
  mod: {
    precept: {
      // selectors match node
      manual: `.mp-loader,.mp-poster,.mp-native`.split(','),
      allow: `.mp-allow,div,main,section,article,nav,header,footer,aside,tbody,tr,th,td,li,ul,ol,menu,figure,address`,
      block: `.mp-block,canvas[data-engine~="three.js"],head,style,script,link,meta,applet,param,map,br,wbr,template,track,source,iframe:not([src])`,
      poster: `.mp-poster,canvas,img,picture,figcaption,h1,h2,h3,h4,h5,h6,p,ul,ol,li,th,td,summary,caption,dt,dd,code,span,root`,
      native: `.mp-native,a,canvas,iframe,frame,object,embed,svg,table,details,fieldset,form,label,button,input,select,textarea,output,dialog,video,audio[controls]`,
      native3d: `model-viewer,a-scene,babylon,three-d-viewer,#stl_cont,#root,.sketchfab-embed-wrapper,StandardReality`,
      cors: `iframe,object,.yt`,
      unset: `.mp-offscreen`,
      // phase differs
      tween:
        `align-content,animation,background,background-blend-mode,border,border-radius,bottom,box-shadow,color,display,filter,flex,float,font,height,left,margin,mask,mix-blend-mode,opacity,padding,position,right,top,transform,transition,visibility,width,z-index`.split(
          ','
        ),
      /**
       * Parse formatted instructions (first, on add)
       * @param {Node} node #comment NodeType 3
       */
      parse: function (node) {
        //console.log(node.nodeName, node.textContent);
        console.log('%c#comment: ' + node.textContent.substr(0, 64), 'color: #fff; background-color: #444;')
        if (node.textContent.indexOf('//__THREE__') === 0) {
          try {
            // use internals (cache)
            eval(node.textContent)
          } catch (error) {
            console.log(error)
          }
        }
      }
    },
    /**
     * Records state type of graded element
     */
    tRect: class {
      /**
       * @param {HTMLElement} node element with [data-idx]
       * @param {Object} opts lambda access
       */
      constructor(node, opts = {}) {
        for (let k in opts) {
          this[k] = opts[k]
        }
        this.el = node
      }

      bound = {}
      css = { html: '', matrix: 0, rotation: { x: 0, y: 0, z: 0 }, scale: 1, style: { none: true }, tween: {} }
      diffs = { bound: {}, html: false, phase: false, rotation: {}, scale: 1, tween: {} }

      el = {}
      frame = -1
      idx = -Infinity
      inPolar = 3
      major = ''
      minor = ''

      uv = {}
      ux = { i: 0, o: 0, u: new Set() }
      z = 0
    },
    /**
     * Structure maps DOM:THREE state, per precept
     */
    tGrade: class {
      /**
       * @param {Object} opts lambda access
       */
      constructor(opts) {
        this.depth = opts.depth
        this.group.name = opts.selector || Date.now()

        const atlas = this.atlas
        atlas.canvas = document.createElement('canvas')
        atlas.ctx = atlas.canvas.getContext('2d', { willReadFrequently: true, alpha: true })
        atlas.ctx.imageSmoothingEnabled = false

        // todo: offscreenCanvas, transferControls, multiple readback, imageBitmap, copyTexture...
        //developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
        //devnook.github.io/OffscreenCanvasDemo/use-with-lib.html
      }

      #lock = 0 // atlas key reserve..?
      atlas = {
        canvas: {},
        cells: 10, // divisor
        ctx: {},
        inline: {}, // cloneX
        instanced: {},
        keyTest: {}, // cyan guide structure
        load: { listener: 0, image: new Image() },
        size: 512, // canvas area
        uv: {
          // mipmap[ratio]: { idx[count], span[cells], area[pixels] }
          '+0.00': { idx: 0, span: 0, area: 0 },
          '+0.25': { idx: 0, span: 1, area: 8 * 16 },
          '+0.50': { idx: 0, span: 2, area: 16 * 48 },
          '+1.00': { idx: 0, span: 5, area: 48 * 128 }, //this.#lock
          '+2.00': { idx: 0, span: 2, area: 128 * 128 }
        },
        uvOffset: {} // atlas coordinate
      }

      batch = ++mpvar.batch // UID
      capture = {} // pseudo:hover
      depth = 0 // root z, per precept
      el = {} // root element
      elsMax = 0 // all data-idx
      elsMin = 0 // viewed rects
      group = new THREE.Group() // isolate
      inPolar = 4 // view threshold
      // sets and subsets
      major = { atlas: new Map(), other: new Map(), queue: new Set(), revoke: new Set(), text: new WeakMap() }
      rects = new Map() // superset
      wait = false // sync render
      //scroll: { x: window.scrollX, y: -window.scrollY };

      /**
       * MipMap cell availability
       * @param {boolean} grow allocate more mip spans
       * @returns {boolean} rebuild texture atlas
       */
      mmFull = function (grow) {
        // note: possibly too many elements (for atlas, or overall), but
        // treeDeep sets mat (rect.major==atlas), so count there (no await, before set key...)
        // while sync runs, and checks arent littered (in add, treeSort...)
        //
        // todo: atlas may change to permit (in add pre/post, like add hard/soft)...
        // - canvas size, mips[x.x], span(s), area test
        // - counts for abort (in treeSet, treeSort) internalize live objects
        //
        //let gNaive = [grade.atlas.cells ** 2.05, 0.5 * grade.elsMax, 0.7 * grade.rects.size];
        //let mmReal = 0, mmTruth = 0;
        //for (const key in grade.atlas.uv) {
        //  if (key > 0) mmReal += (grade.atlas.uv[key].span / key) * (12 / key);
        //  if (key > 0) mmTruth += (grade.atlas.uv[key].idx);
        //}

        let mmReal = 0
        for (const key in this.atlas.uv) {
          if (key > 0) mmReal += (this.atlas.uv[key].span / key) * (12 / key)
        }

        if (mmReal < this.elsMax) {
          console.log('atlas overflow!', mmReal, grow)
          if (grow) {
            // proportional (mip/span/area)++ or use 0.00 as reserved block
            this.atlas.cells += 2
            this.atlas.uv['+1.00'].span++
            this.atlas.uv['+0.50'].span++

            // todo: rebuild via mpos.mod.add(), or assume caller follows up
          }

          // flag to lower filter threshold
          this.atlas.mmFull = !grow

          return true
        }
      }
    },
    /**
     * Index nodes from selector
     * @param {Object} grade structure for rectangle elements
     * @param {Object} opts lambda access
     */
    treeFlat: function (grade, opts = {}) {
      const element = opts.selector || grade.el
      const precept = opts.precept || this.precept
      const parse = opts.parse || precept.parse

      // Flat-Grade: filter, grade, sanitize
      const ni = document.createNodeIterator(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT)
      const sibling = (parent) => {
        return parent.childElementCount >= 1 && parent.matches([precept.allow])
      }
      let node = ni.nextNode()
      while (node) {
        if (node.nodeName === '#comment') {
          // #comment (or CDATA, xml, php)
          parse(node)
        } else {
          // Prototype records state
          const rect = new this.tRect(node, {})

          if (mpos.set.inPolar(rect)) {
            // not empty
            if (node.nodeName === '#text') {
              const control = mpvar.tool.resort(grade.rects)

              if (mpos.set.inPolar(rect, control) && sibling(node.parentNode)) {
                // sanitize #text orphan (semantic or list) with parent visible
                const wrap = document.createElement('span')
                wrap.classList.add('mp-poster')
                node.parentNode.insertBefore(wrap, node)
                wrap.appendChild(node)

                rect.el = wrap
                mpos.set.inPolar(rect)
                grade.major.text.set(node, wrap)
              }
            }

            if (rect.inPolar >= 2) {
              // Element in Document
              const idx = grade.elsMax++
              rect.idx = idx.toString()
              rect.el.setAttribute('data-idx', idx)
              // for testing:
              rect.el.title = idx // for testing!

              if (opts.grade) {
                /* element appended */
              }
              grade.rects.set(idx.toString(), rect)
            }
          }
        }

        node = ni.nextNode()
      }

      // grow mipmap on HARD refresh (not anonymous mod.add, which flags)
      grade.mmFull(opts.grade)
    },
    /**
     * Recursive engine to grade nodes, per precept
     * @param {Object} grade structure for rectangle elements
     * @param {Object} opts lambda access
     */
    treeDeep: function (grade, opts = {}) {
      const precept = this.precept

      const zSlot = opts.zSlot || 0
      const depth = opts.depth - zSlot
      console.log('zSlot', opts.zSlot)

      /**
       * Apply rated class (major:minor) and ux priority, to map DOM:THREE
       * @param {Object} rect element record
       * @param {number} z depth from root, per precept
       * @param {string} mat material type sets ux policy
       * @param {boolean} unset toggle style quirks for transcribe process..?
       */
      function setRect(rect, z, mat, unset) {
        if (rect) {
          rect.minor = mat
          rect.z = zSlot + z

          // note: atlas excludes rect.minor type "native" that matches CORS... to CSS3D
          // ... atlas "poster" became first-class, so the logic is !!BetterLate
          const other = rect.minor === 'loader' || rect.minor === 'wire' || rect.el.matches([precept.cors, precept.native3d])
          rect.major = other ? 'other' : 'atlas'

          // elevate priority for ux update (not hyperlinks or CSS3D)
          const uxin = rect.minor === 'native' && rect.el.tagName !== 'A' && rect.major !== 'other' ? 1 : 0
          rect.ux.i = uxin

          // Class to unset quirks (inherit transform, details...)
          unset = unset || rect.el.matches(precept.unset)
          if (unset) {
            rect.unset = true
            rect.ux.i = 1
          }

          if (rect.inPolar + 0.5 >= grade.inPolar) {
            // Begin Subsets: atlas || other
            mpos.set.key(grade, rect)
            // note: counter logic duplicated in step sync queue (major, priority)
          } else {
            // note: observe greedily on pageLoad...?
            mpos.ux.observer?.observe(rect.el)
            // note: observe off-screen (!inPolar) elements...?
          }

          // note: initial count of ground truth here, if await...?
        }
        return unset
      }

      /**
       * Grade node type with precept, to assert major class
       * @param {HTMLElement} node descendant of root
       * @param {string} mat precept match
       * @param {boolean} manual class user-specified
       * @param {number} layer traversal / termination
       */
      function setMat(node, mat, manual, layer) {
        if (manual) {
          // priority score
          precept.manual.every((classMat) => {
            classMat = classMat.replace('.mp-', '')
            if (node.className.includes(classMat)) {
              mat = classMat
              classMat = false
            }
            return classMat
          })
        } else if (node.matches([precept.native, precept.native3d])) {
          // todo: share native 3d spaces
          mat = 'native'
        } else if (node.matches(precept.poster) || layer === 0) {
          mat = 'poster'
        }
        return mat
      }

      /**
       * Recursive engine to grade by type and count
       * @param {HTMLElement} sel descendant
       * @param {number} deep traversal / termination
       * @param {boolean} unset quirks
       */
      function treeSet(sel, deep, unset) {
        const z = depth - deep

        // SELF
        const rect = grade.rects.get(sel.getAttribute('data-idx'))
        // KEY check: add multiple concurrent may throw?
        if (!rect) {
          console.log('NO DATA-IDX', sel, opts.selector)
          return
        }

        let mat = 'self'
        // specify empty or manual
        const children = sel.children

        const manual = rect.el.matches(precept.manual)
        if (!children.length || manual) {
          mat = setMat(rect.el, mat, manual, children.length)
        }
        unset = setRect(rect, z, mat, unset)
        if (!manual) {
          // CHILD
          for (let i = 0; i < children.length; i++) {
            const node = children[i]

            const rect = grade.rects.get(node.getAttribute('data-idx'))
            if (rect && rect.inPolar) {
              // CLASSIFY TYPE
              const block = node.matches(precept.block)
              // Despite reported range, impose upper limit on practical quantity
              const abortEls = grade.elsMin >= 1_024 //|| grade.elsMin > grade.elsMax
              const abortAtlas = grade.atlas.idxMip >= 256 // || grade.idxMip > grade.elsMin
              if (block || abortEls || abortAtlas) {
                console.log('skip', node.nodeName)
                //rect.el = null
              } else {
                if (rect.inPolar >= 1) {
                  const allow = node.matches(precept.allow)
                  const manual = node.matches(precept.manual)
                  const child = node.children.length

                  if (deep >= 1 && allow && !manual && child) {
                    // selector structure output depth
                    const D = deep - 1
                    treeSet(node, D, unset)
                  } else {
                    let mat = 'child'
                    //
                    // Set Element-Geometry "Final Grade"
                    mat = setMat(node, mat, manual, child)
                    setRect(rect, z, mat, unset)
                  }
                }
              }
            }
          }
        }
      }

      return treeSet(opts.selector, depth)
    },
    /**
     * Non-critical operations, as grade processes to sync
     * @param {Object} grade structure for rectangle elements
     */
    treeSort: function (grade) {
      const { atlas, rects } = grade

      for (const [idx, rect] of rects) {
        if (rect.minor) {
          //rect.idx = Number(idx) // key()
        } else {
          // remove key
          const node = document.querySelector("[data-idx='" + idx + "']")
          node && node.removeAttribute('data-idx')
          rects.delete(idx)
        }
      }

      //
      // Viewport Helper (bounds mesh)
      // no recreate, for random document idx
      const viewHelper = grade.el.getRootNode().body
      if (!viewHelper.dataset['idx']) {
        const idx = [viewHelper.nodeName, grade.batch, new Date().getTime()].join('_')
        const rect = new mpos.mod.tRect(viewHelper, { idx: idx, major: 'other', minor: 'wire', z: -9, fix: true, add: 1 })
        viewHelper.setAttribute('data-idx', idx)
        mpos.set.inPolar(rect)
        //rect.ux.i = 1;

        console.log('sync viewHelper', viewHelper)

        // define manually
        grade.rects.set(idx, rect)
        mpos.set.key(grade, rect)
      }
    },
    /**
     * Create graded records from nodes, for synthetic ux
     * @param {(HTMLElement|string)} selector root node
     * @param {Object} opts gui parameters
     * @returns {Object} graded structure
     */
    add: async function (selector, opts = {}) {
      const { opt, tool, geo, mat, mat_shader, mat_line, scene, cloneX } = mpvar
      const precept = this.precept

      // options
      opts.depth ||= opt.depth
      opts.parse ||= precept.parse
      // selector: term permits selector/element/uri, and opt default
      opts.selector = selector || opt.selector

      // grade:
      let grade = opts.grade || new this.tGrade(opts)

      //
      // Element NodeIterator for geometry type
      if (opts.grade) {
        const m = mpos.fnVar('march', opts.selector, {})
        opts.zSlot = m.root
        // grade append: element(s) extend existing
        this.treeFlat(grade, opts)
        this.treeDeep(grade, opts)
        this.treeSort(grade)
      } else {
        // set selector (or uri object)
        let om = mpos.fnVar('omni', opts.selector, { grade: grade })
        let element = om.terms[0]
        if (!element || (!!grade.wait && element.isSameNode(grade.el))) {
          return
        }

        // external uri loads into object resource
        if (opts.custom) {
          await tool
            .load(opts.custom, { io: 'src', node: element, attribute: 'data' })
            .then((res) => {
              console.log('res', res)
              // use document contentDocument.body instead of CSS3D
              if (element.contentDocument) {
                element = element.contentDocument.body
              }
            })
            .catch((err) => {
              console.error('err: ', err) // CORS
              return
            })
        }

        // dispose objects from last batch
        grade.el = opts.selector = element
        grade.wait = Infinity
        await tool.old()

        // grade rebuild: structure is replaced
        this.treeFlat(grade)
        this.treeDeep(grade, opts)
        this.treeSort(grade)

        //
        // Texture Atlas: relative to grade
        // note: async mipmap[w] from naive average area (size/cellMip),
        // but update dynamic (atlas size, cellMip) between treeDeep (elsMax++, areaAvg++) and treeSort (cellMip2, idxMip2)
        const atlas = grade.atlas
        document.querySelector('#mp #atlas').appendChild(atlas.canvas)
        atlas.canvas.width = atlas.canvas.height = atlas.size
        atlas.canvas.title = `${grade.group.name}#${grade.batch} ${atlas.size}px/${atlas.cells}`

        const cellMap = atlas.size / atlas.cells
        // set MipMap pixel references
        let xColumn = atlas.uv['+1.00'].span
        for (const [mip, uv] of Object.entries(atlas.uv)) {
          // resolution
          atlas.uv[mip].map = Math.floor(mip * cellMap)
          // offset x column
          if (mip == '+1.00' || mip <= 0) continue
          uv.xColumn = xColumn
          xColumn += uv.span
        }

        // Atlas Key structure: RawShaderMaterial cellMap guide
        atlas.keyTest = { x: 0.6, y: 1.0, alpha: 'rgba( 0, 128, 128, 0.125 )' }
        // normal uvw to atlas transforms
        atlas.ctx.fillStyle = atlas.keyTest.alpha
        atlas.ctx.fillRect(atlas.size * atlas.keyTest.x, atlas.size * atlas.keyTest.y - cellMap, cellMap, cellMap)

        // Instanced Mesh for standard DOM structure
        const shader = mpos.set.shader(atlas.canvas, atlas.cells, mat_shader)
        const instanced = new THREE.InstancedMesh(geo, [mat, mat, mat, mat, shader, mat_line], grade.elsMax)
        instanced.layers.set(2)
        mpos.set.use(instanced, true)

        // Shader Atlas
        instanced.userData.shader = shader
        instanced.userData.el = grade.el
        instanced.name = [grade.batch, grade.el.tagName].join('_')
        atlas.instanced = instanced
        grade.group.add(instanced)

        // Atlas UV Buffer
        const uvOffset = new THREE.InstancedBufferAttribute(new Float32Array(grade.elsMax * 3).fill(-1), 3)
        uvOffset.setUsage(THREE.DynamicDrawUsage)
        instanced.geometry.setAttribute('uvOffset', uvOffset)

        atlas.uvOffset = instanced.geometry.getAttribute('uvOffset')

        // toSVG shared font-family
        atlas.inline = new cloneX({
          fontEmbedCSS: await getFontEmbedCSS(grade.el), // only .lil-gui..?
          filter: cloneX.filterEmpty
        })

        //
        // OUTPUT
        mpvar.grade = grade
        if (scene) scene.add(grade.group)
        grade.wait = false
      }

      // NOTE: await tree recursion (of grade rects) is non-blocking (to sync),
      // but access to accumulate is naive (treeSort, load, old, unset...)

      // start frameloop
      const hasDelay = mpos.ux.timers.delay
      if (opt.delay && !hasDelay.length) {
        grade.major.queue.add('delay')
        mpos.ux.reflow({ type: 'delay', value: opt.delay })
      }

      // process frame, unless lambda append
      if (!opts.grade && !hasDelay) mpos.step.sync(grade)

      console.log('add grade:', grade)
      return grade
    }
  },
  set: {
    /**
     * Rank visibility of elements in viewport
     * @param {Object} rect element record
     * @param {Array} control plot to allocate unsized orphans
     * @returns {number} visibility 1-4 (stop 3.5 is bleed)
     */
    inPolar: function (rect, control) {
      const { grade, opt, time } = mpvar

      if (rect.frame >= grade?.frame) return rect.inPolar
      //
      // Visibility in Viewport
      const node = rect.el
      let vis = node && (node.tagName || node.textContent.trim()) ? 1 : false

      if (rect.css) {
        // Falsy LIFO Check: compare z-depth (onion skin) to depth slider
        const onion = typeof rect.z === 'number' ? rect.z <= opt.depth : false
        vis = vis && onion ? vis : 0
      }

      if (vis) {
        if (node.nodeName === '#text' && typeof control === 'object') {
          // Node relative in control plot
          vis = Object.values(control).some((tag) => {
            const parent = node.parentElement
            const unlist = parent && parent.offsetWidth && parent.offsetHeight
            return unlist && node.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_CONTAINS
          })
        } else {
          // 1: Node not empty
          if (node.tagName) {
            // 2: Node is tag
            vis++

            if (rect.diffs) rect.diffs.bound = rect.bound
            rect.bound = rect.el.getBoundingClientRect()
            rect.bound.box = { width: rect.el.offsetWidth, height: rect.el.offsetHeight }
            const style = rect.css?.style || node.style

            const alphaTest =
              !(rect.bound.height === 0 || rect.bound.width === 0) &&
              !(style.display === 'none' || style.visibility === 'hidden') &&
              !((style.opacity || Infinity) <= 0.25)
            // strict test (i.e. closed details)
            if (alphaTest && node.checkVisibility()) {
              // 3: Tag is visible
              vis++

              function clipView(bound, orient, margin) {
                // clipping by viewport
                const view = Math.max(document.documentElement['client' + orient], window['inner' + orient])

                // oob debounce zone (2x vertical)
                margin ||= view / 2
                if (orient === 'Width') margin /= 2

                let scroll
                const [aa, bb] = orient === 'Height' ? ['bottom', 'top'] : ['right', 'left']
                const bleed = bound[aa] >= -margin && bound[bb] - view < margin
                if (bleed) scroll = bound[aa] >= 0 && bound[bb] - view < 0

                return { scroll: scroll, bleed: bleed }
              }

              const clipY = clipView(rect.bound, 'Height')
              const clipX = clipView(rect.bound, 'Width')
              if (clipY.scroll && clipX.scroll) {
                // 4: Tag in viewport
                vis++
              } else if (clipY.bleed && clipX.bleed) {
                // oob zone: as boxes exit viewport, update priority degrades,
                // so prevent box lockup (on reflow debounce)
                vis += 0.5
              }
            }
          }
        }
      }

      rect.inPolar = vis
      return vis
    },
    /**
     * Register assigned data-idx, for queue updates
     * @param {Object} grade structure for rectangle elements
     * @param {Object} rect element record
     */
    key: function (grade, rect) {
      const _major_ = grade.major[rect.major]

      // idx type: major == string, grade.rects == number
      if (!rect.revoke && !_major_.has(rect.idx)) {
        grade.elsMin++

        if (rect.major === 'atlas') {
          if (rect.minor === 'poster' || rect.minor === 'native') {
            // note: naive estimate of cells, or actual (elsMin/elsMax > mmReal)
            grade.mmFull()

            const atlas = grade.atlas
            const area = rect.bound.width * rect.bound.height
            let mip = '+0.50'

            // node FIFO, descending mip, area no priority sort
            const uvDsc = Object.keys(atlas.uv).sort().reverse()
            for (const key of uvDsc) {
              // note: cumulative average requires async/await (deterministic)
              if (key > 0 && area >= atlas.uv[key].area) {
                mip = key
                break
              } else if (key <= 0) {
                // tiny "+0.00" is bad fraction..?
                mip = '+0.25'
              }
            }

            // set for atlas indexing
            rect.uv = { mip: mip }

            // structural rect (self, child) has no idx, dynamic size has extra idx
            // idx: atlas.uv["+1.00"].idx++, idxMip: atlas.uv["+?.??"].idx++
          } else if (rect.minor === 'self') {
            //
            // support background images, with minimal mip (for performance and quantity)
            // ...but filter limit could be lifted to support bullets, or re-draw children elements (composite or registration?)
            const style = rect.css.style || window.getComputedStyle(rect.el) // ideally shared or saved, but no deep usage info yet
            const isStyled = style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)'

            if (isStyled) rect.uv = { mip: '+0.25' }
          }
        } else if (rect.major === 'other') {
          // STATES:
          // 1: to be added, 2: being added, 3: added
          rect.add = 1
        }

        // add key
        _major_.set(_major_.size, rect.idx.toString())
      } else {
        // key exists(?) in grade:
        // - request to revoke internal/external?
        // - require flag, or assume if no element?
        if (rect.revoke) {
          //console.log("revoke keys");
          const revoke = grade.major.revoke

          // delete
          for (const [i, idx] of _major_.entries()) {
            if (revoke.has(idx)) {
              _major_.delete(i)
              grade.rects.delete(idx.toString())
              // live public array..?
              revoke.delete(idx)
              // batch?
              //break;
            }
          }

          // dispose resources?
          //const Object3D = scene.getObjectByProperty("name", idx);
          //grade.elsMax--;
          //grade.elsMin--;
        }
      }
    },
    /**
     * Path to update or create geometry
     * @param {*} rect element record
     * @param {*} opts frame (or lambda flags)
     */
    box: function (rect, opts = {}) {
      const { geo, mat, fov, opt, grade } = mpvar
      // setFlash: diagnose lossy frames (isolate css/transform)
      // example: pingpong (interlace, stretch/offcenter), FOUC (bubble/phase, init/slow)
      // if (setFlash) { } // manual coalesce ??= BODY.wire, !css, ux.has("matrix") && ux.o
      const setFlash = opt.setFlash && rect.frame >= opts.frame && !rect.ux.u.has('matrix')
      /*rect.major === "atlas" &&*/

      // frame is "up-to-date"
      // - todo: but could be shallow copy (~phase bubble, tween/matrix)
      //   - require 1-off set (css, !transform )
      // - transform falsy with !ux.u.has("matrix")?
      // - return obj :: !!setFlash :: (ux.o||ux.u.size)
      //

      //
      // Accumulate Transforms: frame differ
      if (!setFlash) mpos.set.css(rect, opts.frame)

      //
      // TYPE OF MESH FROM ELEMENT
      let object
      if (rect.obj) {
        object = rect.obj
      } else if (rect.major === 'other') {
        const resource = grade.group.getObjectByName(rect.idx)
        if (resource) {
          // prevent duplicate resource from delayed response during loads
          // via status of async concurrent requests
          // native is old by frame 2, whereas loader may take time
          return
        } else {
          const group = new THREE.Group()
          group.name = rect.idx
          group.userData.el = rect.el
          group.userData.idx = rect.idx
          rect.obj = group

          if (rect.minor === 'native') {
            // todo: de-dupe all "other" (loader) via rect.obj = Group && fit/use scene.getObjectByName
            //const loaded = mpvar.rendererCSS.domElement.querySelector(`[data-batch="${grade.batch}"] [data-idx="${rect.idx}"]`)

            // note: element may not inherit some specific styles
            const el = rect.el.cloneNode(true)
            // wrap prevents overwritten transform, and inherits some attributes
            const stub = rect.el.parentElement
            const tag = stub.tagName !== 'BODY' ? stub.tagName : 'DIV'
            const wrap = document.createElement(tag)
            wrap.classList.add('mp-native')
            wrap.setAttribute('data-batch', grade.batch)
            wrap.append(el)
            wrap.style.zIndex = rect.css.style?.zIndex || ''

            // hack at some problems:
            // relative width and height
            // duplicate ids or data-idx
            wrap.style.width = stub.clientWidth + 'px'
            wrap.style.height = rect.bound.height + 'px'

            const css3d = new CSS3DObject(wrap)

            // Out: most userData.el reference an original, not a clone
            css3d.userData.el = el

            object = css3d
          } else if (rect.minor === 'wire') {
            // Mesh unclassified (currently only root node)
            //let plane = new THREE.PlaneGeometry(1, 1);
            //plane.translate(0, 0, -9);
            //const mesh = new THREE.Mesh(plane, mat_line);
            //mesh.animate = true;

            const material = mat.clone()
            material.vertexColors = true
            material.color = null

            //const { left, right, top, bottom, width, height } = rect.bound;
            const geometry = new THREE.BufferGeometry()
            const vertices = new Float32Array([
              0, 0, 0, 1, 0, 0 /*edge top*/, 0, 1, 0, 1, 1, 0 /*edge bottom*/, -0.25, -0.5, 0, 1.25, -0.5, 0 /*bleed top*/, -0.25, 1.5, 0,
              1.25, 1.5, 0 /*bleed bottom*/
            ])

            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
            geometry.setAttribute(
              'color',
              new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], 3)
            )
            geometry.translate(-0.5, -0.5, -1)
            const line = new THREE.LineSegments(geometry, material)

            group.add(line)

            // Out
            group.userData.el = rect.el
            group.animate = line.animate = true
            object = line
            rect.obj = line
          } else {
            // loader dummy
            object = new THREE.Object3D()
          }
        }
      } else {
        // Instanced Mesh
        object = new THREE.Object3D()
      }

      /**
       * Update matrix for mesh from bounding rectangle
       * @param {Object} obj Object3D
       */
      function transform(obj) {
        const { css, bound } = rect
        //
        // TRANSFORMS: apply accumulate for natural box model
        // note: bound setter (inPolar) and loss (pingpong) affect live mismatch (geometry/material)

        // scale
        const w = bound.box.width
        const h = bound.box.height
        const d = fov.z
        // position
        let x = bound.width / 2
        let y = -bound.height / 2
        // scroll{0,0} is viewport, not document
        const scroll = opts.scroll || { x: 0, y: 0 }
        if (!scroll.fix) {
          x += scroll.x + bound.left
          y += scroll.y - bound.top
        }

        // z subset mimics DOM honor (not 100% faithful)
        // being expanded (for z-target ux) AND compressed (into view frustum)
        const zGrade = rect.z + 1 // NodeIterator index [ 1, 2, 3 ... ] from selector
        const zIndex = css?.style?.zIndex || 'auto' // user-agent stylesheet
        let zDomain = zIndex === 'auto' // inheritance assigned (mimic DOM honor)
        const zSign = zDomain || zIndex >= 0 ? 1 : -1

        // SCALE domain => range
        let zRange = zGrade + (zDomain ? 0.5 : Math.abs(zIndex))
        const zScale = 1 - 1 / (zRange + 1)

        let z = zSign * zScale * (fov.z * 2)

        // extrude bias to cure z-fighting
        const extrude = rect.minor !== 'self' && rect.minor !== 'wire' ? fov.z / 2 + fov.z / 4 : 0
        z += extrude

        if (obj.isCSS3DObject) {
          obj.position.set(x, y, z)
          // element does not scale like group
          obj.userData.el.style.width = w
          obj.userData.el.style.height = h
          // note: actually using cumulative
          if (css.matrix) {
            const cssScale = 'scale(' + css.scale + ')'
            const cssDeg = Math.round(css.rotation.z * (180 / Math.PI))
            const cssRotate = 'rotate(' + cssDeg + 'deg)'
            obj.userData.el.style.transform = [cssScale, cssRotate].join(' ')
          }
        } else {
          //Generic
          // group implies loader, with arbitrary scale
          const dummy = obj.isGroup ? new THREE.Object3D() : obj

          dummy.position.set(x, y, z)
          dummy.scale.set(w * css.scale, h * css.scale, d)

          // gimbal lock: rotate3d(x,y,z, deg) use z or x/y (but not both)!
          // unit .5turn: rotate3d(-3,1,9, .5turn) use x/y/z (but only 0.5turn)
          // perspective is misleading: non-orthographic camera versus DOM css pixels
          // ThreeJS instance object incorrectly inherits nested child rotation (mostly xy)
          //obj.rotation.order = "YXZ"; // yaw-pitch or since most matrix2d rotate is z, ZYX...
          const gimbal = css.rotation.z && (css.rotation.x || css.rotation.y) ? -1 : 1
          obj.rotation.x = css.rotation.x || 0
          obj.rotation.y = -css.rotation.y || 0
          obj.rotation.z = -css.rotation.z * gimbal || 0

          // note: group affects raycast events and click-targets
          if (obj.isGroup) mpos.set.fit(dummy, obj)
        }

        if (opt.arc) {
          // arc radial
          const damp = opt.arc
          const mid = fov.width / 2
          const rad = (mid - x) / mid
          const pos = mid * Math.abs(rad)
          // bulge from view center
          obj.rotation.y = rad * damp * 2
          obj.position.setZ(z + pos * damp)
        }

        obj.updateMatrix()
      }

      //
      // Matrix Frame Update
      if (!setFlash) transform(object)

      let bprop = object

      if (rect.add === 1) {
        rect.add = 2
        //rect.obj.visible = false
        // Load Additional Resource (async)
        if (rect.minor === 'loader') {
          bprop = rect.obj
          mpos.set.loader(rect, object)
        } else {
          grade.group.add(object)
          rect.obj = object
          // Generic types: (wire, native CSS3D) could set rect.add if needed
          //mpos.set.use(object,true)
        }
      } else if (rect.add > 1 && !rect.obj) {
        // Object3D was detached by repeat attempts to add
        console.log('detached:', rect)
        rect.obj = mpvar.scene.getObjectByName(rect.idx)
      }

      // composed dummy/matrix needsUpdate: discard flash (of phase push_back)..?
      bprop = setFlash ? false : bprop
      return bprop
    },
    /**
     * Bubble phase to accumulate matrix/style for differs (pre/post) to enqueue
     * @param {*} rect element record
     * @param {*} frame pointer reflow or delay
     */
    css: function (rect, frame) {
      const { grade, tool, time } = mpvar

      // frame from delay or reflow
      if (frame > rect.frame) {
        if (rect.el.isSameNode(document.body)) {
          // viewHelper: doesn't need frame/css... unless body is selector, or phase capture?
          rect.frame = frame
          return
        }

        // css style: transform, transformOrigin, backgroundColor, zIndex, position
        const { ux, css, diffs } = rect

        //
        // Differs (pre/post): stash
        // note: inPolar sets rect.bound early (filter)
        diffs.html = css.html //TEST
        diffs.phase = ux.u.has('phase')
        diffs.rotation = css.rotation
        diffs.scale = css.scale
        diffs.tween = css.tween
        diffs.matrix = css.matrix

        //
        // Differs feature: reset
        css.rotation = { x: 0, y: 0, z: 0 }
        css.scale = 1
        css.tween = {}
        css.matrix = 0
        const stateOld = ux.u.has('phase')
        ux.u.clear()
        //
        // Discrete style: reset
        // note: properties like includeStyleProperties for toSvg/cloneX
        mpos.mod.precept.tween.forEach((prop) => {
          //if (css.style?.hasOwnProperty(prop)) // need indirect
          css.tween[prop] = css.style[prop]
        })
        // passive flush/fuse (test #swarm/#flood)
        css.html = rect.el.innerHTML.replace(/[\s=<>"'%:;(//)(!--)]+|(class|active)+/gi, '')

        //
        // Explicit: diffs feature
        let matrix = tool.diffs('matrix', { rect: rect })
        // style computed for feature lazily / progressively
        if (css.style.none && (ux.i || matrix)) css.style = window.getComputedStyle(rect.el)
        // Priority ux: escalate
        if (rect.major === 'atlas') tool.diffs('phase', { rect: rect, capture: grade.capture })
        const priority = tool.diffs('tween', { rect: rect }) || ux.u.has('phase') || diffs.phase || matrix
        ux.o = priority ? ux.i + 1 : ux.i
        //ux.o += ux.u.size;
        // compute qualified stylesheet (not inline)
        if (css.style.none && (ux.o || ux.u.size)) css.style = window.getComputedStyle(rect.el)

        //
        // Constants
        let el = rect.el
        let max_depth = 8 // deep tree?
        let style

        const hover = stateOld || (ux.o > 1 && ux.u.has('phase') && rect.el.matches(':hover'))

        while (matrix && el && max_depth--) {
          if (el.isSameNode(document.body) || el.isSameNode(document.documentElement) || !el.parentElement) {
            break
          }

          // Ancestors (top-down) have frame update
          // DOM traverse
          const _rect_ = grade.rects.get(el.getAttribute('data-idx'))
          if (_rect_?.ux.o) {
            // output (rect.o) was escalated, but matrix (rect.u) may be removed in post if no differ (to reduce atlas queue)
            // if (_rect_.ux.u.has("matrix")) { // matrix was removed if unchanged, but output was escalated
            // accumulate ancestor matrix
            style = _rect_.css.style || css.style // || window.getComputedStyle(el)

            if (style && style !== 'none' /*tool.diffs("matrix", { rect: rect })*/) {
              // Parse CSS transforms. Prefer matrix3d() when available
              const transformStr = style.transform || ''

              // matrix3d(...) contains 16 values and can represent chained 3D transforms
              const m3 = transformStr.match(/matrix3d\(([^)]+)\)/)
              if (m3) {
                const nums = m3[1].split(',').map((v) => parseFloat(v.trim()))
                if (nums.length === 16 && nums.every((n) => !Number.isNaN(n))) {
                  // Extract upper-left 3x3 rotation part
                  const R00 = nums[0],
                    R01 = nums[1],
                    R02 = nums[2]
                  const R10 = nums[4],
                    R11 = nums[5],
                    R12 = nums[6]
                  const R20 = nums[8],
                    R21 = nums[9],
                    R22 = nums[10]

                  // Decompose to Euler angles (order: X, Y, Z)
                  const sy = Math.sqrt(R00 * R00 + R10 * R10)
                  const singular = sy < 1e-6
                  let rx = 0,
                    ry = 0,
                    rz = 0
                  if (!singular) {
                    rx = Math.atan2(R21, R22)
                    ry = Math.atan2(-R20, sy)
                    rz = Math.atan2(R10, R00)
                  } else {
                    rx = Math.atan2(-R12, R11)
                    ry = Math.atan2(-R20, sy)
                    rz = 0
                  }

                  css.rotation.x += tool.eq(rx)
                  css.rotation.y += tool.eq(ry)
                  css.rotation.z += tool.eq(rz)
                  css.matrix++
                }
              } else {
                // Fallback to 2D matrix(...) and explicit rotate functions
                const matrix2d = transformStr.match(/matrix\(([^)]+)\)/)
                if (matrix2d) {
                  const vals = matrix2d[1].split(',').map((v) => parseFloat(v.trim()))
                  if (vals.length >= 2 && !Number.isNaN(vals[0]) && !Number.isNaN(vals[1])) {
                    const scaleVal = Math.sqrt(vals[0] * vals[0] + vals[1] * vals[1])
                    const ang = Math.atan2(vals[1], vals[0])
                    css.scale *= scaleVal
                    css.rotation.z += tool.eq(ang)
                    css.matrix++
                  }
                }

                /*
                // Note: if transform functions chain with matrix(), matrix3d() should be non-empty.
                // Note: rotate3d() should test angle unit type (deg/rad/turn).

                // rotateX/Y/Z and rotate3d(x,y,z,angle)
                const rxMatch = transformStr.match(/rotateX\(([^)]+)deg\)/)
                const ryMatch = transformStr.match(/rotateY\(([^)]+)deg\)/)
                const rzMatch = transformStr.match(/rotateZ\(([^)]+)deg\)/)
                const r3Match = transformStr.match(/rotate3d\(([^)]+)\)/)

                if (rxMatch) css.rotation.x += parseFloat(rxMatch[1]) * (Math.PI / 180)
                if (ryMatch) css.rotation.y += parseFloat(ryMatch[1]) * (Math.PI / 180)
                if (rzMatch) css.rotation.z += parseFloat(rzMatch[1]) * (Math.PI / 180)
                if (r3Match) {
                  const parts = r3Match[1].split(",").map(v => parseFloat(v.trim()))
                  if (parts.length === 4 && parts.every(n => !Number.isNaN(n))) {
                    const [ax, ay, az, angle] = parts
                    const rad = angle * (Math.PI / 180)
                    css.rotation.x += ax * rad
                    css.rotation.y += ay * rad
                    css.rotation.z += az * rad
                  }
                }*/
              }
            }
            //}
            if (hover) {
              // test: phase bubbles :hover (not focus/active), for contageous effects
              _rect_.ux.o++
            }
          }

          // traverse DOM [allow, *]
          el = el.parentElement.closest('[data-idx]')
        }

        //
        // Rect style updates from frame, to reduce queue (atlas/transforms)
        // note: inPolar pre-sets rect[bound/box], but "here" is "live" getBoundingClientRect
        rect.css = css

        //
        // Implicit: compare frame result (pre/post) for "true" change
        // push_back: css captures <>> matrix

        // new html: passive not pageload
        // push_back: rate bubbles <>> phase
        const allow = mpos.mod.precept.allow
        const newHTML = diffs.html ? diffs.html !== css.html && rect.major === 'atlas' && rect.frame > 1 : false // rect.el.matches([allow]) && rect.minor === "poster")
        // new keyframe: transition, animation, or property
        const newTween = !tool.eq(diffs.tween, { diff: css.tween })

        // new bounding: (...or circle/square rotated 90-degrees?)
        const newTranslate = !tool.eq(diffs.bound, { diff: rect.bound })

        if (matrix || newTranslate || diffs.matrix !== css.matrix) {
          // note: shallow style inheritance test
          // checks newTranslate (in addition to naive matrix)
          // or (for example) as rotating rectangle approaches 0-deg
          // it will "gimbal lock" OTHERWISE REMOVE THIS CLAUSE

          // new rotation:
          const newRotate = !tool.eq(diffs.rotation, { diff: css.rotation })
          // new matrices:
          const newTransform = newRotate || diffs.scale !== css.scale

          // Implicit:
          // capture: atlas ignore most matrix   <<   transforms ignore old matrix
          // bubble:  atlas focus new style      >>   transforms focus atlas style
          if (newTransform || newTranslate) {
            ux.u.add('matrix')
          } else {
            // proactively
            if (!newTranslate) ux.u.delete('matrix')
          }

          //
          // Unset Features from Queue:
          if (ux.u.has('matrix')) {
            // element has technical transform
            // 3.5: coalesce features of transform<>>visibility
            //ux.o += ux.u.size;

            // probably resize
            const newSize = !tool.eq(diffs.bound.box, { diff: rect.bound.box }) || diffs.scale !== css.scale
            // probably pagescroll
            const newScroll = newTranslate && !newSize && !css.matrix
            // probably rotational symmetry
            const newSymmetry = !newSize && newRotate

            // note: if element leaves viewport visible (inPolar 3.5 bleed)
            // as transition/delay continues (play state=stopped),
            // texture will NOT UPDATE, without
            // ... flush.fuse or differ.html === css.html

            // increase rate: slider, resizable
            //if (newSize) ux.o += ux.u.size;
            // decrease rate: pure rotation
            if (newRotate && !newSize) {
              //&& ((!newTween || !ux.u.has("tween")) && (!newHTML || !newTransform))
              //ux.u.delete("tween");
              //ux.o = 0;
            }

            // test case: sync pingpongs ? atlas : transforms
            // so debounce basic scroll push_back (greedy toSvg),
            // but preserve direct ux.u matrix rotation (to avoid detached, parallax frames)
            // ...?
            if (newScroll && time.st.pingpong) {
              ux.u.delete('tween')
              ux.u.delete('phase')
            }
          }
        }

        // phase: pseudo/tween animation/transition
        // 1. state [playing/stopped/stateOld]
        // 2. delay [...differs, ...callback(ms)]
        // 3. ...mp-custom?
        if (!newTween && ux.u.has('tween')) {
          // interpolate running animation
          // note: bubble (lambda) children cascade (via rate)
          if (!newHTML && !time.st.pingpong) ux.u.delete('tween')
        } else if (newTween && !ux.u.has('tween')) {
          // detect incidental changes
          // note: relaxing tween with pingpong may leave artifacts
          ux.u.add('tween')
        }

        // frame has current ux diffs, regardless of access by step.sync
        rect.frame = frame

        if (frame === 0) {
          // mouseevents (0) provide some increments
          // note: rect.frame inits with -1
          const tick = 0.001
          rect.frame += tick
        }
      }

      return // {width:w,height:h}
    },
    /**
     * update matrix manually
     */
    use: function (object, off) {
      const { time } = mpvar
      //if (!off && !time.st.subsub) return;

      const matrixUpdate = off ? 'matrixAutoUpdate' : 'needsUpdate'
      if (object.isInstancedMesh) {
        object.instanceMatrix[matrixUpdate] = !off
        //object.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        if (off) {
          // raycast requires bounding sphere (not every frame!)
          const center = new THREE.Vector3(mpvar.fov.width / 2, mpvar.fov.height / 2, 0)
          object.boundingSphere = new THREE.Sphere(center, mpvar.fov.basis * 4)
          // narrow AABB reduces coplanar intersect
          const min = new THREE.Vector3(-mpvar.fov.width / 2, -mpvar.fov.height, -99)
          const max = new THREE.Vector3(mpvar.fov.width * 1.5, mpvar.fov.height * 2, 99)
          object.boundingBox = new THREE.Box3(min, max)
        } else if (!time.st.flush.fuse) {
          // note: limit range of z-index 99 may smooth occlusion by oversized models
          //object.computeBoundingBox();
        }
      } else {
        if (object.isMesh || object.isGroup) object[matrixUpdate] = !off
        //if (object.isGroup)
        //  object.children.forEach((child) => (child[matrixUpdate] = !off));
      }
    },
    /**
     * RawShaderMaterial atlas which updates from mipmap/uvw
     */
    shader: function (canvas, texStep, mat_shader) {
      //discourse.threejs.org/t/13221/17
      const texAtlas = new THREE.CanvasTexture(canvas)
      texAtlas.minFilter = THREE.NearestFilter
      // update
      const m = mat_shader
      m.uniforms.map.value = texAtlas
      m.uniforms.atlasSize.value = texStep
      // output
      m.userData.t = texAtlas
      return m
    },

    /**
     * Set group scale from dummy, on asset load
     */
    fit: function (dummy, group, opts = {}) {
      if (opts.add) group.add(opts.add)

      if (group.children.length) {
        let s2 = group.userData.s2
        if (!s2) {
          const aabb = new THREE.Box3()
          aabb.setFromObject(group)
          s2 = Math.max(aabb.max.x, aabb.max.y)
          // original scale
          group.userData.s2 = s2
        }

        const s1 = Math.max(dummy.scale.x, dummy.scale.y)
        const scalar = s1 / s2
        group.scale.set(scalar, scalar * -1, scalar)

        // position
        group.position.copy(dummy.position)
        group.position.x -= dummy.scale.x / 2
        group.position.y += dummy.scale.y / 2
        // note: group may lack depth (SVG/OpenCV) or not (JSONLoader)
        group.translateZ(mpvar.fov.z / 2)

        mpos.set.use(group, true)

        // mpos.ux.render()
      }
    },
    /**
     * Stash asset data at uri key, with flags (for disposal...)
     */
    cache: function (asset, uri, data) {
      if (data) asset.data = data
      console.log('set cache', asset)
      mpvar.cache.set(uri, asset)
      // dispose...?
      Object.values(asset.flag).forEach((obj) => {
        if (obj.isObject3D && obj.userData) obj.userData.cache = true
      })
    },
    /**
     * Match mime to Loader, hook, and fit resource
     */
    loader: async function (rect, dummy) {
      const { cache, grade, cloneX, geo, mat, mat_shape, mat_line, tool } = mpvar

      // resource type: Element, Object[src], location..?
      const source = rect.el
      const uri = source.data || source.src || source.currentSrc || source.href

      // source media match: loader or general
      const mimes = {
        VIDEO: ['MP4', 'MOV', 'OGV', 'WEBM'],
        GIF: ['GIF'],
        SDF: ['TXT'],
        OPENCV: ['JPG', 'JPEG', 'PNG', 'WEBP'], //[avif,heif,hevc,heic,avc]
        GLTF: ['GLB', 'GLTF'],
        SVG: ['SVG'],
        JSON: ['JSON']
      }
      mimes.all = Object.values(mimes).flat().join('|')
      mimes.pattern = new RegExp(`\\.(${mimes.all})(?=\\?|$)`, 'i')
      // regex test pattern
      let mime = uri && uri.match(mimes.pattern)
      mime = mime ? mime[1].toUpperCase() : 'File'

      /**
       * Loaders: THREE.[MIME/File]Loader, OpenCV, Gifuct, Video...
       */
      let loader = !!((mime === 'File' && uri) || [mimes.GLTF, mimes.SVG, mimes.JSON].flat().includes(mime))

      // Dynamically load Loader
      //const { namedExport1, namedExport2 } = await import("./myModule.js");

      // Asset src and dst
      let asset = cache.get(uri) || { mime: mime, data: false, flag: {} }
      let group = rect.obj
      //console.log(source, uri, mime, loader, dummy )

      if (mimes.VIDEO.includes(mime)) {
        //
        // VideoTexture:
        // note: generic manager for playback in document template
        const material = mat_shape.clone()
        const texture = new THREE.VideoTexture(source)
        material.map = texture
        const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])

        // unique overrides
        mesh.matrix.copy(dummy.matrix)
        grade.group.add(mesh)
        mpos.set.use(mesh, true)

        // Output
        rect.obj = mesh
        mesh.name = mesh.userData.idx = rect.idx
        mesh.userData.el = rect.el

        mesh.layers.set(2)
        rect.add++
      } else if (mimes.GIF.includes(mime)) {
        const material = mat_shape.clone()
        const mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, material, mat_line])

        //
        // Gifuct
        const promisedGif = fetch(uri)
          .then((resp) => resp.arrayBuffer())
          .then((buff) => {
            let gif = parseGIF(buff)
            let frames = decompressFrames(gif, true)

            // 0. parse meta
            let duration = 0
            frames.forEach((frame) => {
              duration += frame.delay
            })

            // 1. full gif canvas
            let gifCanvas = document.createElement('canvas')
            let gifCtx = gifCanvas.getContext('2d')

            gifCanvas.width = gif.lsd.width
            gifCanvas.height = gif.lsd.height
            // 2. patch gif canvas
            let tempCanvas = document.createElement('canvas')
            let tempCtx = tempCanvas.getContext('2d')

            //
            // Draw Gif frames to cache: for update in step>transforms
            const [width, height] = tool.pyr(gif.lsd.width, gif.lsd.height, 64)
            let frameImageData
            frames.forEach((frame) => {
              let dims = frame.dims

              // render gif: update patch
              if (frame.disposalType === 2) {
                gifCtx.clearRect(0, 0, gifCtx.canvas.width, gifCtx.canvas.height)
              }

              if (!frameImageData || dims.width != frameImageData.width || dims.height != frameImageData.height) {
                tempCtx.canvas.width = dims.width
                tempCtx.canvas.height = dims.height
                frameImageData = tempCtx.createImageData(dims.width, dims.height)
              }

              // set patch data as override
              frameImageData.data.set(frame.patch)
              // draw patch back over canvas
              tempCtx.putImageData(frameImageData, 0, 0)
              gifCtx.drawImage(tempCtx.canvas, dims.left, dims.top)

              // thumbnail
              const cached = document.createElement('canvas')
              const ctx = cached.getContext('2d')
              cached.width = width
              cached.height = height
              // cache
              ctx.drawImage(gifCanvas, 0, 0, width, height)
              frame.cache = cached

              // release memory
              frame.pixels = frame.colorTable = frame.patch = frame.dims = frame.disposalType = null
            })

            console.log('load .GIF', frames)
            // release memory
            gif = gif.frames = gif.gct = gif.lsd = tempCtx = null

            // 3. THREE Texture
            gifCanvas.width = width
            gifCanvas.height = height
            material.map = new THREE.CanvasTexture(gifCanvas)
            mesh.animate = { gif: frames, duration: duration, gifCtx: gifCtx /*, tempCtx: tempCtx,frameImageData: false*/ }
            // Output: mesh (added to group, fits boundingRect)
            grade.group.add(mesh)
            mpos.set.use(mesh, true)
            rect.obj = mesh
            mesh.name = mesh.userData.idx = rect.idx
            // prioritize play state
            rect.ux.i = 1

            return gif
          })
      } else {
        let gc

        if (!loader && ((mime !== 'File' && uri) || (mime === 'File' && !uri))) {
          // sniff role of element source:
          // - MSDF (small+text): context of defined type is simple
          // - CV (large/image): coerce general nodes of complex layout

          let sdf = rect.el.matches(
            /* [mpos.mod.precept.poster, mpos.mod.precept.native] */
            'object,iframe,svg,h1,h2,h3,p,li,td,pre,summary,figcaption,input,label,button'
          )
          sdf &&=
            rect.el.nodeName !== 'IFRAME'
              ? rect.el.innerText.trim()
              : await fetch(rect.el.src).then((txt) => {
                  return txt.text()
                })

          if (mimes.SDF.includes(mime) || sdf?.length < 16) {
            rect.add++

            // Troika requires internet: //cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver
            // and CSS aspect-ratio:1/1;
            //const { Text } = await import('cdn.jsdelivr.net/npm/troika-three-text@0.52.4/+esm')
            const myText = new Text()
            //myScene.add(myText)

            const em = parseFloat(rect.css.style.fontSize) / 100
            // Set properties to configure:
            myText.text = sdf
            myText.fontSize = em
            myText.lineHeight = parseFloat(rect.css.style.lineHeight)
            myText.color = rect.css.style.color
            myText.maxWidth = rect.bound.box.width / 100
            myText.anchorX = 0.5
            myText.anchorY = -0.5

            // Output
            //mpos.set.fit(dummy, group);
            grade.group.add(myText)
            //mpos.set.use(myText, true);
            rect.obj = myText

            // Update the rendering:
            myText.sync()
          } else {
            //
            // Load Element as OpenCV PolyPath

            if (uri && !dummy) {
              // source element from uri file
              gc = source = document.createElement('img')
              source.src = uri
              const osc = document.querySelector('#mp address.mp-offscreen')
              osc.appendChild(source)
              dummy = mpos.set.box({ el: source })
            }

            const [width, height] = tool.pyr(source.naturalWidth, source.naturalHeight, 32)

            const inline = new cloneX({ width: width, height: height })
            toSvg(source, inline)
              .then((clone) => {
                let img = new Image()
                let load = img.addEventListener('load', (e) => {
                  removeEventListener('load', load)
                  // update progress and run module
                  rect.add++
                  mpos.set.opencv(e.target, group, dummy)
                  // cleanup
                  img.remove()
                  img = null
                })

                //github.com/bubkoo/html-to-image/pull/146
                // v1.7.0 viewBox breaks SVG on Firefox, so replace output encode/decode (brittle)
                //clone.replace("viewBox%3D", "preserveAspectRatio%3D%22none%22%20viewBox%3D")
                img.src = clone
                clone = null
              })
              .catch((error) => {
                console.log('src problem', error)
              })

            if (gc) {
              gc.parentElement.removeChild(gc)
              gc = source = null
            }
          }
        } else {
          if (asset.data) {
            //
            // Cache Hit: opt-in to reuse assets (currently only JSON loader...)
            // todo: default type reuse/disposal for unique instances
            const unique = asset.data.isObject3D ? asset.data.clone() : asset.data
            callback(unique)
          } else {
            //
            // set loader primary import
            loader = mimes.SVG.includes(mime)
              ? new SVGLoader()
              : mimes.JSON.includes(mime)
              ? new THREE.ObjectLoader()
              : mimes.GLTF.includes(mime)
              ? new GLTFLoader()
              : new THREE.FileLoader()

            // set loader secondary plugin
            if (mimes.GLTF.includes(mime)) {
              //const { DRACOLoader } = await import('https://cdn.jsdelivr.net/npm/three/examples/js/libs/draco/')
              const dracoLoader = new DRACOLoader()
              dracoLoader.setDecoderPath('//www.gstatic.com/draco/versioned/decoders/1.5.6/')
              loader.setDRACOLoader(dracoLoader)
            }

            // set loader callback parameters
            const params = loader instanceof THREE.Loader ? uri : callback
            const res = loader.load(
              params,
              callback,
              (xhr) => {
                console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`)
              },
              (error) => {
                console.log('error', error)
              }
            )
          }

          /**
           * Callback from THREE.Loader instance
           * @param {Object} data xml response
           */
          function callback(data) {
            rect.add++
            console.log('load', mime, data)

            if (mime === 'File') {
              // file is not image (XML?)
            } else if (mimes.JSON.includes(mime)) {
              // Object.data Extension: Object/Scene Format
              // todo: assign scene values from data-idx

              // Output
              data.name = uri.slice(uri.lastIndexOf('/'))
              mpos.set.fit(dummy, group, { add: data })
              if (!asset.data) mpos.set.cache(asset, uri, data)
            } else if (mimes.GLTF.includes(mime)) {
              // DRACO?
              const mesh = data.scene
              group.add(mesh)
              mpos.set.use(mesh, true)
            } else if (mimes.SVG.includes(mime)) {
              // Object.data Extension: Scalable Vector Graphics Format
              const paths = data.paths || []

              for (let i = 0; i < paths.length; i++) {
                const path = paths[i]
                const material = mat_shape.clone()
                material.color = path.color

                const shapes = SVGLoader.createShapes(path)
                for (let j = 0; j < shapes.length; j++) {
                  const shape = shapes[j]
                  const geometry = new THREE.ShapeGeometry(shape, 2)
                  const mesh = new THREE.Mesh(geometry, material)
                  // out
                  group.add(mesh)
                  mpos.set.use(mesh, true)
                }
              }

              // Output
              mpos.set.fit(dummy, group)
              if (!asset.data) mpos.set.cache(asset, uri, data)
            }

            // set.use()
            if (loader.hasOwnProperty('dispose')) loader.dispose()
          }
        }

        grade.group.add(group)
      }

      //return group
    },
    /**
     * OpenCV: image > kmeans > inrange > contours > shapes
     */
    opencv: function (image, group, dummy) {
      let kmeans = {}
      let Module = {
        _stdin: { image: image, kmeans: kmeans },
        wasmBinaryFile: './opencv_js.wasm',
        preRun: [
          function (e) {
            //console.log("preRun")
          }
        ],
        _main: function (c, v, o) {
          //console.log("_main", c, v, o)
          const cv = this
          let image = this._stdin.image
          let kmeans = this._stdin.kmeans

          try {
            const clusters = 16
            /**
             * Zeroes 1x1
             * @param {Object} mat
             */
            function release(mat) {
              //cv.setTo([0, 0, 0, 0]) // <- pre-optimizes kmeans result to {}
              cv.resize(mat, mat, new cv.Size(1, 1), 0, 0, cv.INTER_NEAREST)
              mat.delete()
            }

            const src = cv.imread(image)
            image = null
            const size = src.size()

            // KMEANS
            const pyr = src.clone()
            const [width, height] = mpvar.tool.pyr(pyr.cols, pyr.rows, clusters * 8)
            cv.resize(pyr, pyr, new cv.Size(width, height), 0, 0, cv.INTER_NEAREST) //AREA,LINEAR,NEAREST

            const sample = new cv.Mat(pyr.rows * pyr.cols, 3, cv.CV_32F)
            for (let y = 0; y < pyr.rows; y++) {
              for (let x = 0; x < pyr.cols; x++) {
                for (let z = 0; z < 3; z++) {
                  sample.floatPtr(y + x * pyr.rows)[z] = pyr.ucharPtr(y, x)[z]
                }
              }
            }
            release(pyr)

            const labels = new cv.Mat()
            const criteria = new cv.TermCriteria(cv.TermCriteria_MAX_ITER + cv.TermCriteria_EPS, 4, 0.8)
            const centers = new cv.Mat()
            cv.kmeans(sample, clusters, labels, criteria, 4, cv.KMEANS_PP_CENTERS, centers)
            release(sample)

            // kmeans colors
            for (let i = 0; i < labels.size().height; i++) {
              const idx = labels.intAt(i, 0)
              if (kmeans[idx] === undefined) {
                let alpha = centers.floatAt(idx, 3)
                if (alpha < 0) {
                  // alpha may be -0 or lost precision at -3e+39
                  // remap, or black material is grey/transparent
                  alpha = alpha === -0 ? 0 : 255
                }

                alpha = alpha < 128 ? Math.max(alpha, 0) : Math.min(alpha, 255)

                kmeans[idx] = {
                  count: 0,
                  rgba: {
                    r: Math.round(centers.floatAt(idx, 0)),
                    g: Math.round(centers.floatAt(idx, 1)),
                    b: Math.round(centers.floatAt(idx, 2)),
                    a: Math.round(alpha)
                  }
                }
              }
              kmeans[idx].count++
            }
            labels.delete()
            centers.delete()

            // inrange
            const lo = new cv.Mat(size, cv.CV_8UC4)
            const hi = new cv.Mat(size, cv.CV_8UC4)
            for (const key in kmeans) {
              const label = kmeans[key]
              const rgba = label.rgba
              // skip transparent
              if (rgba.a < 2) {
                kmeans[key] = undefined
                return
              }

              // INRANGE
              function level(rgba, range = 0, target = 255) {
                // sample dilate/erode for mask, except alpha (from thumb)
                const bands = {}
                const factor = range < 0 ? 0.66 : 1.33

                for (const channel in rgba) {
                  if (channel !== 'a') {
                    let band = rgba[channel] + range
                    band *= factor
                    band = band < 128 ? Math.max(band, 0) : Math.min(band, 255)
                    bands[channel] = band
                  }
                }

                return [bands.r, bands.g, bands.b, target]
              }

              const mask = new cv.Mat.zeros(size, 0)
              const range = 32 // rather greedy
              lo.setTo(level(rgba, -range, 24)) // 16 remove some text alpha
              hi.setTo(level(rgba, range, 255))
              cv.inRange(src, lo, hi, mask)
              // inrange

              // CONTOURS
              const contours = new cv.MatVector()
              const poly = new cv.MatVector()
              const hierarchy = new cv.Mat()
              cv.findContours(mask, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_TC89_L1)
              release(mask)

              // simplify path
              for (let i = 0; i < contours.size(); ++i) {
                const tmp = new cv.Mat()
                const cnt = contours.get(i)
                cv.approxPolyDP(cnt, tmp, 0.5, true)
                poly.push_back(tmp)
                cnt.delete()
                release(tmp)
              }

              // HIERARCHY
              label.retr = {}
              const mArea = 3 // absolute since everything is thumbnail
              for (let i = 0; i < contours.size(); ++i) {
                const cnt = poly.get(i)
                // minimum area
                const area = cv.contourArea(cnt)
                const min = area > mArea
                if (min) {
                  // relationship
                  const hier = Array.from(hierarchy.intPtr(0, i))
                  const parent = hier[3]
                  const rel = parent >= 0 ? parent : i
                  // add shape or holes
                  if (label.retr[rel] === undefined) {
                    label.retr[rel] = { shape: [], holes: [] }
                  }
                  const retr = label.retr[rel]
                  const points = Array.from(cnt.data32S)
                  if (parent >= 0) {
                    retr.holes.push(points)
                  } else {
                    retr.shape = points
                  }
                }
                cnt.delete()
              }
              // path
              contours.delete()
              poly.delete()
              release(hierarchy)

              if (!Object.keys(label.retr).length) {
                kmeans[key] = undefined
              }
            }
            release(src)
            release(lo)
            release(hi)
            // release memory: Int32Array, Mat, pointer...
          } catch (error) {
            console.warn(error)
          }
        },
        postRun: [
          function (e) {
            try {
              console.log('load CV', Object.keys(kmeans).length, group.userData.el.getAttribute('data-idx'))

              let counts = []
              Object.values(kmeans).forEach((label) => counts.push(label.count))
              counts.sort((a, b) => a - b)
              const mean = counts.reduce((sum, num) => sum + num, 0) / counts.length

              // is it line art
              //const n1 = counts[Math.round(counts.length * 0.33)] / mean
              //const n2 = mean / counts[Math.round(counts.length * 0.66)]
              //const n = n1 / n2
              //const evenDist = n < 2 && n > 0.5

              function path(curve, points) {
                for (let cp = 0; cp < points.length; cp += 2) {
                  const vec = { x: points[cp], y: points[cp + 1] }
                  if (cp === 0) {
                    curve.moveTo(vec.x, vec.y)
                  } else {
                    curve.lineTo(vec.x, vec.y)
                  }
                }
              }

              //
              // Shape from label contours
              Object.values(kmeans).forEach((label) => {
                let mergedGeoms = []
                if (label.retr) {
                  Object.values(label.retr).forEach((retr) => {
                    // hierarchy shape
                    const shape = new THREE.Shape()
                    path(shape, retr.shape)
                    // hierarchy holes
                    shape.holes = []
                    for (let i = 0; i < retr.holes.length; i++) {
                      const hole = new THREE.Path()
                      path(hole, retr.holes[i])
                      shape.holes.push(hole)
                    }
                    // label contour
                    // in-out: element > reduced canvas > pyr sample (kmeans/inrange) > approxPoly
                    // ShapeGeometry path is not curve
                    let geometry = new THREE.ShapeGeometry(shape, 1)
                    // mergeVertices tolerance was crunched through opencv pyrdown
                    geometry = mergeVertices(geometry, 1)
                    mergedGeoms.push(geometry)
                  })
                }

                if (mergedGeoms.length) {
                  // label color
                  const rgba = label.rgba
                  const color = new THREE.Color('rgb(' + [rgba.r, rgba.g, rgba.b].join(',') + ')')
                  const material = mpvar.mat_shape.clone()

                  material.color = color

                  if (rgba.a > 192) {
                    material.alphaHash = false
                  } else if (rgba.a < 64) {
                    // alphaTest: alpha has been through a lot!
                    material.opacity = rgba.a / 255
                  }

                  // label contours
                  // todo: cv.copyMakeBorder reduce triangles near corners
                  const mergedBoxes = mergeGeometries(mergedGeoms)
                  const mesh = new THREE.Mesh(mergedBoxes, material)

                  mpos.set.use(mesh, true)
                  group.add(mesh)
                }
              })

              kmeans = null
              mpos.set.fit(dummy, group)
              //mesh.layers.set(2)
            } catch (error) {
              console.warn(error)
            }
          }
        ]
      }

      //huningxin.github.io/opencv.js/samples/index.html
      // vars into Module._main:{} via Module._stdin:{ module: scope }
      opencv(Module)
    }
  },
  step: {
    /**
     * Construct policy to qualify phase (capture/bubble), and update traversal conditions of ux properties: view, style, matrix
     * @param {Object} grade structure for rectangle elements
     * @param {Object} step sync state
     */
    rate: function (grade, step) {
      const { tool, time, opt } = mpvar
      const { major } = grade
      const { frame, queue } = step

      // flags to interlace workloads
      const gate = step.syncFPS === 0 || time.st.gate

      //deepest :pseudo match (frame cache)
      const root = grade.el.parentElement
      if (root && time.st.pingpong)
        grade.capture = {
          hover: [...root.querySelectorAll('[data-idx]:hover')].pop(),
          active: [...root.querySelectorAll('[data-idx]:active')].pop(),
          focus: [...root.querySelectorAll('[data-idx]:focus')].pop()
        }

      let stateOld, stateNew, inPolar
      for (const [idx, rect] of grade.rects) {
        //HTMLUnknownElementPrototype
        if (!rect || !rect.el || !rect.el.isConnected) {
          // first point of failure, but one of 10 modules in loop x1000
          // deleting keys by batch, not individually
          rect.revoke = true // stub for unloading "other"
          grade.major.revoke.add(rect.idx)
          //mpos.set.key(grade, rect);
          continue
        }

        // Phase: cascade (of events/effects) will push_back (from capture/bubble)
        // the ux.u feature diffs (style, matrix...) of pre/post (for css/transforms)
        let { ux } = rect
        stateOld = ux.u.has('phase') || rect.frame === -1
        // early-exit redundant keyframes: reduce queue, boost fps!!1
        if (!stateOld && !time.st.gate) continue

        //
        // Phase refresh: get properties early, which overlap atlas/transforms
        // being specific (not pedantic) to provide valuable relationships
        // which pruning (i.e. pingpong) may destroy (artifacts)
        mpos.set.inPolar(rect) // visibility is central
        inPolar = rect.inPolar + 0.5 >= grade.inPolar // +0.5 bleed, which preloads assets
        if (stateOld || inPolar) mpos.set.css(rect, step.frame)
        stateNew = ux.u.size // && rect.major === "atlas" && time.st.pingpong

        //console.log(stateOld, stateNew, !time.st.flush.fuse);

        // Enqueue, iterate children (phase capture)
        if (stateOld || ((stateNew || !time.st.flush.fuse) && inPolar)) {
          // element ux changed or elevated
          step.queue.add(idx)
          if (rect.el.tagName === 'BODY') continue

          // note: css:pseudo (phase) is experiment (tied to rate pre/post)

          // note: phase is (active), or was (blur), so enqueue (with children)
          // ... to update atlas/transform by forcing ux.u="all"

          if (
            //rect.ux.u.has("phase") &&
            // phase capture: (v1) [box/css] (v2) [pseudo] (v3) [phase=pseudo+]?
            // now: does atlas/other need full/partial set
            //      of children to inherit queue updates?
            // [view | [e | [c][c][c] ] ]
            //
            // i.e. offscreen, !isFocus
            rect.ux.u.size ||
            rect.child?.size ||
            !time.st.flush.fuse /*|| rect.minor === "child"*/
            /* &&
            rect.minor === "self"*/
          ) {
            // cache (valid) children for enqueue, and verify list at interval
            let idx, rect_capt, style, tween
            if (
              !rect.child ||
              !time.st.flush.fuse
              /*(rect.ux.u.size && !rect.child) ||
              (!rect.ux.u.size && !time.st.flush.fuse)*/
            ) {
              // todo: selector filter
              // 1. structure (1-deep): nav, main, article, section, aside, footer
              //  - is:(mp, div, p, ul, ol, li, table, form) // span, details,
              //  - not:(br, a, span, source, track) // summary, figcaption, iframe, video,
              const child = rect.el.querySelectorAll(
                ':scope > [data-idx], :scope > [data-idx] > [data-idx], :scope > :is(mp, div, p, ul, ol, li, table, form)'
              )

              // compare is broad, not fuzzy (!![data-idx] && length !== length)
              // todo: compare set, notify to delete old keys
              const smokeTerm = child.length || !time.st.flush.fuse
              rect.child = new Set() // may be empty, but won't blow up loops

              if (smokeTerm) {
                let max_depth = 16
                for (const node_capt of child) {
                  // capture child relation (major.other lacks deep support, but data-idx may filter)
                  if (max_depth-- > 0) {
                    // push_back: once property captured
                    // set rect.ux.i++ to always integrate,
                    // or stash discrete hook, and refine per-frame (lossy)

                    // diff tween: animated children (.ticker)
                    idx = node_capt.dataset['idx'] // undefined is ok
                    style = window.getComputedStyle(node_capt)
                    tween = tool.diffs('tween', { rect: { css: { style: style } } })

                    // diff html: particles (#flood #swarm)
                    const push_back = grade.rects.get(rect.idx)
                    if (push_back.diffs.html) {
                      const newHTML = push_back.css.html !== push_back.diffs.html
                      if (newHTML) tween = true
                    }

                    if (tween) {
                      rect_capt = { el: node_capt, idx: idx, css: { style: style, tween: tween }, push_back: rect.idx }

                      rect.child.add(rect_capt)
                    }

                    // /* && !rect.el.isSameNode(node_capt) && rect.el.contains(node_capt) */

                    /*
                    const idx = node_capt.dataset["idx"];
                    if (isFinite(idx)) {
                      rect.child.add(node_capt.dataset["idx"]);
                    } else {
                      // anonymous child may lack [data-idx] (of grade rect),
                      // but contain properties to bubble to parent phase
                      // or be "empty" tags (br, noscript)
                      const style = window.getComputedStyle(node_capt);
                      const tween = tool.diffs("tween", {
                        rect: { css: { style: style } },
                      });

                      //if (tween) ux.u.add("tween"); // once
                      if (tween) ux.i++; //always
                      //console.log("child!idx", node_capt, tween);
                    }

                    //window.getComputedStyle(childs[0]).animation
                    */
                  }
                }
              }

              // background process to cascade...?
            }

            // child evaluate: lossy/view
            // RATE reduces queue from css (which bubbles),
            // so also update children (must capture)
            //
            // [ TUNE to BYPASS queues if FRAME phase UNCHANGED MATRIX]
            //
            // PHASE[?PSEUDO+] > TRANSFORM[?MATRIX]
            // ux.u ONLY(?) SEGMENTS atlas (step.queue)
            // since transforms loop all rects (NOT step.queue),
            // BUT since css>phase is PRE-RATED (INCLUDING inPolar and pingpong)
            // box (and/or transforms) could
            //
            // transforms[rects] > box > css[?frame > ?...matrix] > transform > needsUpdate

            for (const node_capt of rect.child) {
              idx = node_capt.idx

              if (idx) {
                // Frame capture: non-linear, but less brutal than ux.u=all
                // may accrue frame ticks from multiple parents :)
                rect_capt = grade.rects.get(idx)
                if (!rect_capt) continue

                mpos.set.inPolar(rect_capt)
                // note: some types may curate offscreen hitboxes?
                if (rect_capt.inPolar + 0.5 >= grade.inPolar) {
                  // accumulate full bubble phase
                  mpos.set.css(rect_capt, step.frame)

                  // Leak-in Effects: propogate defaults during capture,
                  // by association, in attempt to curate children
                  const smokeLeak = false
                  if (smokeLeak) {
                    rect_capt.frame = rect.frame
                    if (rect.ux.u.size) rect_capt.ux.o += rect.ux.u.size
                    if (rect.ux.u.has('phase')) rect_capt.ux.u.add('phase')
                    if (rect.ux.u.has('tween')) rect_capt.ux.u.add('tween')
                    if (rect.ux.u.has('matrix')) rect_capt.ux.u.add('matrix')

                    if (rect.ux.u.size) step.queue.add(idx)
                  }
                }
              } else {
                // anonymous child lacks [data-idx] (of grade rect),
                // but may push_back properties to parent (during phase capture)

                //node_capt.z = 1;
                //const nc_inPolar = mpos.set.inPolar(node_capt);
                //if(!nc_inPolar) continue;

                // note: some types may curate offscreen hitboxes?
                if (node_capt?.css.tween && time.st.gate && inPolar) {
                  // node flags parent of animation (renewed by flush.fuse),
                  // and keeps lambda terms (internal counter, pingpong loss)

                  const push_back = grade.rects.get(node_capt.push_back)
                  push_back.ux.u.add('phase')
                  //node_capt.ux.o++; // once
                  //if (tween) rect.ux.i++; //always

                  //console.log("push_back", node_capt.push_back);
                  // exit, assume homogenous properties
                  break
                }

                // const node_capt = {el:el, idx:?, css: {style:{}, ...phase:?}, z:0 }
              }
            }
          }

          //}
        }
        if (opt.arc) {
          // mokeypatch a update
          // bug: trigger once like "move", and update minor.other
          rect.ux.u.add('matrix')
        }
      }

      // note: stub of rect class, assumes homogenous atlas
      if (grade.major.revoke.size && time.st.pingpong) mpos.set.key(grade, { major: 'atlas', revoke: true })
    },
    /**
     * Process state of event queue, for element types
     * @param {Object} grade structure for rectangle elements
     * @param {(number|string)} pointer type of invocation
     */
    sync: function (grade, pointer) {
      if (!grade || grade.wait || (pointer && !grade.major.queue.size)) {
        // drop frame
        return
      }

      const { opt, time, tool } = mpvar
      //const { major, atlas } = grade;

      grade.wait = true
      //grade.inPolar = opt.inPolar;
      // private stash for atlas/transforms
      const step = {
        frame: 0,
        queue: new Set(grade.major.queue),
        syncFPS: pointer === undefined ? 0 : time.st.gate, // gate transform by caller and time of render
        quality: 1
      }

      // Framerate Limit: pivot execution priority of indeterminate queue
      let sFenceSync = (time.sFenceFPS - time.sFenceDelta) / time.sFenceFPS
      let sPhaseSync = 0.5

      grade.major.queue.clear()
      let reflow = false
      // note: !pointer was frame 0 (no race), before Observer
      // could precede it, so now (queue speed increased) viewHelper moved to treeSort
      if (pointer) {
        // SOFT-update: Observer or frame

        for (const idx of step.queue) {
          if (isFinite(idx)) {
            // new from Observer
            const rect = grade.rects.get(idx)
            if (rect) mpos.set.key(grade, rect)
          } else if (['delay', 'move', 'trim'].includes(idx)) {
            //if (idx === "delay" && !reflow) {
            // moved from loop to Set()
            //}
            reflow = true
          }
        }

        // delay frame time difference
        if (step.queue.has('delay')) {
          let delay = opt['delay']
          delay = delay - delay / 1000 // convert ~time.sFenceFPSms
          const timer = mpos.ux.timers['delay']
          step.frame = timer[timer.length - 1]
          // delta
          const now = time.sFence.oldTime
          const elapsed = (now - time.sPhaseLast || now) + 0.001
          time.sPhaseLast = now
          // deviation from nominal: ms is more sensitive at 1 / 60 than 125+
          const diff = time.sFenceFPS - elapsed
          sPhaseSync = -(delay / diff)
          // note: [1] normal [.2] ok stress [12] slow
        }
      }

      //
      // Time Metrics (Normalized): nominal deviation
      const slice = time.sFenceFPS_slice
      let s0 = 1 / (slice.boundary + 0.001) // [0-16+] +0.001
      let s1 = 1 / slice.ramp // [1-4+]
      let s2 = 1 / slice.sma.average // [1-64+]
      let s3 = Math.abs(sFenceSync / 2) // [-2-0]
      // averages for quality modulation
      let sA = ((s0 + s1) / 2 + (s2 + s3)) / 3
      step.quality = (sA + sFenceSync + sPhaseSync) / 2
      //console.log(step.quality.toFixed(2), "=", +sA.toFixed(2), +sPhaseSync.toFixed(2), +sFenceSync.toFixed(2))

      /* 
      // logging [ALL NORMAL 2026-02-22]
      // TEST: 5s at hi/lo complexity
      // - hi: 127 entries, 50% below (any match .5) 
      // - lo:  21 entries, 50% below (any match .3) 
      //
      sA = +sA.toFixed(3);
      sPhaseSync = +sPhaseSync.toFixed(3);
      sFenceSync = +sFenceSync.toFixed(3);
      let sQ = [s0, s1, s2, s3];
      for (let i = 0; i < sQ.length; i++) {
        sQ[i] = +sQ[i].toFixed(3);
      }
      console.log(step.quality.toFixed(3), "=", sPhaseSync, sFenceSync, "||", sA, sQ);
      */

      //
      // Pass state to recursive loops (full/partial)
      if (!pointer || reflow) {
        // Emulate page flow: reduce and detect changes
        if (time.st.gate) this.rate(grade, step)
        // NOTE: if rate and atlas don't use the exact same effect
        // i.e. st.pingpong, or st.gate, or nothing, or st.subsub...
        // they negate one anothers changes
        // ...which is often helpful to distribute changes, but not here...
        // so if you don't use medium pingpong, right & consistently
        // they can throttle to 120 or drop to 1, or get stuck permanently at 6
        // ...which INSIDE this.rate, there are 8 more > > > individual paths
      }

      /* // Output Basic:
      if (step.syncFPS === 0 || step.syncFPS) {
        this.atlas(grade, step);
      } else {
        this.transforms(grade, step);
      } */

      //
      // Output Interlaced: load-balancing
      if (step.syncFPS === 0) {
        // Init
        this.atlas(grade, step)
      } else if (!step.syncFPS) {
        // Subframe: secondary effects
        if (time.st.subsub) {
          // !!idle burst good
          this.transforms(grade, step)
        } else {
          // !!idle burst bad
          mpos.ux.render(step.syncFPS)
          // note: render syncs performance deltas (unlike !grade.wait)
          // for example, matrix updates if !document.hasFocus (step.frame, inPolar)
        }
      } else {
        // Major Frame
        // note: pingpong may replace gate, except fast :hover events may get stuck (todo: fix tolerances)
        // ...pingpong here interlaces visually the loads!
        const pp = time.st.pingpong ? 'atlas' : 'transforms'
        this[pp](grade, step)
      }

      /* // WebWorker
      mpvar.worker.postMessage(
        {
          msg: "atlas",
          origin: "worker.js",
          opts: { rect: false }
        },
        []
      ) */
    },
    /**
     * Process texture atlas, from filtered elements
     * @param {Object} grade structure for rectangle elements
     * @param {Object} step sync state
     * @returns
     */
    atlas: function (grade, step = {}) {
      const { tool, fov, cloneX, time } = mpvar
      const { atlas, major } = grade
      let { frame, queue, syncFPS, quality } = step

      // queue next
      if (step.syncFPS === 0) step.queue = new Set(major.atlas.values())
      let index = step.queue.size
      // breakpoints to paint
      step.paint = step.syncFPS === 0 && index >= 24 ? [Math.floor(index * 0.5)] : []

      //console.log("atlas queue", step.queue.size)
      if (!atlas.ctx || !step.queue.size) {
        // catch error: loop no canvas of rebuilt page (relic)
        // set !grade.wait or let modules work (render)
        mpos.step.transforms(grade, step)
        return
      }

      /**
       * Backpropagate: broad queue is rated early, so prune categorical... or bypass (lossy determinism) with flush for holistic reconcile
       * @param {Object} rect element record
       * @returns valid property
       */
      function bprop(rect) {
        let push

        // mat backgrounds are opt-in (under quarantine for contageous properties)
        const shell = rect.minor === 'self' || rect.minor === 'child'

        let inPolar = rect.inPolar + 0.5 >= grade.inPolar // trim + bleed
        if (inPolar) {
          // trim
          inPolar = rect.inPolar >= grade.inPolar

          // TRIM + BLEED:
          // - flush.fuse update qualified textures
          // - basePaint texture

          // proactively ignore most ux.u matrix (rotation or stretching)
          let prop = rect.ux.u.has('tween') || rect.ux.u.has('phase') || (rect.ux.o && !(rect.ux.u.size === 1 && rect.ux.u.has('matrix')))

          // PUSH: prop active, in trim
          // DROP: matrix, in bleed  ...+flushfuse

          // if prop reduce (if not, nothing) general enough
          // ?? major filter/pivot inPolar or prop ??

          // animations oob throttle frequency:
          // drop interpolated keyframes, and push phase/stateOld
          // ... phase/stateOld may be "lost" so ux.o is the next tier... but also includes tween/matrix
          if (prop) push = inPolar || (rect.ux.u.size && !time.st.flush.fuse)
          /*push = inPolar
            ? prop
            : prop && rect.ux.u.has("matrix") && !time.st.flush.fuse;*/
        }
        // mixin 0: FORCE 1st draw
        // mixin 1: REDUCE overdraw (matrix rotation, oob tween)
        // mixin 3: MISC BUFFER?: ++ux.o --self/child

        //
        // first basic state visible: init or new rect
        // step.frame === 0 // reflows (passively ignore)
        // step.syncFPS === 0 // 0 on init or T/F from gate
        // rect.frame === -1 // new element (but css already overwrites)
        // !rect.uv.w === new element (uninitialized, like frame-1)
        const basePaint = step.syncFPS === 0 || !rect.uv.w //&& !(back || step.frame === 0)
        //

        // css bumps ux.o if matrix is significant
        //const whitelist = rect.ux.o;
        // dont basePaint minimal shell, because onLoad draws unstyled container phase
        return push || (!shell && basePaint)
      }

      // Structures for toSVG > Node Options:
      // clone > shallow copy { ...bounds, ...style }
      // 1. per-frame ref (inline): to grade-level props
      // 2. per-node copy: re/sets clone (options)
      // 3. per-node copy: re/sets clone.style
      let {
        inline,
        load: { image, listener }
      } = atlas

      for (const idx of step.queue) {
        const rect = grade.rects.get(idx)

        // trim meta ux: reduce ANY queue of indirect affects!
        if (rect?.uv?.mip && bprop(rect)) {
          const uv = rect.uv
          // toSvg options: reset shallow clone
          let options = { ...inline }
          options.style = { ...cloneX.style }

          //
          // toCanvas options [pixelRatio, width, height] * (fov.dpr * step.quality) // tool.pyr()

          //
          // Feature tests: OOO is delimiting

          //if (!rect.hasOwnProperty("matrix")) //stale frame?
          //if tool.diffs("matrix", { style: rect.css.style }) options.style.transform = "initial"

          if (rect.css && rect.css.style) {
            if (tool.diffs('flow', { rect: rect })) {
              options.style.top = options.style.right = options.style.bottom = options.style.left = 'initial'
            }
          }

          //if (tool.diffs("rect", { rect: rect }))
          if (!rect.el.clientWidth || !rect.el.clientHeight) {
            // force box size
            options.width = rect.bound.box.width
            options.height = rect.bound.box.height
            //options.style.display = "inline-block" // tame pop-in
          }

          // reduce overhead for simple element (unless ghost text..?)
          if (rect.el.childElementCount === 0) options.filter = false

          if (rect.minor === 'self') {
            // isolate background (exclude child elements)
            // todo: types (for sizes, bullets, media sliders...)
            //
            // path 1: hide children to preserve whitespace
            // (options.style {...visibility, ...opacity}) = { visibility: "hidden", opacity: 0 }
            // path 2: filter children to rely on width/height
            options.filter = cloneX.filterSelf
            // reset indeterminate offsets (keyframe, whitespace)
            options.style.animation = ''
            options.style.transform = ''
            //options.style.margin = "";
          }

          toSvg(rect.el, options)
            .then((clone) => {
              // svg is small, lossless file (but canvas supports unique methods)
              image = new Image()
              listener = image.addEventListener('load', (e) => {
                // image referred may be detached
                e.target.removeEventListener('load', listener)

                // if (clone.width === 0 || clone.height === 0) { return; } // no box

                // canvas xy, from top (FIFO nodes)
                let mm = atlas.uv[uv.mip]

                if (uv.w === undefined) {
                  // assign scale
                  const cellsMipMax = ((mm.span / uv.mip) * atlas.cells) / uv.mip // minus 1 slot for keyTest..?

                  // 1. w == mip, but number (shader) not string (key)
                  // 2. mip scale set (treeDeep > setRect > key), but observe inventory
                  if (uv.mip != '+1.00' && cellsMipMax > atlas.uv[uv.mip].idx) {
                    // mip map [?.??]: span index is async/indeterminate
                    uv.w = uv.mip * 1
                    uv.idxMip = atlas.uv[uv.mip].idx++
                  } else {
                    // mip map [1.00]: default fallback
                    uv.w = 1
                    uv.mip = '+1.00'
                    uv.idx = atlas.uv[uv.mip].idx++
                  }

                  // mip spans (key/[?.??]) reserved and offset
                  // note: some mips !=[1.00] keep idxMip with idx, (for easy 0-index span, and layer swap)
                  const idxUVW = uv.w === 1 ? uv.idx : uv.idxMip // idx==0 is falsy!
                  let x, y

                  mm = atlas.uv[uv.mip]
                  if (uv.w === 1) {
                    // mip [1.00] spans: left
                    x = (idxUVW % mm.span) * mm.map
                    y = Math.floor(idxUVW / mm.span) * mm.map
                  } else {
                    // mip [?.??] spans: right
                    // note: avoid [0.00] and fractional span sums
                    const xColumn = atlas.uv['+1.00'].map * mm.xColumn
                    x = xColumn + (idxUVW % (mm.span / uv.mip)) * mm.map
                    y = Math.floor(idxUVW / (mm.span / uv.mip)) * mm.map
                  }
                  // canvas bitwise rounding
                  x = (0.5 + x) | 0
                  y = (0.5 + y) | 0

                  uv.x = x
                  uv.y = y

                  // shader xy (at bottom, +0.0001 from edge)
                  uv.wX = (0.0001 + x) / atlas.size
                  uv.wY = (0.0001 + y + mm.map) / atlas.size
                }

                atlas.ctx.clearRect(uv.x, uv.y, mm.map, mm.map)
                atlas.ctx.drawImage(e.target, uv.x, uv.y, mm.map, mm.map)

                // unload while replaced
                e.target.src = 'data:,'
                e.target.remove()
              })

              //github.com/bubkoo/html-to-image/pull/146
              // v1.7.0 viewBox breaks SVG on Firefox (...brittle hack!)
              image.src = clone.replace('viewBox%3D', 'preserveAspectRatio%3D%22none%22%20viewBox%3D')
              options = clone = null
            })
            .catch((error) => {
              // bad image source or type, or unexpected content (xml load/unload)
              // or sync caught a rect being unloaded
              //console.log("source error:", error);
            })
            .finally(next)
        } else {
          // reflow was minor...?
          next()
        }
      }

      /**
       * queue next, breakpoint or complete
       */
      function next() {
        const paint = step.paint.indexOf(index) > -1
        index--
        if (paint || index === 0) {
          mpos.step.transforms(grade, step, paint)
        }
      }
    },
    /**
     * Process geometry matrix, texture, and event targets
     * @param {Object} grade structure for rectangle elements
     * @param {Object} step sync state
     * @param {boolean} paint atlas breakpoint
     */
    transforms: function (grade, step, paint) {
      const { atlas, major, rects } = grade
      const { frame, queue, syncFPS } = step
      const { time, tool } = mpvar

      //console.log("step.queue", step.syncFPS, step.queue.size);

      //
      // Proceed with internal updates (meshes, raycast) before render
      // note: syncFPS===0 is call from mod.add (versus reflow:pointer)

      //
      // Raycast whitelist (atlas/other): ux targets from inPolar (not reflow)
      // [targets] ?: [atlas/other] :: rect.el[dataIdx] :: synthetic dispatch
      // [atlas/other] ?: instanceId / Mesh.userData.el
      // dispatch event: { rect: {...el}, uv: {...xy}, ...dataIdx }
      const targets = []
      /**
       * Backpropagate: broad queue is rated early, so prune categorical... or bypass (lossy determinism) with flush for holistic reconcile
       * @param {Object} rect element record
       * @returns valid property
       */
      function bprop(rect) {
        // note: inPolar gates rate (and push_back), but also flush ux detached after loss (scrolling, collapsing...)
        return step.frame === 0 || rect.frame < 0 || queue.has(rect.idx) || !time.st.flush.fuse
      }

      //time.st.pingpong?
      if (!paint) {
        //
        // Update major.other (loader) mesh
        //grade.scroll = { x: window.scrollX, y: window.scrollY }
        for (const [count, idx] of major.other) {
          const rect = rects.get(idx)
          const rate = bprop(rect) //|| rect.minor === "wire";

          let scroll = rect.fix ? { x: 0, y: 0, fix: true } : false
          const newBox = rate && mpos.set.box(rect, { scroll: scroll, frame: frame })

          // Object3D loaded (rect.add>2, !detached, ?cached)
          if (rect.obj) {
            if (newBox) mpos.set.use(rect.obj) // || rect.obj.animate

            if (!newBox) {
              //console.log("!newBox other")
            }

            // raycast whitelist data-idx
            targets.push('r_idx_' + rect.idx)

            // update visibility
            // note: off-screen Mesh has no third material visibility state (unlike instancedMesh), so it "appears" more
            const vis = rect.fix ? true : rect.inPolar + 0.5 >= grade.inPolar
            rect.obj.visible = vis
            //if ( rect.add === 3 ) rect.add = 4
            //( while rect.obj.children.length-- ) {} // subgroups

            //
            // Update Animated Gif
            const keyframes = rect.obj.animate
            if (vis && keyframes?.gif /* && fps? */) {
              let { gif, duration, gifCtx /*, tempCtx, frameImageData*/ } = keyframes

              // seek elapsed time frame
              const relative = time.sFence.oldTime % duration
              let index,
                elapsed = 0
              for (let i = 0; i < gif.length; i++) {
                elapsed += gif[i].delay
                if (elapsed >= relative) {
                  index = i
                  break
                }
              }

              // draw from cache
              const cache = gif[index].cache
              gifCtx.drawImage(cache, 0, 0, gifCtx.canvas.width, gifCtx.canvas.height)

              // Effect Manipulation..?
              //matt-way.github.io/gifuct-js/javascripts/main.js

              // Update THREE
              rect.obj.material[4].map.needsUpdate = true
            }
          }
        }
      }

      //
      // Update major.atlas (shader) instance
      const instanced = atlas.instanced
      const color = new THREE.Color()
      let newBox, newRGB, newUVW
      //console.log("queue", queue);

      for (const [count, idx] of major.atlas) {
        const rect = rects.get(idx)
        const rate = bprop(idx)

        if (!rect) {
          // TODO: possibly rect.el could be replaced __?
          // TODO: notify instanced count of removal/absence of element/key
          //newBox = true;
          //ontinue;
          //if (!time.st.flush.fuse) newBox = true
        }

        const inPolar = rect.inPolar + 0.5 >= grade.inPolar // bleed+0.5 makes safe area

        //let dummy = rate //|| rect.ux.u.has("matrix");
        if (rate || inPolar) {
          // oob: boxes still MOVE beyond visible viewport (inPolar)... but EFFECTS degrade!
          newBox = mpos.set.box(rect, { frame: frame })
          if (newBox) instanced.setMatrixAt(count, newBox.matrix)
          //newBox = dummy;
          // ... maybe UX PHASE could INHERIT a MATRIX,
          // but if RATE changes CAPTURE, it should be THOROUGH
        }

        //
        // Primitive feature differ (backgroundColor)
        // todo: ad-hoc flags (clipping scroll, linked:toolgroup, catmull metaballs)

        if (inPolar && (rect.ux.u.has('tween') || rect.ux.u.has('phase'))) {
          // Instance color phase (pre/post)
          let oldRGB = new THREE.Color()
          if (instanced.instanceColor) instanced.getColorAt(count, oldRGB)

          // parse string and branch
          const style = rect.css.style || rect.el.style
          let bg = style.backgroundColor
          let rgba = bg.replace(/[(rgba )]/g, '').split(',')
          const alpha = rgba[3]
          if (!alpha || alpha > 0.1) {
            // color (no alpha channel)
            color.setRGB(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255)
          } else {
            // hidden: dom default, or user-specified
            color.setStyle('cyan')
          }

          // differ colors update
          const equalColor = tool.eq(oldRGB, { diff: color, deep: true })
          if (!equalColor) {
            instanced.setColorAt(count, color)
            newRGB = true
          }
        }

        //
        // Update atlas uv and visibility
        let vis = -1
        let x, y, z
        const uv = rect.uv
        if (rate || inPolar) {
          //|| rect.ux.u.size || rect.ux.o
          newUVW = true
          if (uv || rect.minor === 'self') {
            // rated structure/hierarchy crossed boundary
            if (uv && inPolar) {
              x = uv.wX
              y = 1 - uv.wY
              z = uv.w
            } else if (inPolar || grade.inPolar > 3.5) {
              // oob: partial update (idle/stale) from reflow delay?
              x = atlas.keyTest.x
              y = 1 - atlas.keyTest.y
            }
            // note: count2++ here (not atlas.size) to reduce count of instance geometry
            // ...a pain to raycast (by index), but limits geometry to viewport
          }

          // update material: if DOM manipualted, may bleed or overdraw
          atlas.uvOffset.setXY(count, x || vis, y || vis)
          atlas.uvOffset.setZ(count, z || 1)
        }

        // Raycast whitelist [instanceId]
        if (uv && inPolar /*&& rect.minor !== "self"*/) {
          // note: event/raycast is strongly bound (like capture/bubble)
          // propagation quirks are thrown further by curating hierarchy (mat.self)
          targets.push(Number(count))
          //targets: { instanceId: 0, dataIdx: 0, ...rect, ...uv }
        }
      }

      //
      // Commit Updates
      if (newBox) {
        instanced.count = major.atlas.size
        mpos.set.use(instanced)
      }
      if (newRGB) instanced.instanceColor.needsUpdate = true
      if (newUVW) atlas.uvOffset.needsUpdate = true // RawShaderMaterial attributes

      if (!paint) {
        // transforms done (not atlas queue breakpoint)
        const target = mpos.ux.events.target
        target.clear()
        targets.forEach((item) => target.add(item))
        //grade.wait = false; // in render(gate)
      }

      // SyncFPS feedback loop
      const gate = paint ? false : syncFPS
      mpos.ux.render(gate)
      // ...no await
    }
  },
  ux: {
    timers: {
      reflow: [],
      delay: [],
      clear: function (key) {
        const timers = this[key]
        for (let i = timers.length - 1; i >= 0; i--) {
          clearTimeout(timers[i])
          timers[i] = null
          timers.splice(i, 1)
        }
      }
    },
    events: { target: new Set(), synthetic: {}, raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2() },
    /**
     * Enqueue pointers to sync, from update types
     * @param {Event} e Event-like pointer
     */
    reflow: function (e) {
      const { ux, step } = mpos
      const { grade, opt } = mpvar
      if (!grade) {
        return
      }
      const queue = grade.major.queue

      function enqueue(pointer) {
        // update current queue
        queue.add(pointer)

        // debounce concurrent: pools greedily (with influence to lower fps)
        // avoid: duplicate, stale frames (debounce >= delay)
        // pingpong: effective framerate is 15-30fps (not 120fps of opt.delay)
        const debounce = pointer === 'delay' ? Math.min(e.value * 2, 1 / 15) : 1 / 45
        requestIdleCallback(
          (deadline) => {
            // add unique
            // deadline.didTimeout happens a lot, (i.e. reflow from scroll with no delay)
            // const reduceQuality = !(deadline.didTimeout && pointer==="delay")
            if (queue.size) step.sync(grade, pointer)
          },
          { timeout: debounce }
        )

        if (pointer === 'delay') {
          // immediate schedule, unless manually called -1
          if (e.value > 0) {
            // schedule next frame (but 0 doesnt, and -1 clears without update)
            ux.reflow({ type: e.type, value: e.value })
          }

          // NOTE on PingPong Smoothing (Rate vs Quality):
          // if step.sync goes here without debounce,
          // framesync/align has less 1:all poll metrics,
          // and pingpongs 0/30fps, with sluggish late textures
          // ...BUT...
          // debounce (adaptive) framerate may DROP frames (with many LARGE textures)
          // and overall seems more fresh/current
          // and UX (:hover, native) boosts texture priority for FPS canvas
        }
      }

      if (e.isIntersecting) {
        // enqueue visible element
        const pointer = e.target.getAttribute('data-idx')
        enqueue(pointer)
      } else {
        // event schedule or throttle
        const [timer, timeout] = e.type === 'delay' ? ['delay', e.value] : ['reflow', 1 / 30]

        // if delay invoked, update access at gui opt
        // note: don't overwrite so render can restore after sleep
        //if(timer === "delay" && timeout !== mpvar.opt.delay) mpvar.opt.delay = timeout

        ux.timers.clear(timer)
        if (e.value === -1) {
          // user can clear a timer...?
          return
        }

        ux.timers[timer].push(
          setTimeout(() => {
            const { opt, fov, camera, controls, renderer, rendererCSS } = mpvar
            // setTimeout is global scope, so strictly re-declare mpvar

            if (e.type === 'resize') {
              // ...recalculate inPolar and update?
              const container = renderer.domElement.parentElement
              fov.width = container.offsetWidth
              fov.height = container.offsetHeight

              camera.aspect = fov.width / fov.height

              if ((camera.type = 'OrthographicCamera')) {
                camera.left = fov.width / -2
                camera.right = fov.width / 2
                camera.top = fov.height / 2
                camera.bottom = fov.height / -2

                camera.position.x = window.innerWidth / 2
              }

              camera.updateProjectionMatrix()
              controls.update()

              renderer.setSize(fov.width, fov.height)
              rendererCSS.setSize(fov.width, fov.height)

              mpos.ux.render()
            } else {
              let pointer = e.type
              if (e.type === 'scroll') {
                // update visibility?
                pointer = opt.inPolar > 3 ? 'trim' : 'move'
              }
              enqueue(pointer)
            }
          }, timeout)
        )
      }
    },
    /**
     * Render and update time/performance
     * @param {*} gate frame sync
     * @returns {boolean} frame idle
     */
    render: function (gate) {
      const { grade, mat_shader, scene, camera, renderer, rendererCSS, tool, time, cache, opt } = mpvar

      if (!document.hasFocus()) {
        // prevent framerate spikes on focus loss

        time.slow = 0.25 // ratio to reduce fps/dpr
        const seek = 1000 * time.slow // ~4fps--
        const stop = parseInt(renderer.info.render.frame / seek) + 1
        if (stop < 40) {
          // 1. reduce dpr
          renderer.setPixelRatio(time.slow)

          // 2. reduce fps (after load x frames)
          const delay = stop * seek
          if (opt.delay) {
            // nonzero delay ignored
            //console.log("slow", delay);
            mpos.ux.reflow({ type: 'delay', value: delay })
          }
        } else {
          //console.log("sleep");
          // 3. drop frame excess (load, blur, dev console...)
          return
        }
      } else if (time.slow) {
        // restore... delay from opts?
        console.log('wake')
        time.slow = false
        // restore dpr
        renderer.setPixelRatio(1) // or tool.dpr()
        mpos.ux.reflow({ type: 'delay', value: opt.delay })
      }

      //
      // Sync Boundary: junction of mapcontrols and transform updates
      const slice = time.sFenceFPS_slice

      if (gate !== undefined) {
        // undefined : lambda
        // true/false : syncFPS && !paint
        // 0 : reflow pointer
        // {type:change} : scene Controls

        grade.wait = false
        if (gate === true || gate === false) {
          // - branch of transform queue (from sync>rate)
          // - if gate falsy, stale closure may FAIL (subsub)
          slice.gate = gate ? false : 0
        } else if (gate.type === 'change' && time.st.pingpong) {
          // THREE.Controls events (pan/zoom, scripted) guard like reflow
          // note: return partials or updates may be jarring
          // note: abort non-recursive render (delay==0), breaks ux feedback state (rect.frame >= grade.frame)
        }
      }

      //
      // Framerate Limit: elapsed time exceeds delta
      time.sFenceDelta += time.sFence.getDelta()
      const syncFPS = time.sFenceDelta > time.sFenceFPS
      if (syncFPS) {
        // align frame reset
        slice.gate = true
        slice.ramp = 0

        //
        // Framerate Monitor: Forward Performance Trail
        //
        // Render calls are non-contiguous (time), and slice boundaries are non-continuous (gate).
        // - syncFPS power: notional resolution of slice indicates lossiness
        // - boundary: time slice composed of gate and 1+ ramp
        // - gate: notional fps (expected measure) ..||.|:..
        // - ramp: subframes from render lambda (undebounced script, reflow, controls pan/zoom...)
        // - sma.average: indicator of continuous frames (low is better)
        //
        // Avoid lag, prevent it!
        // - mixin: sFenceSync < -1.5 || boundary > 2 || sma > 16
        // - branch: rebalance task load (gc, re-build atlas...)
        // - modulate: compare and shift dense fault periods
        //

        const sma = Math.floor(time.sFenceDelta / time.sFenceFPS) // Math.floor(.6/.3)
        slice.boundary += 2 * sma - 1 // fast [0-1], slow [8-16+]

        if (slice.boundary > 30) {
          // reset accumulator (truncate outliers)
          slice.sma.count /= 2
          slice.boundary = 1
        }
        tool.eq(sma, { avg: slice.sma })

        //stackoverflow.com/questions/11285065/#answer-51942991
        time.sFenceDelta %= time.sFenceFPS

        //
        const flush = time.st.flush
        const fuse = Date.now()
        if (flush.fuse && flush.fuse <= fuse) {
          // !flush aligns on gate to offer routine access,
          // so delayed scheduler is !not idempotent
          flush.fuse = 0
        } else if (flush.fuse <= 0) {
          flush.fuse = fuse + 1000 // 1 seconds?
        }
      }

      // range [1-4+] guarded on reflow, not granular events
      slice.ramp++
      //console.log(slice.boundary, slice.ramp, slice.sma.average)
      // [1,33,4,3,16,1], [4,2,1,1,3,1], [32,4,8,12,8,16]

      //
      // Time Slice Decorators: used in sync loop to reduce update queue!!1
      time.st.gate = syncFPS // (FIFO) render time measure: ground truth
      time.st.subsub = slice.boundary <= 7 && slice.ramp < 2 // (Batch) idle: !!burst
      time.st.pingpong = (syncFPS && time.st.subsub) || (slice.sma.average <= 15 && time.sFenceSync < -1.5) // (Round robin) gate or slice is stable: !!50% load balance

      const obr = cache.get('onBeforeRender')
      if (time.st.pingpong) {
        // note: scope (pingpong) TESTS private time sequences (obr vs internal)

        //
        // Subscribed Callbacks: scheduler assumes lossy idempotence
        if (obr) {
          // todo: no xhr pollute
          // todo: maximum call stack blocks texture update (i.e. Controls.target.lerp)?
          Object.values(obr).forEach((callback) => {
            if (typeof callback === 'function') callback()
          })
        }
      }

      //
      // Non-critical Routines
      if (grade) {
        // animation step
        grade.group.traverse((obj) => {
          if (obj.animate) {
            if (obj.animate === true) {
              const animationTime = Date.now() / 500
              // wiggle document root
              obj.rotation.x = Math.sin(animationTime) * 3.14 * (Math.PI / 180)
              obj.rotation.y = Math.cos(animationTime) * 3.14 * (Math.PI / 180)
              //obj.position.z = -9;
            } else if (obj.animate.gif) {
              // refresh SuperGif
              //obj.material.map.needsUpdate = true
            }
          }
        })

        // lazy update (not always from controls raycast)
        tool.dpr()
      }

      if (time.st.gate || gate === 0) {
        // update RawShaderMaterial atlas instances
        const texture = mat_shader.userData.t
        if (texture) texture.needsUpdate = true
        //instanced.instanceColor.needsUpdate = true

        //
        // Compose Scene Effects
        scene.updateMatrixWorld()
        renderer.render(scene, camera)
        rendererCSS.render(scene, camera)

        stats.update()
      }

      //requestAnimationFrame(this)
    },
    /**
     * Event propagation to target (idx of rect.major), and bubble delegate
     * @param {Event} e event
     * @returns {Object} target for dispatch
     */
    raycast: function (e) {
      const { grade, camera, caret, time, tool } = mpvar
      let synthetic = {}
      // note: update queue > transforms > inPolar > events.target[] > raycast (group > layer 2)
      if (grade && grade.wait !== Infinity) {
        const events = mpos.ux.events
        events.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        events.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1

        events.raycaster.setFromCamera(events.pointer, camera)
        let intersects = events.raycaster.intersectObjects(grade.group.children, false)
        intersects = intersects.filter((hit) => {
          const useId = hit.object.isInstancedMesh
          const target = useId ? hit.instanceId : 'r_idx_' + hit.object.userData.idx

          // todo: align userDatas idx for atlas to map instanceId
          // ...so rects[...hit.idx]
          // PRO: consistent (atlas/other), fewer lookup, ensure key/index position
          // CON: another list, another data-idx record, per-frame vs on-demand

          return events.target.has(target)
        })

        //
        // Synthetic Event: bottom phase (Native and Three)
        if (intersects.length) {
          const hit = intersects[0]

          //console.log("hit", hit)
          const useId = hit.object.isInstancedMesh

          //time.st.pingpong && tool.dpr(hit.distance)

          //
          //if (hit.object) {
          // Synthetic Dispatch Event
          // Set lacks array index:idx for atlas instanced element... map keeps an extra reference... array can be fine (if slower?)
          const rect = useId ? grade.rects.get(grade.major.atlas.get(hit.instanceId)) : grade.rects.get(hit.object.userData.idx)
          synthetic = { rect: rect, uv: hit.uv }

          //
          // minimap debug
          caret.title = rect.idx + rect.el.nodeName
          const caretROI = caret.style
          // visibility
          const color = rect.inPolar > 3 ? 'rgba(0,255,0,0.33)' : 'rgba(255,0,0,0.33)'
          caretROI.backgroundColor = color
          // location
          if (rect.uv.hasOwnProperty('w')) {
            const cell = 100 * (1 / grade.atlas.cells) * rect.uv.w
            caretROI.width = caretROI.height = cell + '%'
            caretROI.left = 100 * rect.uv.wX + '%'
            caretROI.bottom = 100 * (1 - rect.uv.wY) + '%'
            caretROI.right = 'inherit'
          } else {
            // structural mat.minor==="child"
            //caretROI.width = "100%";
            caretROI.backgroundColor = 'transparent'
            caretROI.left = caretROI.bottom = 'inherit'
            caretROI.right = 0
          }
          // }
        } else {
          // synthetic = synthetic[delay.length-1]
          // todo: use last events within timerange or proximity?
          // todo: fallback events for special interactions
        }

        // preserve last user event
        events.synthetic = synthetic
      }
      return synthetic
    },
    /**
     * Synthetic event dispatch, inferred by raycaster target phase (parallel to queue)
     * @param {{type:PointerEvent}} e pointer events (click, pointerdown, pointermove)
     * @returns {boolean} filter inert events
     */
    event: function (e) {
      // todo: synchronize trailing/current click-target... and multi-sample ray area?
      const { rect, uv } = mpos.ux.raycast(e)
      let uxPass = !rect || !uv,
        uxLoss
      const { controls, time } = mpvar

      if (!uxPass) {
        //
        // Class of behavior pattern: abort if nothing, throttle (...unless something?)

        // indirect activity (cursor trails in/out phase)
        const uxPure = e.type === 'pointermove' && !rect.ux.u.has('phase')
        // indeterminate motion path
        const uxIdle = e.type === 'pointermove' && !rect.ux.u.size && !time.st.pingpong
        // interactive object
        const uxDeep = rect.minor === 'native' && (rect.ux.u.size || rect.ux.o > 1)
        if (uxDeep) controls.enablePan = false // pointerdown/pointermove are now -1

        // moderate contageous effects
        uxLoss = !uxDeep && (uxPure || uxIdle)
      }

      //console.log("uxRaw", e.type, rect, uxPass, uxLoss)
      if (uxPass || uxLoss) {
        // prevent and recover from flood!
        controls.enablePan = true
        return
      }

      //github.com/mrdoob/three.js/blob/dev/examples/jsm/interactive/HTMLMesh.js#L512C1-L563C2
      //  -+  ++  //  --  +-  //
      //    uv    //    xy    //
      //  --  +-  //  -+  ++  //

      // Element at raycast position
      const element = rect.el
      // position of UV on ShaderMaterial
      const uvX = rect.bound.box.width * uv.x
      const uvY = rect.bound.box.height * (1 - uv.y)

      // Position on Window: target is element (uv/xy), per depth of mpos,
      // but native element may expect (complex, granular) behavior
      const style = rect.css.style || rect.el.style
      const position = style.position || 'auto'
      const [scrollX, scrollY] = position === 'fixed' ? [0, 0] : [window.scrollX, window.scrollY]
      //todo: no perspective correction
      const x = uvX + rect.bound.left //+ scrollX;
      const y = uvY + rect.bound.top //+ scrollY;

      //console.log("element uv", uvX, uvY, "window", x, y)

      //
      // Event Candidate(s) to emit
      let emit
      const kapturoo = mpvar.grade.el
      const bubklist = '[data-engine^=three], section#mp, .lil-gui'
      const emits = document.elementsFromPoint(x, y).filter((el) => {
        // note: event bubbles on root may wander in inauthentic dev environment
        // affects: position fixed/static; sandboxed window offset;
        // example: ELEMENT xy may be BEHIND a BORK BUTTON, and SEND EVENT
        return kapturoo.contains(el) && !el.matches(bubklist) // html, body...
      })

      if (emits.length) {
        // NodeWalking...
        emit = emits[0]
      } else {
        // note: target quirk (scroll, overflow) from element queue (inPolar, viewport)
        // affects: bounding rect subordinate to visibility threshold
        // example: app-level imposed (filters/group); frame (miss/buffer); delay (touchstart/drag/click); user-agent media rejection;
        console.log('oob emit target')
      }
      //console.log("event emits", e.type, emit || element);

      // Synthetic Event
      const MouseEventInit = { view: element.ownerDocument.defaultView, bubbles: true, cancelable: true }

      // Synthetic Propagate: delegate quirks (e.relatedTarget, xyz <= parent, nodeType==widget)
      let NodeWalker
      if (emit) {
        // Dispatch Specific: pageX, screenX, clientX
        MouseEventInit.screenX = x + scrollX
        MouseEventInit.screenY = y + scrollY
        NodeWalker = emit
      } else {
        // Dispatch General
        MouseEventInit.offsetX = uvX + scrollX
        MouseEventInit.offsetY = uvY + scrollY
        NodeWalker = element
      }

      //
      // Event Dispatch
      const event = new PointerEvent(e.type, MouseEventInit)
      NodeWalker.dispatchEvent(event)
      //console.log(rect, uv, emits, NodeWalker)
    }
  }
}

window.mpvar = mpvar
window.mpos = mpos
export { mpos, mpvar }
