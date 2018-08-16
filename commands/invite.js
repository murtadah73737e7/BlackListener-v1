const f = require('string-format')
const util = require('../util')

module.exports = async function(msg, lang) {
  const s = await util.exists('./secret.json5') ? require('../secret.json5') : require('../travis.json5')
  return msg.channel.send(f(lang.invite_bot, s.inviteme))
}
