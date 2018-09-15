const Discord = require('discord.js')
const f = require('string-format')

module.exports.args = ['<ja/en>']

module.exports.name = 'language'

module.exports.isAllowed = msg => {
  return msg.member.hasPermission(8)
}

module.exports.run = async function(msg, settings, lang) {
  const args = msg.content.replace(settings.prefix, '').split(' ')
  if (!args[1] || args[1] === 'help') {
    const embed = new Discord.RichEmbed()
      .setTitle(lang.availablelang)
      .addField(':flag_jp: Japanese - 日本語', 'ja')
      .addField(':flag_us: English - English', 'en')
    msg.channel.send(embed)
  } else if (args[1] === 'en' || args[1] === 'ja') {
    settings.language = args[1]
    await msg.channel.send(f(lang.setconfig, 'language'))
  }
}
