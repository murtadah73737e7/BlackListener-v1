const config = require(__dirname + '/../config.yml')
const ytdl = require('ytdl-core')
const logger = require(__dirname + '/../logger').getLogger('commands:music')
const isNumber = (n) => !isNaN(parseFloat(n)) && isFinite(n)
const f = require('string-format')
const { Command } = require('../core')
const YouTube = require('youtube-node')
const youtube = new YouTube()
const util = require('util')
const queue = {}
const playing = {}
const loop = {}
const play = (connection, url, msg) => {
  const stream = ytdl(url, { filter : 'audioonly' })
  loop[msg.guild.id] = {}
  playing[msg.guild.id] = url
  return connection.playStream(stream, { seek: 0, volume: 1 }) // oldvalue: 0.1
}

module.exports = class extends Command {
  constructor() {
    const opts = {
      args: [
        'play|start <URL or Search>',
        'stop',
        'pause',
        'unpause|resume',
        'volume',
        'loop',
        'queue',
        'status',
      ],
      alias: [
        'play',
      ],
    }
    super('music', opts)
  }

  async run(msg, settings, lang, args) {
    if (!config.patron) { return msg.channel.send(lang._not_patron) }
    if (!msg.member.voiceChannel) return msg.channel.send(lang.COMMAND_MUSIC_NOT_JOINED_VC)
    loop[msg.guild.id] = {} // need initialize!
    if (args[1] === 'join') {
      msg.member.voiceChannel.join().then(vc => msg.channel.send(f(lang.COMMAND_MUSIC_JOINED_VC, vc.channel.name))).catch(e => logger.error(e))
    } else if (args[1] === 'play' || args[1] === 'start') {
      let keyword
      if (!args[2] || !args[2].includes('youtube.com/watch?v=')) {
        youtube.setKey(config.youtube_apikey)
        const search = util.promisify(youtube.search)
        const { items } = await search(args.slice(2).join(' '), 1).catch(e => logger.error(e))
        keyword = args.slice(2).join(' ')
        args[2] = 'https://youtube.com/watch?v=' + items[0].id.videoId // Oh no, this is (really) not a good!
      }
      msg.member.voiceChannel.join()
        .then(async connection => {
          if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed) {
            if (loop[msg.guild.id].enabled) return msg.channel.send(lang.COMMAND_MUSIC_CANTADD_LOOP_ENABLED)
            if (!queue[msg.guild.id]) queue[msg.guild.id] = []
            queue[msg.guild.id].push(args[2])
            msg.channel.send(f(lang.COMMAND_MUSIC_QUEUE_ADDED, args[2]))
            if (keyword) msg.channel.send('Search keyword: ' + keyword)
          } else {
            play(connection, args[2], msg)
            msg.channel.send(f(lang.COMMAND_MUSIC_PLAYING, args[2]))
            if (keyword) msg.channel.send('Search keyword: ' + keyword)
          }
          if (msg.deletable) msg.delete()
          const endHandler = async () => {
            const q = queue[msg.guild.id]
            if (q && (q ? q.length : false) && !loop[msg.guild.id].enabled) { // if queue is *not* empty and not enabled loop
              play(connection, q[0], msg)
              msg.channel.send(f(lang.COMMAND_MUSIC_PLAYING_QUEUE, q[0]))
              queue[msg.guild.id] = queue[msg.guild.id].slice(1)
            } else { // if queue is empty or enabled looping
              if (!loop[msg.guild.id].enabled && !loop[msg.guild.id].every) { // loop is disabled
                msg.channel.send(lang.COMMAND_MUSIC_ENDED)
                if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher)
                  msg.guild.voiceConnection.dispatcher.removeListener('end', endHandler)
              } else { // loop is enabled
                if (loop[msg.guild.id].every) {
                  const seconds = parseInt(loop[msg.guild.id].every.replace(/\D{1,}/gm, '')) * 60
                  setTimeout(() => {
                    play(connection, args[2], msg)
                  }, seconds * 1000)
                } else {
                  play(connection, args[2], msg)
                }
              }
            }
          }
          msg.guild.voiceConnection.dispatcher.on('end', endHandler)
        })
    } else if (args[1] === 'volume') {
      if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed) {
        const before = msg.guild.voiceConnection.dispatcher.volume
        if (!isNumber(args[2])) return msg.channel.send(lang._invalid_args)
        msg.guild.voiceConnection.dispatcher.setVolume(parseInt(args[2]) / 100)
        const emoji = before * 100 <= parseInt(args[2]) ? ':loud_sound:' : ':sound:'
        msg.channel.send(f(emoji + lang.COMMAND_MUSIC_CHANGED_VOLUME, before * 100, parseInt(args[2]))) // oldvalue: 100
      } else return msg.channel.send(lang.COMMAND_MUSIC_NOT_PLAYING)
    } else if (args[1] === 'skip') {
      if (!loop[msg.guild.id].enabled && msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed) {
        msg.guild.voiceConnection.dispatcher.end() // Just stop the music and send end event, and play queue.
      } else return msg.channel.send(lang.COMMAND_MUSIC_NOT_PLAYING + ' ...or enabled loop.')
    } else if (args[1] === 'stop') {
      queue[msg.guild.id] = []
      if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed) {
        msg.guild.voiceConnection.dispatcher.destroy() // destroy.
        if (msg.guild.me.voiceChannel && msg.guild.me.voiceChannel.connection) msg.guild.me.voiceChannel.connection.disconnect()
        msg.channel.send(':wave:')
      } else return msg.channel.send(lang.COMMAND_MUSIC_NOT_PLAYING)
    } else if (args[1] === 'loop') {
      Object.assign({[msg.guild.id]: []}, queue)
      //queue.push({[msg.guild.id]: []})
      if (args[2] === 'disable') {
        loop[msg.guild.id].every = null
        loop[msg.guild.id].enabled = false
        msg.channel.send(lang.COMMAND_MUSIC_DISABLED_LOOPING)
      } else {
        if (args[2] === 'every') {
          if (args[3] === 'clear') return loop[msg.guild.id].every = null
          if (!/\d{1,}m/gm.test(args[3])) return msg.channel.send(lang._invalid_args)
          loop[msg.guild.id].enabled = true
          loop[msg.guild.id].every = args[3]
          msg.channel.send(f(lang.COMMAND_MUSIC_LOOP_EVERY, args[3]))
        } else {
          loop[msg.guild.id].enabled = loop[msg.guild.id].enabled ? false : true
          msg.channel.send(f(lang.COMMAND_MUSIC_ONE_MUSIC_LOOP, loop[msg.guild.id].enabled ? lang.COMMAND_MUSIC_ENABLED : lang.COMMAND_MUSIC_DISABLED))
        }
      }
    } else if (args[1] === 'pause') {
      if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed) {
        msg.guild.voiceConnection.dispatcher.pause()
        msg.channel.send(lang.COMMAND_MUSIC_PAUSED)
      } else msg.channel.send(lang.COMMAND_MUSIC_NOT_PLAYING)
    } else if (args[1] === 'unpause' || args[1] === 'resume') {
      if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed) {
        msg.guild.voiceConnection.dispatcher.resume()
        msg.channel.send(lang.COMMAND_MUSIC_UNPAUSED)
      } else msg.channel.send(lang.COMMAND_MUSIC_NOT_PLAYING)
    } else if (args[1] === 'queue') {
      msg.channel.send(f(lang.COMMAND_MUSIC_QUEUE_COUNT, queue.length))
      if (args[2] === 'clear') {
        queue[msg.guild.id] = []
        return msg.channel.send(lang.COMMAND_MUSIC_CLEARED_QUEUE)
      } else if (args[2] === 'reactivate') {
        return msg.channel.send(f('You need to type this: ```\n{0}music stop\n{0}music play https://www.youtube.com/watch?v=jhFDyDgMVUI\n```', settings.prefix))
      }
      const queues = queue[msg.guild.id] ? queue[msg.guild.id].map((e, i) => `${i}: ${e}`) : []
      if (queues.length) msg.channel.send(queues.join('\n'))
    } else if (args[1] === 'status') {
      if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && !msg.guild.voiceConnection.dispatcher.destroyed && playing[msg.guild.id]) msg.channel.send(f(lang.COMMAND_MUSIC_NOW_PLAYING, playing[msg.guild.id]))
      else msg.channel.send(lang.COMMAND_MUSIC_NOT_PLAYING)
    } else msg.channel.send(lang._invalid_args)
  }
}
