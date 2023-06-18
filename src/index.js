import mpos from './mpos.js'

mpos.gen()
mpos.init()
window.onload = function () {
  mpos.add.dom().then(function (group) {
    console.log('group', group)
  })
}
