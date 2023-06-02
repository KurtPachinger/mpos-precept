import './styles.scss'
import mpos from './mpos.js'

mpos.init()
mpos.gen()
window.onload = mpos.add
  .dom()
  .then(mpos.ux.render)
  .catch((e) => console.log('err', e))
