import mpos from './mpos.js'

mpos.init()
mpos.gen()
mpos.add.dom().then(function (group) {
  console.log('group', group)
})
