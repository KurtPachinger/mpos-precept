import './styles.scss'
import mpos from './mpos.js'

mpos.gen()
mpos.init()
document.onload = mpos.add
  .dom()
  .then(mpos.ux.render)
  .catch((e) => console.log('err', e))
